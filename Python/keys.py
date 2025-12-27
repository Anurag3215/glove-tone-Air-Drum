"""
KEYS CONTROLLER - Single-Note MIDI Keyboard
FIXED VERSION: Properly handles calibration baseline dicts
"""

import time
import math
import mido
from mido import Message

# ============================================================================
# CONFIGURATION
# ============================================================================

# Flex sensor thresholds
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

# Note mappings
NOTE_OFFSETS = {
    'normal': [0, 2, 4, 5, 7],
    'sharp': [1, 3, 6, 8, 10],
    'low': [9, 11, 0, 2, 4]
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
    """State management for a single hand"""
    
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
        self.previous_pitch_zone = "neutral"
        
        # Finger states
        self.finger_states = {
            'thumb': False,
            'index': False,
            'middle': False,
            'ring': False,
            'pinky': False
        }
        
        # Active notes
        self.active_notes = {
            'thumb': None,
            'index': None,
            'middle': None,
            'ring': None,
            'pinky': None
        }
        
        # Timing
        self.last_note_time = {
            'thumb': 0,
            'index': 0,
            'middle': 0,
            'ring': 0,
            'pinky': 0
        }
        self.last_octave_change = 0
        self.last_pitch_zone_change = 0

# ============================================================================
# KEYS CONTROLLER
# ============================================================================

class KeysController:
    """Single-Note MIDI Keyboard Controller"""
    
    def __init__(self, midi_out=None):
        # MIDI output
        self.midi_out = midi_out
        
        # Initialize hand states
        self.left_hand = HandState("LEFT", False, 0)
        self.right_hand = HandState("RIGHT", True, 1)
        
        # Reduce print frequency
        self.last_debug_print = 0
        self.debug_print_interval = 2.0
        
        print("✓ Keys Controller: Ready (Single Notes)")
    
    def calibrate(self, left_baseline, right_baseline):
        """FIXED: Receive calibration baseline dicts from main controller"""
        if left_baseline and 'pitch_calibration' in left_baseline and 'roll_calibration' in left_baseline:
            self.left_hand.pitch_calibration = left_baseline['pitch_calibration']
            self.left_hand.roll_calibration = left_baseline['roll_calibration']
            self.left_hand.is_calibrated = True
        
        if right_baseline and 'pitch_calibration' in right_baseline and 'roll_calibration' in right_baseline:
            self.right_hand.pitch_calibration = right_baseline['pitch_calibration']
            self.right_hand.roll_calibration = right_baseline['roll_calibration']
            self.right_hand.is_calibrated = True
        
        if self.left_hand.is_calibrated and self.right_hand.is_calibrated:
            print("✓ Keys Controller: Calibration complete")
        else:
            print("⚠️  Keys Controller: Calibration incomplete")
    
    def handle_samples(self, left_sample, right_sample):
        """Process samples from both hands"""
        if left_sample and self.left_hand.is_calibrated:
            self._process_hand_sample(self.left_hand, left_sample)
        
        if right_sample and self.right_hand.is_calibrated:
            self._process_hand_sample(self.right_hand, right_sample)
    
    def _process_hand_sample(self, hand_state, sample):
        """Process a single hand sample"""
        pitch, roll, yaw = self._quaternion_to_euler(
            sample['qw'], sample['qx'], sample['qy'], sample['qz']
        )
        
        self._process_gestures(hand_state, pitch, roll)
        
        flex_values = [
            sample['flex_thumb'],
            sample['flex_index'], 
            sample['flex_middle'],
            sample['flex_ring'],
            sample['flex_pinky']
        ]
        self._process_flex_sensors(hand_state, flex_values)
    
    def _quaternion_to_euler(self, qw, qx, qy, qz):
        """Convert quaternion to Euler angles"""
        sinr_cosp = 2 * (qw * qx + qy * qz)
        cosr_cosp = 1 - 2 * (qx * qx + qy * qy)
        roll = math.atan2(sinr_cosp, cosr_cosp)
        
        sinp = 2 * (qw * qy - qz * qx)
        if abs(sinp) >= 1:
            pitch = math.copysign(math.pi / 2, sinp)
        else:
            pitch = math.asin(sinp)
        
        siny_cosp = 2 * (qw * qz + qx * qy)
        cosy_cosp = 1 - 2 * (qy * qy + qz * qz)
        yaw = math.atan2(siny_cosp, cosy_cosp)
        
        return pitch, roll, yaw
    
    def _process_gestures(self, hand_state, pitch, roll):
        """Process IMU gestures for octave changes and pitch zones"""
        current_time = time.time()
        
        pitch_cal = pitch - hand_state.pitch_calibration
        roll_cal = roll - hand_state.roll_calibration
        
        # Octave changes
        if current_time - hand_state.last_octave_change > OCTAVE_CHANGE_COOLDOWN:
            if hand_state.is_right_hand:
                if roll_cal > ROLL_RIGHT_THRESHOLD:
                    hand_state.current_octave = min(8, hand_state.current_octave + 1)
                    print(f"[{hand_state.hand_name}] >>> OCTAVE UP: {hand_state.current_octave}")
                    hand_state.last_octave_change = current_time
                elif roll_cal < ROLL_LEFT_THRESHOLD:
                    hand_state.current_octave = max(0, hand_state.current_octave - 1)
                    print(f"[{hand_state.hand_name}] >>> OCTAVE DOWN: {hand_state.current_octave}")
                    hand_state.last_octave_change = current_time
            else:
                if roll_cal < ROLL_LEFT_THRESHOLD:
                    hand_state.current_octave = min(8, hand_state.current_octave + 1)
                    print(f"[{hand_state.hand_name}] >>> OCTAVE UP: {hand_state.current_octave}")
                    hand_state.last_octave_change = current_time
                elif roll_cal > ROLL_RIGHT_THRESHOLD:
                    hand_state.current_octave = max(0, hand_state.current_octave - 1)
                    print(f"[{hand_state.hand_name}] >>> OCTAVE DOWN: {hand_state.current_octave}")
                    hand_state.last_octave_change = current_time
        
        # Pitch zone tracking
        old_pitch_zone = hand_state.current_pitch_zone
        
        effective_pitch = pitch_cal
        if hand_state.is_right_hand:
            effective_pitch = -pitch_cal
        
        if effective_pitch < PITCH_UP_THRESHOLD:
            new_zone = "up"
        elif effective_pitch > PITCH_DOWN_THRESHOLD:
            new_zone = "down"
        else:
            new_zone = "neutral"
        
        if new_zone != hand_state.current_pitch_zone:
            hand_state.current_pitch_zone = new_zone
            hand_state.last_pitch_zone_change = current_time
    
    def _process_flex_sensors(self, hand_state, flex_values):
        """Process flex sensor data and trigger MIDI notes"""
        current_time = time.time()
        finger_names = ['thumb', 'index', 'middle', 'ring', 'pinky']
        
        for i, finger_name in enumerate(finger_names):
            flex_value = flex_values[i]
            threshold = FLEX_THRESHOLDS[finger_name]
            
            is_bent = (flex_value < threshold)
            
            if is_bent and not hand_state.finger_states[finger_name]:
                if current_time - hand_state.last_note_time[finger_name] > DEBOUNCE_TIME:
                    self._play_midi_note(hand_state, finger_name, i, flex_value)
                    hand_state.last_note_time[finger_name] = current_time
            
            elif not is_bent and hand_state.finger_states[finger_name]:
                self._stop_midi_note(hand_state, finger_name)
            
            hand_state.finger_states[finger_name] = is_bent
    
    def _get_midi_note(self, finger_index, pitch_zone, octave):
        """Get MIDI note number"""
        if pitch_zone == "up":
            note_offset = NOTE_OFFSETS['sharp'][finger_index]
            note_name = NOTE_NAMES['sharp'][finger_index]
            use_octave = octave
        elif pitch_zone == "down":
            note_offset = NOTE_OFFSETS['low'][finger_index]
            note_name = NOTE_NAMES['low'][finger_index]
            use_octave = octave - 1 if finger_index < 2 else octave
        else:
            note_offset = NOTE_OFFSETS['normal'][finger_index]
            note_name = NOTE_NAMES['normal'][finger_index]
            use_octave = octave
        
        midi_note = (use_octave + 1) * 12 + note_offset
        return midi_note, note_name, use_octave
    
    def _play_midi_note(self, hand_state, finger_name, finger_index, flex_value):
        """Send MIDI note on message"""
        midi_note, note_name, use_octave = self._get_midi_note(
            finger_index, 
            hand_state.current_pitch_zone, 
            hand_state.current_octave
        )
        
        midi_note = max(0, min(127, midi_note))
        
        if self.midi_out:
            msg_on = Message('note_on', note=midi_note, velocity=64, channel=hand_state.midi_channel)
            self.midi_out.send(msg_on)
        
        hand_state.active_notes[finger_name] = midi_note
        
        zone_name = hand_state.current_pitch_zone.upper()
        print(f"[{hand_state.hand_name}] ♪ {note_name}{use_octave} ({zone_name}) [{finger_name}]")
    
    def _stop_midi_note(self, hand_state, finger_name):
        """Send MIDI note off message"""
        if hand_state.active_notes[finger_name] is not None:
            if self.midi_out:
                msg_off = Message('note_off', note=hand_state.active_notes[finger_name], 
                                 velocity=0, channel=hand_state.midi_channel)
                self.midi_out.send(msg_off)
            hand_state.active_notes[finger_name] = None
    
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
                qw, qx, qy, qz = sample['qw'], sample['qx'], sample['qy'], sample['qz']
                
                sinr_cosp = 2 * (qw * qx + qy * qz)
                cosr_cosp = 1 - 2 * (qx * qx + qy * qy)
                roll = math.atan2(sinr_cosp, cosr_cosp)
                
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
    
    def cleanup(self):
        """Cleanup resources"""
        if not self.midi_out:
            return
        
        for hand_state in [self.left_hand, self.right_hand]:
            for finger_name in ['thumb', 'index', 'middle', 'ring', 'pinky']:
                if hand_state.active_notes[finger_name] is not None:
                    msg_off = Message('note_off', note=hand_state.active_notes[finger_name], 
                                     velocity=0, channel=hand_state.midi_channel)
                    self.midi_out.send(msg_off)
                    hand_state.active_notes[finger_name] = None

if __name__ == "__main__":
    print("🎹 Keys Controller standalone demo")
    print("This module is designed to be imported into main_controller.py")