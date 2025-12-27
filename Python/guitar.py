"""
GUITAR CONTROLLER - Integrated Guitar System
Refactored for modular architecture
Left Hand: Pitch Control (Notes, Zones)
Right Hand: Strumming Detection (FSR + Motion + AI)
"""

import time
import math
import numpy as np
from collections import deque
import mido
import threading
import tensorflow as tf
from tensorflow import keras
import joblib

# ============================================================================
# CONFIGURATION
# ============================================================================

# Right Hand - Strumming Detection
GYRO_Z_THRESHOLD = 2.0
DOWN_MIN_MULTIPLIER = 0.9
DOWN_REPEAT_MULTIPLIER = 1.2
UP_MIN_MULTIPLIER = 0.8
UP_REPEAT_MULTIPLIER = 0.75
RESET_MOTION_MULTIPLIER = 0.75

STROKE_MIN_DURATION_MS = 20
STROKE_MAX_DURATION_MS = 200
MIN_INTER_STROKE_GAP_MS = 80
STROKE_END_DURATION_MS = 25
LOW_MOTION_FACTOR = 0.35

FSR_THRESHOLD = 500
FSR_DEBOUNCE_MS = 30

AI_TIMING_MS = 60
AI_CONFIDENCE_THRESHOLD = 0.92
FULL_AI_TIMING_MS = 110

ADAPTIVE_MIN_GAP = 80
ADAPTIVE_MAX_GAP = 150
ADAPTIVE_MULTIPLIER = 0.65

# Left Hand - Pitch Control
FLEX_THRESHOLDS = {
    'thumb': 500,
    'index': 200, 
    'middle': 600,
    'ring': 600,
    'pinky': 600
}

# MIDI
MIDI_VELOCITY = 100
MIDI_CHANNEL = 0
NOTE_DURATION_MS = 50

# GS-2 Strum Triggers (NEW)
DOWN_STRUM_NOTE = 36  # C2
UP_STRUM_NOTE = 38    # D2

# Pitch zones (Natural and Flats only)
class PitchZone:
    NATURAL = 1  
    FLATS = 2

# MIDI note definitions
NOTES_NATURAL = [60, 62, 64, 65, 67]  # C, D, E, F, G
NOTES_FLATS = [58, 60, 62, 63, 65]    # A#, C, D, D#, F

# GS-2 Automatic Chords Mapping (NEW)
NOTE_NAME_TO_MIDI = {
    'C': 60, 'C#': 61, 'Db': 61, 'D': 62, 'D#': 63, 'Eb': 63,
    'E': 64, 'F': 65, 'F#': 66, 'Gb': 66, 'G': 67, 'G#': 68, 
    'Ab': 68, 'A': 69, 'A#': 70, 'Bb': 70, 'B': 71
}

# GS-2 Chord Map: (zone, finger) -> (root_note_name, quality)
CHORD_MAP = {
    (PitchZone.NATURAL, 'thumb'): ('C', 'maj'),
    (PitchZone.NATURAL, 'index'): ('D', 'maj'), 
    (PitchZone.NATURAL, 'middle'): ('E', 'maj'),
    (PitchZone.NATURAL, 'ring'): ('F', 'maj'),
    (PitchZone.NATURAL, 'pinky'): ('G', 'maj'),
    
    (PitchZone.FLATS, 'thumb'): ('C', 'min'),
    (PitchZone.FLATS, 'index'): ('D', 'min'),
    (PitchZone.FLATS, 'middle'): ('E', 'min'),
    (PitchZone.FLATS, 'ring'): ('F', 'min'), 
    (PitchZone.FLATS, 'pinky'): ('G', 'min')
}

# White and black key sets for GS-2 chord generation (NEW)
WHITE_KEYS = {60, 62, 64, 65, 67, 69, 71}  # C, D, E, F, G, A, B
BLACK_KEYS = {61, 63, 66, 68, 70}          # C#, D#, F#, G#, A#

# AI Model paths (same as original)
MODEL_PATH = r"D:\Main project\guitar\models"

# ============================================================================
# FLEX SENSOR CLASS
# ============================================================================

class FlexSensor:
    def __init__(self, name, threshold):
        self.name = name
        self.threshold = threshold
        self.is_bent = False
        self.last_note = 0
        self.last_note_time = 0
        self.zone_locked = False
        self.locked_zone = None

# ============================================================================
# GUITAR CONTROLLER
# ============================================================================

