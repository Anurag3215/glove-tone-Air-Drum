"""
CHORDS CONTROLLER - Chord-Based MIDI Keyboard
Refactored for modular architecture
Left Hand: Minor Chords, Right Hand: Major Chords
Both hands play chords independently on separate MIDI channels
CORRECTED VERSION - Fixed calibration to accept baseline dicts
"""

import time
import math
import mido
from mido import Message

# ============================================================================
# CONFIGURATION
# ============================================================================

# Flex sensor thresholds (ADC value below = bent)
FLEX_THRESHOLDS = {
    'thumb': 500,
    'index': 200,
    'middle': 600,
    'ring': 600,
    'pinky': 600
}

# IMU gesture thresholds (radians)
PITCH_UP_THRESHOLD = 0.5
PITCH_DOWN_THRESHOLD = -0.5
ROLL_RIGHT_THRESHOLD = 0.7
ROLL_LEFT_THRESHOLD = -0.7

# Debounce settings
DEBOUNCE_TIME = 0.05
OCTAVE_CHANGE_COOLDOWN = 1.0

# Chord definitions (intervals from root note)
MAJOR_CHORD = [0, 4, 7]        # Root, Major 3rd, Perfect 5th
MINOR_CHORD = [0, 3, 7]        # Root, Minor 3rd, Perfect 5th

# Note mappings (MIDI note offsets within octave)
NOTE_OFFSETS = {
    'normal': [0, 2, 4, 5, 7],      # C, D, E, F, G
    'sharp': [1, 3, 6, 8, 10],      # C#, D#, F#, G#, A#
    'low': [9, 11, 0, 2, 4]         # A, B, C, D, E
}

NOTE_NAMES = {
    'normal': ['C', 'D', 'E', 'F', 'G'],
    'sharp': ['C#', 'D#', 'F#', 'G#', 'A#'],
    'low': ['A', 'B', 'C', 'D', 'E']
}

# ============================================================================
# STATE MANAGEMENT
# ============================================================================

class HandState:
    """State management for a single hand with chord capabilities"""
    
    def __init__(self, hand_name, is_right_hand, midi_channel):
        self.hand_name = hand_name
        self.is_right_hand = is_right_hand
        self.midi_channel = midi_channel
        
        # Calibration
        self.pitch_calibration = 0.0
        self.roll_calibration = 0.0
        self.is_calibrated = False
        
        # Current octave
        self.current_octave = 4
        
        # Gesture tracking
        self.current_pitch_zone = "neutral"
        
        # Finger states
        self.finger_states = {
            'thumb': False,
            'index': False,
            'middle': False,
            'ring': False,
            'pinky': False
        }
        
        # Active chords (store list of MIDI notes currently playing)
        self.active_chords = {
            'thumb': [],
            'index': [],
            'middle': [],
            'ring': [],
            'pinky': []
        }
        
        # Timing
        self.last_chord_time = {
            'thumb': 0,
            'index': 0,
            'middle': 0,
            'ring': 0,
            'pinky': 0
        }
        self.last_octave_change = 0
        self.last_pitch_zone_change = 0

# ============================================================================
# CHORDS CONTROLLER
# ============================================================================