class GuitarController:
    """
    Integrated Guitar Controller
    Left Hand: Pitch control with zones and finger combinations
    Right Hand: Strumming detection with FSR and AI correction
    """
    
    def __init__(self, midi_out=None, ai_models=None):
        print("🎸 Guitar Controller: Initializing...")
        
        # MIDI output
        self.midi_out = midi_out
        self.midi_lock = threading.Lock()
        self.last_sent_note = None
        self.last_note_time = 0
        
        # GS-2 Chord state (NEW)
        self.current_chord_notes = None  # List of MIDI notes for current chord
        self.current_chord_name = None   # Human-readable chord name
        
        # AI models - Load exactly like original
        self.ai_loaded = False
        self.full_ai_available = False
        
        if ai_models:
            # Use provided models if available
            self.peak_model = ai_models.get('peak_model')
            self.peak_scaler = ai_models.get('peak_scaler')
            self.full_model = ai_models.get('full_model')
            self.full_scaler = ai_models.get('full_scaler')
            
            if self.peak_model and self.peak_scaler:
                self.ai_loaded = True
                self.full_ai_available = bool(self.full_model and self.full_scaler)
                print("✓ Guitar AI models loaded - AI correction ENABLED")
            else:
                print("⚠ Guitar: Incomplete AI models - using basic strum detection")
        else:
            # Try to load models from original path
            try:
                self.peak_model = keras.models.load_model(f"{MODEL_PATH}/peak_centered_model.keras")
                self.peak_scaler = joblib.load(f"{MODEL_PATH}/peak_centered_scaler.pkl")
                print("✓ Peak AI loaded (80ms window)")
                
                try:
                    self.full_model = keras.models.load_model(f"{MODEL_PATH}/full_model.keras")
                    self.full_scaler = joblib.load(f"{MODEL_PATH}/full_scaler.pkl")
                    self.full_ai_available = True
                    print("✓ Full AI loaded (120ms window - stats only)")
                except Exception as e:
                    self.full_ai_available = False
                    print(f"⚠ Full AI not found (optional): {e}")
                
                self.ai_loaded = True
                print("✓ Guitar AI models loaded from original path")
            except Exception as e:
                print(f"⚠ [Guitar] WARNING: Failed to load AI model, running without AI: {e}")
                print("   Using basic strum detection without AI")
                self.ai_loaded = False
        
        # Initialize left and right hand state (same as original)
        self._setup_left_hand()
        self._setup_right_hand()
        
        print("✓ Guitar Controller: Ready")
        if self.ai_loaded:
            print("   AI: Enabled (Peak + Full)" if self.full_ai_available else "   AI: Enabled (Peak only)")
        else:
            print("   AI: Disabled - using motion detection only")

    def handle_samples(self, left_sample, right_sample):
        """
        Handle samples from both hands - interface expected by main controller
        """
        if left_sample:
            self._process_left_hand(left_sample)
        if right_sample:
            self._process_right_hand(right_sample)

    def calibrate(self, left_baseline, right_baseline):
        """
        Calibration interface for consistency with other instruments
        Guitar doesn't use calibration data from main controller
        """
        print("🎸 Guitar: Calibration received (not used)")
    
    def _setup_left_hand(self):
        """Initialize left hand pitch control components (same as original)"""
        # Orientation
        self.current_pitch = 0.0
        self.current_roll = 0.0  
        self.current_yaw = 0.0
        
        # Zones
        self.current_zone = PitchZone.NATURAL
        self.previous_zone = PitchZone.NATURAL
        
        # Flex sensors
        self.flex_sensors = {
            'thumb': FlexSensor('thumb', FLEX_THRESHOLDS['thumb']),
            'index': FlexSensor('index', FLEX_THRESHOLDS['index']),
            'middle': FlexSensor('middle', FLEX_THRESHOLDS['middle']), 
            'ring': FlexSensor('ring', FLEX_THRESHOLDS['ring']),
            'pinky': FlexSensor('pinky', FLEX_THRESHOLDS['pinky'])
        }
        
        # Note state
        self.current_note = None
        self.note_playing = False
        self.active_finger = None
        self.bent_fingers = set()
        self.finger_bend_times = {}
        
        # Sensor data storage (for orientation calculations)
        self.left_sensor_data = {
            'quat_w': 1.0, 'quat_x': 0.0, 'quat_y': 0.0, 'quat_z': 0.0
        }
    
    def _setup_right_hand(self):
        """Initialize right hand strumming detection components (same as original)"""
        # FSR state
        self.fsr_active = False
        self.fsr_state_change_time = None
        self.strumming_active = False
        
        # Stroke detection
        self.stroke_in_progress = False
        self.stroke_start_time = 0
        self.stroke_data_for_ai = []
        self.last_stroke_end_time = 0
        
        self.low_motion_start_time = None
        self.low_motion_samples = 0
        
        self.peak_stroke_strength = 0
        self.current_stroke_direction = None
        
        self.gyro_z_buffer = deque(maxlen=3)
        self.imu_buffer = deque(maxlen=30)
        
        # AI flags
        self.peak_ai_checked = False
        self.full_ai_checked = False
        self.any_correction_sent = False
        
        # Last confirmed for repeat detection
        self.last_confirmed_direction = None
        self.last_confirmed_strength = 0
        
        # Adaptive gap
        self.adaptive_mode = False
        self.recent_gaps = deque(maxlen=8)
        self.current_gap = MIN_INTER_STROKE_GAP_MS
        
        # Modes
        self.strength_validation_mode = True
        self.debug_mode = False
        
        # Statistics (same as original)
        self.stats = {
            'total_strokes': 0,
            'down': 0,
            'up': 0,
            'physical_correct': 0,
            'peak_ai_agreed': 0,
            'peak_ai_corrected': 0,
            'full_ai_agreed': 0,
            'full_ai_disagreed': 0,
            'blocked_weak': 0,
            'blocked_reset': 0,
            'blocked_repeat_down': 0,
            'blocked_repeat_up': 0,
            'multi_trigger_prevented': 0,
            'notes_played': 0
        }

    # ============================================================================
    # GS-2 CHORD HELPERS (NEW)
    # ============================================================================
    
    def _nearest_left(self, root_midi, want_black=True):
        """
        Find nearest key to the left of root_midi.
        For GS-2: minor chords need nearest black key to the left.
        """
        if root_midi <= 0:
            return root_midi - 1  # Fallback
            
        # Look for nearest key (black if want_black=True, any if False)
        candidate = root_midi - 1
        while candidate > max(0, root_midi - 24):  # Search within 2 octaves
            if want_black:
                if candidate in BLACK_KEYS:
                    return candidate
            else:
                if candidate in WHITE_KEYS:
                    return candidate
            candidate -= 1
        
            
        return root_midi - 1  # Fallback
    
    def _gs2_chord_keys(self, root_midi, quality):
        """Convert chord quality to GS-2 key combinations"""
        root_name = self._get_note_name(root_midi).replace(str((root_midi // 12) - 1), '').rstrip('0123456789')
    
        if quality == 'maj' or quality == '':  # Major
            return [root_midi], f"{root_name}"
        elif quality == 'min' or quality == 'm':  # Minor  
            black_key = self._nearest_left(root_midi, want_black=True)
            return [root_midi, black_key], f"{root_name}m"
        elif quality == '7':  # Dominant 7th
            white_key = self._nearest_left(root_midi, want_black=False)
            return [root_midi, white_key], f"{root_name}7"
        elif quality == 'm7':  # Minor 7th
            black_key = self._nearest_left(root_midi, want_black=True)
            white_key = self._nearest_left(root_midi, want_black=False)
            return [root_midi, black_key, white_key], f"{root_name}m7"
        else:
            return [root_midi], f"{root_name}"
    
    def _get_chord_for_finger(self, finger_name, zone):
        """Get GS-2 chord for finger in given zone"""
        chord_info = CHORD_MAP.get((zone, finger_name))
        if not chord_info:
            return None, None
            
        root_name, quality = chord_info
        root_midi = NOTE_NAME_TO_MIDI.get(root_name)
        if not root_midi:
            return None, None
            
        chord_notes, chord_name = self._gs2_chord_keys(root_midi, quality)
        return chord_notes, chord_name
    
    # ============================================================================
    # LEFT HAND PROCESSING (UPDATED FOR GS-2 CHORDS)
    # ============================================================================
    
    def _process_left_hand(self, sample):
        """Process left hand data for pitch control (updated for GS-2 chords)"""
        # Update sensor data from sample
        self.left_sensor_data['quat_w'] = sample['qw']
        self.left_sensor_data['quat_x'] = sample['qx']
        self.left_sensor_data['quat_y'] = sample['qy'] 
        self.left_sensor_data['quat_z'] = sample['qz']
        
        # Update orientation (same as original)
        self._update_left_orientation()
        
        # Determine zone (same as original)
        new_zone = self._determine_zone()
        if new_zone != self.current_zone:
            self.previous_zone = self.current_zone
            self.current_zone = new_zone
            print(f"→ Zone: {self._print_zone(self.current_zone)}")
        
        # Process flex sensors (same as original)
        for finger_name in self.flex_sensors.keys():
            self._read_left_flex_sensor(finger_name, sample)
    
    def _update_left_orientation(self):
        """Update left hand orientation (same as original)"""
        qw = self.left_sensor_data['quat_w']
        qx = self.left_sensor_data['quat_x']
        qy = self.left_sensor_data['quat_y']
        qz = self.left_sensor_data['quat_z']
        
        pitch, roll, yaw = self._quaternion_to_euler(qw, qx, qy, qz)
        
        self.current_pitch = self._normalize_angle(pitch)
        self.current_roll = self._normalize_angle(roll)
        self.current_yaw = self._normalize_angle(yaw)
    
    def _quaternion_to_euler(self, qw, qx, qy, qz):
        """Convert quaternion to Euler angles (same as original)"""
        sinr_cosp = 2 * (qw * qx + qy * qz)
        cosr_cosp = 1 - 2 * (qx * qx + qy * qy)
        roll = math.atan2(sinr_cosp, cosr_cosp) * 180.0 / math.pi
        
        sinp = 2 * (qw * qy - qz * qx)
        if abs(sinp) >= 1:
            pitch = math.copysign(90.0, sinp)
        else:
            pitch = math.asin(sinp) * 180.0 / math.pi
        
        siny_cosp = 2 * (qw * qz + qx * qy)
        cosy_cosp = 1 - 2 * (qy * qy + qz * qz)
        yaw = math.atan2(siny_cosp, cosy_cosp) * 180.0 / math.pi
        
        return pitch, roll, yaw
    
    def _normalize_angle(self, angle):
        """Normalize angle to -180 to 180 degrees (same as original)"""
        while angle > 180.0:
            angle -= 360.0
        while angle < -180.0:
            angle += 360.0
        return angle
    
    def _determine_zone(self):
        """Determine current pitch zone (same as original)"""
        if self.current_yaw < -25.0:
            return PitchZone.FLATS
        else:
            return PitchZone.NATURAL
    
    def _read_left_flex_sensor(self, finger_name, sample):
        """Read and process left hand flex sensor (same as original)"""
        sensor = self.flex_sensors[finger_name]
        current_time = time.time()
        
        flex_value = sample[f'flex_{finger_name}']
        is_bent_now = flex_value < sensor.threshold
        
        # Update bent state and zone locking (same as original)
        if is_bent_now and not sensor.is_bent:
            # Finger just bent
            sensor.is_bent = True
            sensor.zone_locked = True
            sensor.locked_zone = self.current_zone
            
            # Add to bent fingers list (most recent at end)
            if finger_name in self.bent_fingers:
                self.bent_fingers.remove(finger_name)
            self.bent_fingers.add(finger_name)
            self.finger_bend_times[finger_name] = current_time
            
            # Activate note immediately (same as original)
            self._activate_note(finger_name, current_time)
            
        elif not is_bent_now and sensor.is_bent:
            # Finger just released (same as original)
            sensor.is_bent = False
            sensor.zone_locked = False
            sensor.locked_zone = None
            
            if finger_name in self.bent_fingers:
                self.bent_fingers.remove(finger_name)
            if finger_name in self.finger_bend_times:
                del self.finger_bend_times[finger_name]
            
            # Only stop note if this finger was the active one (same as original)
            if self.active_finger == finger_name and self.note_playing:
                self._stop_current_note()
                self.active_finger = None
    
    def _get_note_for_finger(self, finger_name):
        """Get the note for a given finger based on its locked zone (UPDATED FOR GS-2)"""
        sensor = self.flex_sensors[finger_name]
        
        # Use the locked zone if available, otherwise current zone
        zone_to_use = sensor.locked_zone if sensor.zone_locked else self.current_zone
        
        # Get GS-2 chord for this finger/zone combination
        chord_notes, chord_name = self._get_chord_for_finger(finger_name, zone_to_use)
        
        if chord_notes:
            # Store chord information for GS-2
            self.current_chord_notes = chord_notes
            self.current_chord_name = chord_name
            # Return root note for compatibility with existing code
            return chord_notes[0]
        else:
            # Fallback to original behavior if no chord mapping
            finger_index = ['thumb', 'index', 'middle', 'ring', 'pinky'].index(finger_name)
            
            if zone_to_use == PitchZone.NATURAL:
                return NOTES_NATURAL[finger_index]
            elif zone_to_use == PitchZone.FLATS:
                return NOTES_FLATS[finger_index]
            
            return NOTES_NATURAL[finger_index]  # Default fallback
    
    def _activate_note(self, finger_name, current_time):
        """Activate note immediately when finger bends (UPDATED FOR GS-2)"""
        sensor = self.flex_sensors[finger_name]
        
        final_note = self._get_note_for_finger(finger_name)
        final_note = max(0, min(127, final_note))
        
        sensor.last_note = final_note
        self.current_note = final_note
        self.active_finger = finger_name
        
        zone_to_use = sensor.locked_zone if sensor.zone_locked else self.current_zone
        zone_name = "Natural" if zone_to_use == PitchZone.NATURAL else "Flats"
        lock_status = " [LOCKED]" if sensor.zone_locked else ""
        
        # Show chord information if available
        if self.current_chord_name:
            print(f"♪ {sensor.name} → {self.current_chord_name} ({zone_name}{lock_status})")
        else:
            print(f"♪ {sensor.name} → {self._get_note_name(final_note)} ({zone_name}{lock_status})")
        
        # If strumming is active, play the note immediately (same as original)
        if self.strumming_active and not self.note_playing:
            self._play_current_note()
    
    def _play_current_note(self):
        """Play the current note (UPDATED FOR GS-2 CHORDS)"""
        if self.current_note is not None and not self.note_playing:
            # Send GS-2 chord notes if available, otherwise single note
            if self.current_chord_notes:
                for note in self.current_chord_notes:
                    self._send_midi_note_on(note)
            else:
                self._send_midi_note_on(self.current_note)
                
            self.note_playing = True
            self.stats['notes_played'] += 1
            
            # Show which finger is being played with chord info
            if self.active_finger:
                if self.current_chord_name:
                    print(f"   🎸 PLAYING: {self.active_finger} -> {self.current_chord_name}")
                else:
                    print(f"   🎸 PLAYING: {self.active_finger} -> {self._get_note_name(self.current_note)}")
    
    def _update_note_during_strumming(self):
        """Update note during strumming without requiring finger release (UPDATED FOR GS-2)"""
        if not self.strumming_active or not self.bent_fingers:
            return
        
        # Get the most recently bent finger
        current_finger = self.active_finger
        
        # If no finger is active but there are bent fingers, activate one
        if not current_finger and self.bent_fingers:
            next_finger = next(iter(self.bent_fingers))
            self._activate_note(next_finger, time.time())
            return
        
        # If current finger is still bent, check if note needs update due to zone change
        if current_finger and current_finger in self.bent_fingers:
            sensor = self.flex_sensors[current_finger]
            current_note = self._get_note_for_finger(current_finger)
            
            # If note has changed (due to zone change on non-locked finger), update it
            if not sensor.zone_locked and current_note != self.current_note:
                self.current_note = current_note
                if self.note_playing:
                    # For GS-2, we need to update all chord notes
                    if self.current_chord_notes:
                        # Stop all current chord notes
                        for note in self.current_chord_notes:
                            self._send_midi_note_off(note)
                        # Send new chord notes
                        for note in self.current_chord_notes:
                            self._send_midi_note_on(note)
                    else:
                        self._send_midi_note_on(self.current_note, retrigger=True)
                    
                    if self.current_chord_name:
                        print(f"   🔄 CHORD UPDATE: {current_finger} -> {self.current_chord_name}")
                    else:
                        print(f"   🔄 NOTE UPDATE: {current_finger} -> {self._get_note_name(self.current_note)}")
    
    def _stop_current_note(self):
        """Stop the current note (UPDATED FOR GS-2 CHORDS)"""
        if self.note_playing:
            # Stop GS-2 chord notes if available, otherwise single note
            if self.current_chord_notes:
                for note in self.current_chord_notes:
                    self._send_midi_note_off(note)
            elif self.current_note is not None:
                self._send_midi_note_off(self.current_note)
                
            self.note_playing = False
            self.current_chord_notes = None
            self.current_chord_name = None
    
    def _get_note_name(self, midi_note):
        """Convert MIDI note number to note name (same as original)"""
        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        octave = (midi_note // 12) - 1
        note_index = midi_note % 12
        return f"{note_names[note_index]}{octave}"
    
    def _print_zone(self, zone):
        if zone == PitchZone.NATURAL:
            return "Natural"
        elif zone == PitchZone.FLATS:
            return "Flats"
    
    # ============================================================================
    # RIGHT HAND PROCESSING (UPDATED STRUM TRIGGERS)
    # ============================================================================
    
    def _process_right_hand(self, sample):
        """Process right hand data for strumming detection (UPDATED STRUM TRIGGERS)"""
        current_time = self._now_ms()  # Use same timing as original
        
        # Update strumming state based on FSR (same as original)
        fsr_active = self._update_strumming_state(sample.get('fsr', 0), current_time)
        
        if fsr_active:
            # Process strum motion if strumming is active (same as original)
            self._process_strum_motion(sample, current_time)
    
    def _update_strumming_state(self, fsr_value, current_time):
        """Update strumming state based on FSR (same as original)"""
        fsr_now = fsr_value > FSR_THRESHOLD
        
        if fsr_now != self.fsr_active:
            if self.fsr_state_change_time is None:
                self.fsr_state_change_time = current_time
            elif current_time - self.fsr_state_change_time >= FSR_DEBOUNCE_MS:
                self.fsr_active = fsr_now
                self.fsr_state_change_time = None
                
                print(f"✋ FSR: {'ACTIVE' if self.fsr_active else 'INACTIVE'}")
                
                if self.fsr_active:
                    self._start_strumming(current_time)
                else:
                    self._stop_strumming(current_time)
        else:
            self.fsr_state_change_time = None
        
        return self.fsr_active
    
    def _start_strumming(self, current_time):
        """Start strumming - play current note if available (same as original)"""
        self.strumming_active = True
        print("🎸 STRUM START")
        
        # Check for any bent fingers and activate note (same as original)
        if self.bent_fingers and not self.active_finger:
            next_finger = next(iter(self.bent_fingers))
            self._activate_note(next_finger, current_time / 1000.0)  # Convert to seconds
        
        # Play the current note if one is prepared (same as original)
        if self.current_note is not None and not self.note_playing:
            self._play_current_note()
    
    def _stop_strumming(self, current_time):
        """Stop strumming - BUT DON'T STOP THE NOTE (same as original)"""
        self.strumming_active = False
        print("🎸 STRUM STOP")
        
        # Only reset stroke state, don't stop the note (same as original)
        self.stroke_in_progress = False
        self.peak_ai_checked = False
        self.full_ai_checked = False
        self.any_correction_sent = False
        self.low_motion_start_time = None
        self.low_motion_samples = 0
        self.peak_stroke_strength = 0
        self.current_stroke_direction = None
    
    def _get_direction_and_strength(self, gyro_z):
        """Get strum direction and strength (same as original)"""
        self.gyro_z_buffer.append(gyro_z)
        smoothed = np.mean(self.gyro_z_buffer)
        
        strength = abs(smoothed)
        
        if strength < GYRO_Z_THRESHOLD:
            return None, 0
        
        direction = 'down' if smoothed < 0 else 'up'
        return direction, strength
    
    def _validate_stroke_strength(self, direction, strength):
        """Validate stroke strength (same as original)"""
        if not self.strength_validation_mode:
            return True, "validation_off"
        
        reset_threshold = GYRO_Z_THRESHOLD * RESET_MOTION_MULTIPLIER
        
        if strength < reset_threshold:
            self.stats['blocked_reset'] += 1
            return False, f"reset_motion({strength:.2f}<{reset_threshold:.2f})"
        
        if direction == 'down':
            if self.last_confirmed_direction == 'down':
                required = GYRO_Z_THRESHOLD * DOWN_REPEAT_MULTIPLIER
                if strength < required:
                    self.stats['blocked_repeat_down'] += 1
                    return False, f"weak_repeat_down({strength:.2f}<{required:.2f})"
            else:
                required = GYRO_Z_THRESHOLD * DOWN_MIN_MULTIPLIER
                if strength < required:
                    self.stats['blocked_weak'] += 1
                    return False, f"weak_down({strength:.2f}<{required:.2f})"
        
        elif direction == 'up':
            if self.last_confirmed_direction == 'up':
                required = GYRO_Z_THRESHOLD * UP_REPEAT_MULTIPLIER
                if strength < required:
                    self.stats['blocked_repeat_up'] += 1
                    return False, f"weak_repeat_up({strength:.2f}<{required:.2f})"
            else:
                required = GYRO_Z_THRESHOLD * UP_MIN_MULTIPLIER
                if strength < required:
                    self.stats['blocked_weak'] += 1
                    return False, f"weak_up({strength:.2f}<{required:.2f})"
        
        return True, "valid"
    
    def _update_adaptive_gap(self, stroke_gap):
        """Adaptive inter-stroke gap (same as original)"""
        if not self.adaptive_mode:
            self.current_gap = MIN_INTER_STROKE_GAP_MS
            return
        
        self.recent_gaps.append(stroke_gap)
        
        if len(self.recent_gaps) >= 3:
            avg_gap = np.mean(self.recent_gaps)
            self.current_gap = int(avg_gap * ADAPTIVE_MULTIPLIER)
            self.current_gap = max(ADAPTIVE_MIN_GAP, min(self.current_gap, ADAPTIVE_MAX_GAP))
    
    def _check_stroke_ended(self, gyro_z, current_time):
        """Check if current stroke has ended (same as original)"""
        stroke_duration = current_time - self.stroke_start_time
        
        strength = abs(gyro_z)
        if strength > self.peak_stroke_strength:
            self.peak_stroke_strength = strength
        
        if stroke_duration < STROKE_MIN_DURATION_MS:
            return False
        
        if stroke_duration > STROKE_MAX_DURATION_MS:
            if self.debug_mode:
                print(f"   [Timeout: {stroke_duration}ms]")
            return True
        
        low_threshold = GYRO_Z_THRESHOLD * LOW_MOTION_FACTOR
        
        if abs(gyro_z) < low_threshold:
            self.low_motion_samples += 1
            
            if self.low_motion_start_time is None:
                self.low_motion_start_time = current_time
            
            low_duration = current_time - self.low_motion_start_time
            required_samples = 5
            
            if low_duration >= STROKE_END_DURATION_MS and self.low_motion_samples >= required_samples:
                return True
        else:
            if abs(gyro_z) > GYRO_Z_THRESHOLD * 1.5:
                self.low_motion_start_time = None
                self.low_motion_samples = 0
        
        return False
    
    def _process_strum_motion(self, sample, current_time):
        """Process strum motion detection (UPDATED STRUM TRIGGERS)"""
        imu_sample = [sample['ax'], sample['ay'], sample['az'],
                     sample['gx'], sample['gy'], sample['gz']]
        gyro_z = sample['gz']
        
        # Update note during strumming before processing stroke (same as original)
        if self.strumming_active:
            self._update_note_during_strumming()
        
        # Stroke end detection (same as original)
        if self.stroke_in_progress:
            self.stroke_data_for_ai.append(imu_sample)
            
            if self._check_stroke_ended(gyro_z, current_time):
                stroke_duration = current_time - self.stroke_start_time
                
                if self.last_stroke_end_time > 0:
                    gap = current_time - self.last_stroke_end_time
                    self._update_adaptive_gap(gap)
                
                self.stroke_in_progress = False
                self.peak_ai_checked = False
                self.full_ai_checked = False
                self.any_correction_sent = False
                self.low_motion_start_time = None
                self.low_motion_samples = 0
                self.peak_stroke_strength = 0
                self.last_stroke_end_time = current_time
                
                if self.debug_mode:
                    print(f"   [Ended: {stroke_duration}ms, peak: {self.peak_stroke_strength:.2f}]")
                
                return
            
            # AI correction during stroke (only if AI is loaded)
            if self.ai_loaded:
                elapsed = current_time - self.stroke_start_time
                
                # Peak AI correction (same as original)
                if (not self.peak_ai_checked and 
                    not self.any_correction_sent and
                    elapsed >= AI_TIMING_MS):
                    
                    self.peak_ai_checked = True
                    ai_dir, ai_conf = self._get_peak_ai_prediction()
                    
                    if ai_dir:
                        if ai_dir == self.current_stroke_direction:
                            self.stats['peak_ai_agreed'] += 1
                            if self.debug_mode:
                                print(f"   [Peak AI agreed: {ai_dir}, conf: {ai_conf:.2f}]")
                        elif ai_conf > AI_CONFIDENCE_THRESHOLD:
                            self.stats['peak_ai_corrected'] += 1
                            self.stats['physical_correct'] -= 1
                            self.stats[self.current_stroke_direction] -= 1
                            self.stats[ai_dir] += 1
                            self.any_correction_sent = True
                            
                            self.last_confirmed_direction = ai_dir
                            self.current_stroke_direction = ai_dir
                            
                            symbol = "↓" if ai_dir == 'down' else "↑"
                            print(f"   🔄 {symbol} {ai_dir.upper()} (Peak AI: {ai_conf:.2f})")
                
                # Full AI verification (same as original)
                if (self.full_ai_available and
                    not self.full_ai_checked and
                    elapsed >= FULL_AI_TIMING_MS):
                    
                    self.full_ai_checked = True
                    full_dir, full_conf = self._get_full_ai_prediction()
                    
                    if full_dir:
                        if full_dir == self.current_stroke_direction:
                            self.stats['full_ai_agreed'] += 1
                            if self.debug_mode:
                                print(f"   [Full AI agreed: {full_dir}, conf: {full_conf:.2f}]")
                        else:
                            self.stats['full_ai_disagreed'] += 1
                            if self.debug_mode:
                                print(f"   ⚠ Full AI disagrees: {full_dir} (conf: {full_conf:.2f})")
            
            return
        
        # New stroke detection (same as original)
        if not self.stroke_in_progress:
            direction, strength = self._get_direction_and_strength(gyro_z)
            
            if direction:
                valid, reason = self._validate_stroke_strength(direction, strength)
                
                if not valid:
                    if self.debug_mode:
                        print(f"   [Blocked: {reason}]")
                    return
                
                time_since_last = current_time - self.last_stroke_end_time
                
                if time_since_last < self.current_gap:
                    self.stats['multi_trigger_prevented'] += 1
                    if self.debug_mode:
                        print(f"   [Too soon: {time_since_last}ms < {self.current_gap}ms]")
                    return
                
                # VALID STROKE DETECTED (UPDATED STRUM TRIGGERS)
                self.stroke_in_progress = True
                self.stroke_start_time = current_time
                self.stroke_data_for_ai = []
                self.current_stroke_direction = direction
                self.peak_stroke_strength = strength
                self.low_motion_start_time = None
                self.low_motion_samples = 0
                self.peak_ai_checked = False
                self.full_ai_checked = False
                self.any_correction_sent = False
                
                self.stats['total_strokes'] += 1
                self.stats[direction] += 1
                self.stats['physical_correct'] += 1
                
                self.last_confirmed_direction = direction
                self.last_confirmed_strength = strength
                
                symbol = "↓" if direction == 'down' else "↑"
                
                # Add AI status to output
                ai_status = " [AI ENABLED]" if self.ai_loaded else " [NO AI]"
                
                # Add chord information to strum output
                if self.current_chord_name:
                    chord_info = f" [{self.current_chord_name}]"
                elif self.active_finger and self.current_note:
                    chord_info = f" [{self.active_finger}: {self._get_note_name(self.current_note)}]"
                else:
                    chord_info = " [No chord]"
                
                # Send GS-2 strum trigger note instead of chord notes
                strum_note = DOWN_STRUM_NOTE if direction == 'down' else UP_STRUM_NOTE
                self._send_midi_note_on(strum_note)
                
                print(f"{symbol} {direction.upper()} STRUM{chord_info}{ai_status} (GS-2 Trigger: {self._get_note_name(strum_note)})")
    
    def _get_peak_ai_prediction(self):
        """Peak AI prediction (same as original)"""
        if not self.ai_loaded or len(self.stroke_data_for_ai) < 12:
            return None, 0.0
        
        try:
            stroke_data = np.array(self.stroke_data_for_ai)
            
            gyro_mags = np.sqrt(stroke_data[:, 3]**2 + stroke_data[:, 4]**2 + stroke_data[:, 5]**2)
            peak_idx = np.argmax(gyro_mags)
            
            half = 8
            start = max(0, peak_idx - half)
            end = min(len(stroke_data), start + 16)
            
            if end - start < 16:
                if start == 0:
                    end = min(16, len(stroke_data))
                else:
                    start = max(0, len(stroke_data) - 16)
                    end = len(stroke_data)
            
            window = stroke_data[start:end, :6]
            
            if len(window) < 16:
                padding = np.zeros((16 - len(window), 6))
                window = np.vstack([window, padding])
            
            window_norm = self.peak_scaler.transform(window)
            X = window_norm[np.newaxis, :, :]
            pred = self.peak_model.predict(X, verbose=0)
            pred_class = np.argmax(pred[0])
            confidence = pred[0][pred_class]
            
            direction = 'up' if pred_class == 1 else 'down'
            return direction, confidence
        except Exception as e:
            print(f"⚠ Peak AI prediction error: {e}")
            return None, 0.0

    def _get_full_ai_prediction(self):
        """Full AI prediction (same as original)"""
        if not self.full_ai_available or len(self.stroke_data_for_ai) < 18:
            return None, 0.0
        
        try:
            stroke_data = np.array(self.stroke_data_for_ai)
            window = stroke_data[:24, :6] if len(stroke_data) >= 24 else stroke_data[:, :6]
            
            if len(window) < 24:
                padding = np.zeros((24 - len(window), 6))
                window = np.vstack([window, padding])
            
            window_norm = self.full_scaler.transform(window)
            X = window_norm[np.newaxis, :, :]
            pred = self.full_model.predict(X, verbose=0)
            pred_class = np.argmax(pred[0])
            confidence = pred[0][pred_class]
            
            direction = 'up' if pred_class == 1 else 'down'
            return direction, confidence
        except Exception as e:
            print(f"⚠ Full AI prediction error: {e}")
            return None, 0.0
    
    # ============================================================================
    # MIDI METHODS (UPDATED FOR GS-2)
    # ============================================================================
    
    def _send_midi_note_on(self, note, retrigger=False):
        """Send MIDI note on (UPDATED FOR GS-2 CHORDS)"""
        if self.midi_out is None:
            return
        
        with self.midi_lock:
            try:
                # For retriggering during continuous strumming, don't send note off first (same as original)
                if not retrigger:
                    # Turn off previous note if exists (only for single notes, not chord notes)
                    if self.last_sent_note is not None and not self.current_chord_notes:
                        msg_off = mido.Message('note_off', note=self.last_sent_note, velocity=0)
                        self.midi_out.send(msg_off)
                
                # Send new note
                msg_on = mido.Message('note_on', note=note, velocity=MIDI_VELOCITY)
                self.midi_out.send(msg_on)
                
                self.last_sent_note = note
                self.last_note_time = self._now_ms()
                
                # Auto note-off after duration (only if not retriggering and not chord notes) - same as original
                if not retrigger and not self.current_chord_notes:
                    def auto_off():
                        time.sleep(NOTE_DURATION_MS / 1000.0)
                        with self.midi_lock:
                            if self.midi_out and self.last_sent_note == note:
                                try:
                                    msg_off = mido.Message('note_off', note=note, velocity=0)
                                    self.midi_out.send(msg_off)
                                    if self.last_sent_note == note:
                                        self.last_sent_note = None
                                except:
                                    pass
                    
                    thread = threading.Thread(target=auto_off, daemon=True)
                    thread.start()
            except:
                pass
    
    def _send_midi_note_off(self, note):
        """Send MIDI note off (same as original)"""
        if self.midi_out is None:
            return
        
        with self.midi_lock:
            try:
                msg_off = mido.Message('note_off', note=note, velocity=0)
                self.midi_out.send(msg_off)
                if self.last_sent_note == note:
                    self.last_sent_note = None
            except:
                pass
    
    def _now_ms(self):
        """Get current time in milliseconds (same as original)"""
        return time.monotonic_ns() // 1_000_000
    
    # ============================================================================
    # CLEANUP
    # ============================================================================
    
    def cleanup(self):
        """Cleanup resources (UPDATED FOR GS-2 CHORDS)"""
        if self.note_playing:
            if self.current_chord_notes:
                for note in self.current_chord_notes:
                    self._send_midi_note_off(note)
            elif self.current_note is not None:
                self._send_midi_note_off(self.current_note)
        print("✓ Guitar Controller: Cleaned up")

# ============================================================================
# STANDALONE DEMO
# ============================================================================

if __name__ == "__main__":
    print("🎸 Guitar Controller standalone demo")
    print("This module is designed to be imported into main_controller.py")
    print("\nFeatures:")
    print("  ✓ Left Hand: GS-2 Automatic Chords with zones and finger locking")
    print("  ✓ Right Hand: Strumming detection with FSR and AI correction") 
    print("  ✓ GS-2 chord keys: maj=[root], min=[root, nearest black left]")
    print("  ✓ GS-2 strum triggers: Down=C2, Up=D2")