class ChordsController:
    """
    Chord-Based MIDI Keyboard Controller
    Left Hand: Minor Chords, Right Hand: Major Chords
    Both hands play chords independently on separate MIDI channels
    """
    
    def __init__(self, midi_out=None):
        # MIDI output
        self.midi_out = midi_out
        
        # Initialize hand states (separate MIDI channels)
        self.left_hand = HandState("LEFT", False, 0)   # MIDI channel 1 - MINOR chords
        self.right_hand = HandState("RIGHT", True, 1)  # MIDI channel 2 - MAJOR chords
        
        # Reduce print frequency
        self.last_debug_print = 0
        self.debug_print_interval = 2.0  # seconds
        
        print("✓ Chords Controller: Ready")
        print("   Left Hand: MIDI Channel 1 - MINOR Chords")
        print("   Right Hand: MIDI Channel 2 - MAJOR Chords")
    
    def calibrate(self, left_baseline, right_baseline):
        """
        CORRECTED: Receive calibration baseline DICTS from main controller
        Expects: {'pitch_calibration': float, 'roll_calibration': float}
        """
        # Check if we have valid baseline dicts
        if (left_baseline and 
            isinstance(left_baseline, dict) and
            'pitch_calibration' in left_baseline and 
            'roll_calibration' in left_baseline):
            self.left_hand.pitch_calibration = left_baseline['pitch_calibration']
            self.left_hand.roll_calibration = left_baseline['roll_calibration']
            self.left_hand.is_calibrated = True
        else:
            print("⚠️  Chords Controller: Invalid left baseline format")
        
        if (right_baseline and 
            isinstance(right_baseline, dict) and
            'pitch_calibration' in right_baseline and 
            'roll_calibration' in right_baseline):
            self.right_hand.pitch_calibration = right_baseline['pitch_calibration']
            self.right_hand.roll_calibration = right_baseline['roll_calibration']
            self.right_hand.is_calibrated = True
        else:
            print("⚠️  Chords Controller: Invalid right baseline format")
        
        if self.left_hand.is_calibrated and self.right_hand.is_calibrated:
            print("✓ Chords Controller: Calibration complete")
        else:
            print("⚠️  Chords Controller: Calibration incomplete")
    
    def handle_samples(self, left_sample, right_sample):
        """
        Process samples from both hands
        Called by main controller when chords mode is active
        """
        # Process left hand (minor chords)
        if left_sample and self.left_hand.is_calibrated:
            self._process_hand_sample(self.left_hand, left_sample)
        
        # Process right hand (major chords)
        if right_sample and self.right_hand.is_calibrated:
            self._process_hand_sample(self.right_hand, right_sample)
    
    # ============================================================================
    # HAND PROCESSING
    # ============================================================================
    
    def _process_hand_sample(self, hand_state, sample):
        """Process a single hand sample for chord playing"""
        # Convert quaternion to Euler angles
        pitch, roll, yaw = self._quaternion_to_euler(
            sample['qw'], sample['qx'], sample['qy'], sample['qz']
        )
        
        # Process gestures (octave changes and pitch zones)
        self._process_gestures(hand_state, pitch, roll)
        
        # Process flex sensors
        flex_values = [
            sample['flex_thumb'],
            sample['flex_index'], 
            sample['flex_middle'],
            sample['flex_ring'],
            sample['flex_pinky']
        ]
        self._process_flex_sensors(hand_state, flex_values)
    
    def _quaternion_to_euler(self, qw, qx, qy, qz):
        """Convert quaternion to Euler angles (pitch, roll, yaw)"""
        
        # Roll (x-axis rotation)
        sinr_cosp = 2 * (qw * qx + qy * qz)
        cosr_cosp = 1 - 2 * (qx * qx + qy * qy)
        roll = math.atan2(sinr_cosp, cosr_cosp)
        
        # Pitch (y-axis rotation)
        sinp = 2 * (qw * qy - qz * qx)
        if abs(sinp) >= 1:
            pitch = math.copysign(math.pi / 2, sinp)
        else:
            pitch = math.asin(sinp)
        
        # Yaw (z-axis rotation)
        siny_cosp = 2 * (qw * qz + qx * qy)
        cosy_cosp = 1 - 2 * (qy * qy + qz * qz)
        yaw = math.atan2(siny_cosp, cosy_cosp)
        
        return pitch, roll, yaw
    
    def _process_gestures(self, hand_state, pitch, roll):
        """Process IMU gestures for octave changes and pitch zones"""
        
        current_time = time.time()
        
        # Apply calibration
        pitch_cal = pitch - hand_state.pitch_calibration
        roll_cal = roll - hand_state.roll_calibration
        
        # Octave changes - Different logic for left vs right hand
        if current_time - hand_state.last_octave_change > OCTAVE_CHANGE_COOLDOWN:
            if hand_state.is_right_hand:
                # Right hand: roll RIGHT = octave UP, roll LEFT = octave DOWN
                if roll_cal > ROLL_RIGHT_THRESHOLD:
                    hand_state.current_octave = min(8, hand_state.current_octave + 1)
                    print(f"[{hand_state.hand_name}] >>> OCTAVE UP: {hand_state.current_octave}")
                    hand_state.last_octave_change = current_time
                elif roll_cal < ROLL_LEFT_THRESHOLD:
                    hand_state.current_octave = max(0, hand_state.current_octave - 1)
                    print(f"[{hand_state.hand_name}] >>> OCTAVE DOWN: {hand_state.current_octave}")
                    hand_state.last_octave_change = current_time
            else:
                # Left hand: roll LEFT = octave UP, roll RIGHT = octave DOWN
                if roll_cal < ROLL_LEFT_THRESHOLD:
                    hand_state.current_octave = min(8, hand_state.current_octave + 1)
                    print(f"[{hand_state.hand_name}] >>> OCTAVE UP: {hand_state.current_octave}")
                    hand_state.last_octave_change = current_time
                elif roll_cal > ROLL_RIGHT_THRESHOLD:
                    hand_state.current_octave = max(0, hand_state.current_octave - 1)
                    print(f"[{hand_state.hand_name}] >>> OCTAVE DOWN: {hand_state.current_octave}")
                    hand_state.last_octave_change = current_time
        
        # Pitch zone tracking - Inverted for right hand
        old_pitch_zone = hand_state.current_pitch_zone
        
        # Apply hand-specific inversion for pitch - RIGHT HAND ONLY
        effective_pitch = pitch_cal
        if hand_state.is_right_hand:
            effective_pitch = -pitch_cal  # INVERT right hand pitch
        
        # Direct pitch zone detection
        if effective_pitch < PITCH_UP_THRESHOLD:
            new_zone = "up"
        elif effective_pitch > PITCH_DOWN_THRESHOLD:
            new_zone = "down"
        else:
            new_zone = "neutral"
        
        # Update zone if changed
        if new_zone != hand_state.current_pitch_zone:
            hand_state.current_pitch_zone = new_zone
            hand_state.last_pitch_zone_change = current_time
    
    def _process_flex_sensors(self, hand_state, flex_values):
        """Process flex sensor data and trigger chords"""
        
        current_time = time.time()
        finger_names = ['thumb', 'index', 'middle', 'ring', 'pinky']
        
        for i, finger_name in enumerate(finger_names):
            flex_value = flex_values[i]
            threshold = FLEX_THRESHOLDS[finger_name]
            
            # Finger is bent if value is BELOW threshold
            is_bent = (flex_value < threshold)
            
            # Detect state change (flat to bent) - chord on
            if is_bent and not hand_state.finger_states[finger_name]:
                if current_time - hand_state.last_chord_time[finger_name] > DEBOUNCE_TIME:
                    self._play_chord(hand_state, finger_name, i, flex_value)
                    hand_state.last_chord_time[finger_name] = current_time
            
            # Detect state change (bent to flat) - chord off
            elif not is_bent and hand_state.finger_states[finger_name]:
                self._stop_chord(hand_state, finger_name)
            
            hand_state.finger_states[finger_name] = is_bent
    
    # ============================================================================
    # CHORD GENERATION AND PLAYING
    # ============================================================================
    
    def _get_chord_notes(self, finger_index, is_right_hand, pitch_zone, octave):
        """Generate chord notes based on finger, hand type, and pitch zone"""
        
        # Select note based on pitch zone
        if pitch_zone == "up":
            note_offset = NOTE_OFFSETS['sharp'][finger_index]
            note_name = NOTE_NAMES['sharp'][finger_index]
            use_octave = octave
        elif pitch_zone == "down":
            note_offset = NOTE_OFFSETS['low'][finger_index]
            note_name = NOTE_NAMES['low'][finger_index]
            # A and B come from previous octave
            use_octave = octave - 1 if finger_index < 2 else octave
        else:
            note_offset = NOTE_OFFSETS['normal'][finger_index]
            note_name = NOTE_NAMES['normal'][finger_index]
            use_octave = octave
        
        # Calculate root MIDI note
        root_midi = (use_octave + 1) * 12 + note_offset
        
        # Build chord based on hand type
        if is_right_hand:
            # Major chord
            chord_intervals = MAJOR_CHORD
            chord_name = note_name
        else:
            # Minor chord
            chord_intervals = MINOR_CHORD
            chord_name = f"{note_name}m"
        
        # Generate chord notes
        chord_notes = [root_midi + interval for interval in chord_intervals]
        
        # Clamp to valid MIDI range
        chord_notes = [max(0, min(127, note)) for note in chord_notes]
        
        return chord_notes, chord_name, use_octave
    
    def _play_chord(self, hand_state, finger_name, finger_index, flex_value):
        """Play a chord based on finger and current pitch zone"""
        
        # Get chord notes
        chord_notes, chord_name, octave = self._get_chord_notes(
            finger_index, 
            hand_state.is_right_hand,
            hand_state.current_pitch_zone, 
            hand_state.current_octave
        )
        
        # Send note on for each note in chord
        if self.midi_out:
            for note in chord_notes:
                msg_on = Message('note_on', note=note, velocity=80, channel=hand_state.midi_channel)
                self.midi_out.send(msg_on)
        
        # Store active chord
        hand_state.active_chords[finger_name] = chord_notes
        
        # Print info
        chord_type = "MAJOR" if hand_state.is_right_hand else "MINOR"
        zone_name = hand_state.current_pitch_zone.upper()
        print(f"[{hand_state.hand_name}] ♪ {chord_name} {chord_type} ({zone_name})")

    def _stop_chord(self, hand_state, finger_name):
        """Send MIDI note off for all notes in the chord"""
        if hand_state.active_chords[finger_name]:
            if self.midi_out:
                for note in hand_state.active_chords[finger_name]:
                    msg_off = Message('note_off', note=note, velocity=0, channel=hand_state.midi_channel)
                    self.midi_out.send(msg_off)
            hand_state.active_chords[finger_name] = []
    
    # ============================================================================
    # CALIBRATION HELPER
    # ============================================================================
    
    class CalibrationHelper:
        """Helper for main controller to compute calibration baselines"""
        
        @staticmethod
        def compute_orientation_baseline(samples, num_samples=50):
            """Compute orientation baseline from collected samples"""
            if len(samples) < num_samples:
                return None
            
            pitch_sum = 0.0
            roll_sum = 0.0
            count = 0
            
            for sample in samples[-num_samples:]:
                # Convert quaternion to Euler for each sample
                qw, qx, qy, qz = sample['qw'], sample['qx'], sample['qy'], sample['qz']
                
                # Roll (x-axis rotation)
                sinr_cosp = 2 * (qw * qx + qy * qz)
                cosr_cosp = 1 - 2 * (qx * qx + qy * qy)
                roll = math.atan2(sinr_cosp, cosr_cosp)
                
                # Pitch (y-axis rotation)
                sinp = 2 * (qw * qy - qz * qx)
                if abs(sinp) >= 1:
                    pitch = math.copysign(math.pi / 2, sinp)
                else:
                    pitch = math.asin(sinp)
                
                pitch_sum += pitch
                roll_sum += roll
                count += 1
            
            if count > 0:
                return {
                    'pitch_calibration': pitch_sum / count,
                    'roll_calibration': roll_sum / count
                }
            return None
    
    # ============================================================================
    # CLEANUP
    # ============================================================================
    
    def cleanup(self):
        """Cleanup resources - send all notes off"""
        if not self.midi_out:
            return
        
        # Send note off for all active chords in both hands
        for hand_state in [self.left_hand, self.right_hand]:
            for finger_name in ['thumb', 'index', 'middle', 'ring', 'pinky']:
                if hand_state.active_chords[finger_name]:
                    for note in hand_state.active_chords[finger_name]:
                        msg_off = Message('note_off', note=note, velocity=0, channel=hand_state.midi_channel)
                        self.midi_out.send(msg_off)
                    hand_state.active_chords[finger_name] = []
        
        print("✓ Chords Controller: All chords stopped")

# ============================================================================
# STANDALONE DEMO
# ============================================================================

if __name__ == "__main__":
    print("🎹 Chords Controller standalone demo")
    print("This module is designed to be imported into main_controller.py")