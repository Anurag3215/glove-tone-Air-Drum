"""
VIOLIN CONTROLLER - Integrated Violin System
Refactored for modular architecture with ORIGINAL behavior preserved
Left Hand: Pitch Control (Notes, Zones, Octaves) - NOW WITH POLYPHONY
Right Hand: Bow Control (FSR + Motion + AI Correction)
AI models are REQUIRED for violin
"""

import time
import math
import numpy as np
from collections import deque
import mido
import threading
import os

# Try to import AI dependencies, but don't crash if unavailable
try:
    import tensorflow as tf
    from tensorflow import keras
    import joblib
    AI_AVAILABLE = True
except ImportError:
    AI_AVAILABLE = False
    print("⚠️  AI dependencies not available - violin will use basic bow detection")

# ============================================================================
# LEFT HAND CONFIGURATION (Pitch Control)
# ============================================================================

# Flex sensor thresholds
FLEX_THRESHOLDS = {
    'thumb': 500,
    'index': 200, 
    'middle': 600,
    'ring': 600,
    'pinky': 600
}

# Pitch zones
class PitchZone:
    FLATS = 0
    NATURAL = 1  
    SHARPS = 2

# MIDI note definitions (C4 to C8 range)
NOTES_NATURAL = [60, 62, 64, 65, 67]  # C4, D4, E4, F4, G4
NOTES_SHARPS = [61, 63, 66, 68, 70]   # C#4, D#4, F#4, G#4, A#4
NOTES_FLATS = [57, 59, 60, 62, 64]    # A3, B3, C4, D4, E4

# Movement-based thresholds
NEUTRAL_CENTER = 130.0  # Your actual neutral position
NEUTRAL_ZONE = 25.0     # Range around neutral (115° to 145°)
OCTAVE_UP_THRESHOLD = 70.0   # Below this = octave up (thumb side)
OCTAVE_DOWN_THRESHOLD = -130.0

# Roll state
class RollState:
    NEUTRAL = "NEUTRAL"
    THUMB_UP = "THUMB_UP"  # Renamed for clarity
    PINKY_UP = "PINKY_UP"

# ============================================================================
# RIGHT HAND CONFIGURATION (Bow Control)
# ============================================================================

# Bow detection
ACCEL_X_THRESHOLD = 3.0
UP_BOW_MIN_AX = 1.8
DOWN_BOW_MAX_AX = -1.8

# Timing
BOW_MIN_DURATION_MS = 30
BOW_MAX_DURATION_MS = 800
MIN_INTER_BOW_GAP_MS = 60

# Bow ending
BOW_END_DURATION_MS = 30
LOW_MOTION_FACTOR = 0.4

# FSR
FSR_THRESHOLD = 500
FSR_DEBOUNCE_MS = 20

# AI settings
AI_TIMING_MS = 60
AI_CONFIDENCE_THRESHOLD = 0.85
FULL_AI_TIMING_MS = 100

# Expression detection
FLEX_MIDDLE_THRESHOLD = 600
FLEX_RING_THRESHOLD = 600
FLEX_PINKY_THRESHOLD = 600
EXPRESSION_DEBOUNCE_MS = 100

# Expression control (NEW)
EXPRESSION_NOTE = 19  # MIDI note for expression control
EXPRESSION_MIN_VELOCITY = 20
EXPRESSION_MAX_VELOCITY = 127
EXPRESSION_RAMP_TIME_MS = 2000  # 2 seconds to go from min to max
EXPRESSION_RAMP_STEP_MS = 50    # Update every 50ms

# AI Model paths (from original)
DEFAULT_MODEL_PATH = r"D:\Main project\violin\models"

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
        self.finger_active_in_zone = False
        self.finger_locked_zone = None

# ============================================================================
# VIOLIN CONTROLLER
# ============================================================================

class ViolinController:
    """
    Integrated Violin Controller
    Left Hand: Pitch control with zones and octaves - NOW POLYPHONIC
    Right Hand: Bow control with FSR, motion, and REQUIRED AI correction
    """

    def __init__(self, midi_out=None, model_path=DEFAULT_MODEL_PATH):
        print("🎻 Violin Controller: Initializing...")
        
        # MIDI output
        self.midi_out = midi_out
        self.midi_lock = threading.Lock()
        
        # Load AI models (REQUIRED for violin - from original)
        self.ai_loaded = False
        self.full_ai_available = False
        self.peak_model = None
        self.peak_scaler = None
        self.full_model = None
        self.full_scaler = None
        
        self._load_ai_models(model_path)
        
        # Shared state - UPDATED FOR POLYPHONY
        self.active_notes = set()  # Set of currently playing MIDI notes
        self.prepared_notes = set()  # Notes ready to play when bow starts
        self.note_playing = False
        self.bow_active = False
        
        # Initialize left hand components
        self._setup_left_hand()
        
        # Initialize right hand components  
        self._setup_right_hand()
        
        print("✓ Violin Controller: Ready")
        print(f"   Left: POLYPHONIC Pitch control (multiple fingers = multiple notes)")
        print(f"   Right: Bow control (FSR + motion + AI correction)")
        print(f"   AI: {'Loaded' if self.ai_loaded else 'NOT LOADED - using basic detection'}")
    
    def _load_ai_models(self, model_path):
        """Load AI models for bow detection (from original implementation)"""
        if not AI_AVAILABLE:
            print("⚠️  AI dependencies not available - install tensorflow and joblib")
            return
            
        try:
            # Load peak-centered model (REQUIRED)
            peak_model_file = os.path.join(model_path, "peak_centered_model.keras")
            peak_scaler_file = os.path.join(model_path, "peak_centered_scaler.pkl")
            
            if os.path.exists(peak_model_file) and os.path.exists(peak_scaler_file):
                self.peak_model = keras.models.load_model(peak_model_file)
                self.peak_scaler = joblib.load(peak_scaler_file)
                self.ai_loaded = True
                print("✓ Peak AI model loaded")
            else:
                print(f"⚠️  Peak AI model files not found at {model_path}")
                return
                
            # Try to load full model (optional)
            full_model_file = os.path.join(model_path, "full_model.keras")
            full_scaler_file = os.path.join(model_path, "full_scaler.pkl")
            
            if os.path.exists(full_model_file) and os.path.exists(full_scaler_file):
                self.full_model = keras.models.load_model(full_model_file)
                self.full_scaler = joblib.load(full_scaler_file)
                self.full_ai_available = True
                print("✓ Full AI model loaded")
            else:
                print("ℹ️  Full AI model not available (optional)")
                
        except Exception as e:
            print(f"❌ AI model loading failed: {e}")
            print("⚠️  [Violin] WARNING: Failed to load AI model, running without AI")
            self.ai_loaded = False
    
    def _setup_left_hand(self):
        """Initialize left hand pitch control components - UPDATED FOR POLYPHONY"""
        # Current orientation
        self.current_pitch = 0.0
        self.current_roll = 0.0  
        self.current_yaw = 0.0
        self.previous_roll = 0.0
        self.roll_history = deque(maxlen=5)
        
        # Current zone
        self.current_zone = PitchZone.NATURAL
        self.previous_zone = PitchZone.NATURAL
        
        # Octave offset - UPDATED: Start at octave 4 (C4), range C4 to C8
        self.octave_offset = 0  # C4 is base
        self.current_octave = 4  # Start at octave 4
        self.MIN_OCTAVE = 4     # C4
        self.MAX_OCTAVE = 8     # C8
        
        # Roll state
        self.roll_state = RollState.NEUTRAL
        self.last_roll_change_time = 0
        self.ROLL_CHANGE_COOLDOWN = 0.5
        self.returning_to_neutral = False
        
        # Debouncing
        self.DEBOUNCE_TIME = 0.05
        
        # Initialize flex sensors
        self.flex_sensors = {
            'thumb': FlexSensor('thumb', FLEX_THRESHOLDS['thumb']),
            'index': FlexSensor('index', FLEX_THRESHOLDS['index']),
            'middle': FlexSensor('middle', FLEX_THRESHOLDS['middle']), 
            'ring': FlexSensor('ring', FLEX_THRESHOLDS['ring']),
            'pinky': FlexSensor('pinky', FLEX_THRESHOLDS['pinky'])
        }
    
    def _setup_right_hand(self):
        """Initialize right hand bow control components - UPDATED FOR EXPRESSION"""
        # Bow state
        self.fsr_active = False
        self.fsr_state_change_time = None
        self.bow_in_progress = False
        self.bow_start_time = 0
        self.bow_data_for_ai = []
        self.last_bow_end_time = 0
        
        self.current_bow_direction = None
        self.previous_bow_direction = None
        self.peak_bow_strength = 0
        
        self.low_motion_start_time = None
        self.low_motion_samples = 0
        
        self.accel_x_buffer = deque(maxlen=3)
        self.accel_variance_buffer = deque(maxlen=6)
        
        self.peak_ai_checked = False
        self.full_ai_checked = False
        self.any_correction_sent = False
        
        # Expression state - UPDATED FOR GRADUAL CONTROL
        self.expression_active = False
        self.last_expression_time = 0
        self.expression_velocity = EXPRESSION_MIN_VELOCITY
        self.expression_ramp_start_time = 0
        self.expression_note_playing = False
        self.middle_bent = False
        self.ring_bent = False
        self.pinky_bent = False
        
        # Statistics
        self.stats = {
            'total_notes': 0,
            'direction_changes': 0,
            'down_bow_count': 0,
            'up_bow_count': 0,
            'expression_triggers': 0
        }
    
    def calibrate(self, left_baseline, right_baseline):
        """Receive calibration data from main controller"""
        print("✓ Violin Controller: Calibration received")
        # Can use baseline data for orientation normalization if needed
    
    def handle_samples(self, left_sample, right_sample):
        """
        Process samples from both hands
        Called by main controller when violin is active instrument
        """
        # Process left hand (pitch control)
        if left_sample:
            self._process_left_hand(left_sample)
        
        # Process right hand (bow control)
        if right_sample:
            self._process_right_hand(right_sample)
    
    # ============================================================================
    # LEFT HAND PROCESSING - UPDATED FOR POLYPHONY
    # ============================================================================
    
    def _process_left_hand(self, sample):
        """Process left hand data for pitch control - NOW POLYPHONIC"""
        # Update orientation
        self._update_left_orientation(sample)
        
        # Determine zone
        new_zone = self._determine_zone()
        if new_zone != self.current_zone:
            self.previous_zone = self.current_zone
            self.current_zone = new_zone
            print(f"→ Zone: {self._print_zone(self.current_zone)}")
        
        # Update octave offset
        self._update_octave_offset()
        
        # Process flex sensors
        for finger_name in self.flex_sensors.keys():
            self._read_left_flex_sensor(finger_name, sample)
    
    def _update_left_orientation(self, sample):
        """Update left hand orientation from sample data"""
        qw, qx, qy, qz = sample['qw'], sample['qx'], sample['qy'], sample['qz']
        pitch, roll, yaw = self._quaternion_to_euler(qw, qx, qy, qz)
        
        self.previous_roll = self.current_roll
        self.current_pitch = self._normalize_angle(pitch)
        self.current_roll = -self._normalize_angle(roll)  # Note: inverted roll
        self.current_yaw = self._normalize_angle(yaw)
        
        self.roll_history.append(self.current_roll)
    
    def _quaternion_to_euler(self, qw, qx, qy, qz):
        """Convert quaternion to Euler angles"""
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
        """Normalize angle to -180 to 180 degrees"""
        while angle > 180.0:
            angle -= 360.0
        while angle < -180.0:
            angle += 360.0
        return angle
    
    def _determine_zone(self):
        """Determine current pitch zone"""
        if self.current_yaw > 25.0:
            return PitchZone.SHARPS
        elif self.current_yaw < -25.0:
            return PitchZone.FLATS
        else:
            return PitchZone.NATURAL
    
    def _update_octave_offset(self):
        """Update octave based on roll movements - UPDATED FOR C4-C8 RANGE"""
        current_time = time.time()

        # Cooldown check
        if current_time - self.last_roll_change_time < self.ROLL_CHANGE_COOLDOWN:
            return

        if len(self.roll_history) < 3:
            return

        recent_movement = self.current_roll
    
        # Check if in neutral zone (around 120-140°)
        in_neutral = abs(recent_movement - NEUTRAL_CENTER) < NEUTRAL_ZONE
    
        if in_neutral:
            self.roll_state = RollState.NEUTRAL
            self.returning_to_neutral = False
            return

        # Not in neutral - check for octave changes
        if not self.returning_to_neutral:
            # OCTAVE UP: Thumb side up (roll < 80°)
            if 0 < recent_movement < OCTAVE_UP_THRESHOLD and self.roll_state == RollState.NEUTRAL:
                self.current_octave += 1
                if self.current_octave > self.MAX_OCTAVE:  # C8 max
                    self.current_octave = self.MAX_OCTAVE
                self.roll_state = RollState.THUMB_UP
                self.last_roll_change_time = current_time
                self.returning_to_neutral = True
                self.octave_offset = (self.current_octave - 4) * 12  # Calculate offset from C4
                print(f">>> OCTAVE UP to {self.current_octave} (roll: {recent_movement:.1f}°)")
        
            # OCTAVE DOWN: Pinky side up (roll < -120°)
            elif recent_movement < OCTAVE_DOWN_THRESHOLD and self.roll_state == RollState.NEUTRAL:
                self.current_octave -= 1
                if self.current_octave < self.MIN_OCTAVE:  # C4 min
                    self.current_octave = self.MIN_OCTAVE
                self.roll_state = RollState.PINKY_UP
                self.last_roll_change_time = current_time
                self.returning_to_neutral = True
                self.octave_offset = (self.current_octave - 4) * 12  # Calculate offset from C4
                print(f">>> OCTAVE DOWN to {self.current_octave} (roll: {recent_movement:.1f}°)")

        # Check for return to neutral
        elif self.returning_to_neutral:
            if in_neutral:
                self.roll_state = RollState.NEUTRAL
                self.returning_to_neutral = False
    
    def _read_left_flex_sensor(self, finger_name, sample):
        """Read and process left hand flex sensor - UPDATED FOR POLYPHONY"""
        sensor = self.flex_sensors[finger_name]
        current_time = time.time()
        
        flex_value = sample[f'flex_{finger_name}']
        is_bent_now = flex_value < sensor.threshold
        
        if is_bent_now and not sensor.is_bent:
            sensor.finger_locked_zone = self.current_zone
            sensor.finger_active_in_zone = True
            
            if current_time - sensor.last_note_time > self.DEBOUNCE_TIME:
                # Store the note but don't play it yet - wait for bow
                note = self._prepare_note(finger_name)
                if note:
                    self.prepared_notes.add(note)
                    sensor.last_note = note
                    sensor.last_note_time = current_time
            
            sensor.is_bent = True
            
        elif not is_bent_now and sensor.is_bent:
            sensor.is_bent = False
            sensor.finger_active_in_zone = False
            
            # Remove note from prepared notes and stop if playing
            if sensor.last_note in self.prepared_notes:
                self.prepared_notes.remove(sensor.last_note)
            
            if sensor.last_note in self.active_notes:
                self._send_note_off(sensor.last_note)
                self.active_notes.remove(sensor.last_note)
                print(f"✗ {sensor.name} - {self._get_note_name(sensor.last_note)}")
                
                # Update note playing state
                if not self.active_notes:
                    self.note_playing = False
    
    def _prepare_note(self, finger_name):
        """Prepare MIDI note (store it but don't play until bow is active) - UPDATED FOR POLYPHONY"""
        sensor = self.flex_sensors[finger_name]
        finger_index = ['thumb', 'index', 'middle', 'ring', 'pinky'].index(finger_name)
        base_note = 0
        
        zone_to_use = sensor.finger_locked_zone if sensor.finger_active_in_zone else self.current_zone
        
        if zone_to_use == PitchZone.NATURAL:
            base_note = NOTES_NATURAL[finger_index]
        elif zone_to_use == PitchZone.SHARPS:
            base_note = NOTES_SHARPS[finger_index]
        elif zone_to_use == PitchZone.FLATS:
            base_note = NOTES_FLATS[finger_index]
        
        final_note = base_note + self.octave_offset
        final_note = max(0, min(127, final_note))
        
        zone_name = "Natural" if zone_to_use == PitchZone.NATURAL else "Sharps" if zone_to_use == PitchZone.SHARPS else "Flats"
        print(f"♪ {sensor.name} → {self._get_note_name(final_note)} ({zone_name}) [READY]")
        
        return final_note
    
    def _play_current_notes(self):
        """Play all prepared notes (called when bow becomes active) - UPDATED FOR POLYPHONY"""
        if self.prepared_notes and not self.note_playing:
            for note in self.prepared_notes:
                self._send_note_on(note, 127)
                self.active_notes.add(note)
            
            self.note_playing = True
            note_names = ", ".join([self._get_note_name(note) for note in self.prepared_notes])
            print(f"🎻 BOWING: {note_names}")
    
    def _stop_current_notes(self):
        """Stop all active notes (called when bow stops) - UPDATED FOR POLYPHONY"""
        if self.active_notes:
            for note in list(self.active_notes):  # Create copy to avoid modification during iteration
                self._send_note_off(note)
                self.active_notes.remove(note)
            
            self.note_playing = False
            print("🎻 BOW STOPPED - All notes off")
    
    # ============================================================================
    # RIGHT HAND PROCESSING - UPDATED FOR EXPRESSION CONTROL
    # ============================================================================
    
    def _now_ms(self):
        """Get current time in milliseconds (from original)"""
        return time.monotonic_ns() // 1_000_000
    
    def _process_right_hand(self, sample):
        """Process right hand data for bow control - UPDATED FOR EXPRESSION"""
        current_time = self._now_ms()  # Use monotonic timestamp like original
        
        # Check expression state - UPDATED FOR GRADUAL CONTROL
        self._check_expression_state(sample, current_time)
        
        # Update bow state based on FSR
        self._update_bow_state(sample.get('fsr', 0), current_time)
        
        # Process bow motion if bow is active
        if self.bow_active:
            self._process_bow_motion(sample, current_time)
    
    def _check_expression_state(self, sample, current_time):
        """Check right hand expression - UPDATED FOR GRADUAL MIDI CONTROL"""
        middle_bent_now = sample['flex_middle'] < FLEX_MIDDLE_THRESHOLD
        ring_bent_now = sample['flex_ring'] < FLEX_RING_THRESHOLD
        pinky_bent_now = sample['flex_pinky'] < FLEX_PINKY_THRESHOLD
        
        expression_condition = (not middle_bent_now and 
                               ring_bent_now and 
                               pinky_bent_now)
        
        if expression_condition:
            if not self.expression_active:
                if current_time - self.last_expression_time >= EXPRESSION_DEBOUNCE_MS:
                    self.expression_active = True
                    self.expression_ramp_start_time = current_time
                    self.expression_velocity = EXPRESSION_MIN_VELOCITY
                    self.last_expression_time = current_time
                    self.stats['expression_triggers'] += 1
                    
                    # Start expression note
                    self._send_note_on(EXPRESSION_NOTE, self.expression_velocity)
                    self.expression_note_playing = True
                    print("🎭 EXPRESSION START")
            
            # Gradually increase expression velocity
            if self.expression_active:
                elapsed = current_time - self.expression_ramp_start_time
                progress = min(1.0, elapsed / EXPRESSION_RAMP_TIME_MS)
                
                # Calculate new velocity (gradual increase from 20 to 127)
                new_velocity = EXPRESSION_MIN_VELOCITY + int(
                    (EXPRESSION_MAX_VELOCITY - EXPRESSION_MIN_VELOCITY) * progress
                )
                
                if new_velocity != self.expression_velocity:
                    self.expression_velocity = new_velocity
                    self._send_note_on(EXPRESSION_NOTE, self.expression_velocity)
                    print(f"🎭 EXPRESSION: {self.expression_velocity}")
        else:
            if self.expression_active:
                self.expression_active = False
                if self.expression_note_playing:
                    self._send_note_off(EXPRESSION_NOTE)
                    self.expression_note_playing = False
                    print("🎭 EXPRESSION STOP")
        
        self.middle_bent = middle_bent_now
        self.ring_bent = ring_bent_now
        self.pinky_bent = pinky_bent_now
    
    def _update_bow_state(self, fsr_value, current_time):
        """Update bow state based on FSR"""
        fsr_now = fsr_value > FSR_THRESHOLD
        
        if fsr_now != self.fsr_active:
            if self.fsr_state_change_time is None:
                self.fsr_state_change_time = current_time
            elif current_time - self.fsr_state_change_time >= FSR_DEBOUNCE_MS:
                self.fsr_active = fsr_now
                self.fsr_state_change_time = None
                
                if self.fsr_active:
                    self._start_bowing(current_time)
                else:
                    self._stop_bowing(current_time)
        else:
            self.fsr_state_change_time = None
    
    def _start_bowing(self, current_time):
        """Start bowing - play current notes if available - UPDATED FOR POLYPHONY"""
        self.bow_active = True
        self.stats['total_notes'] += 1
        
        self.accel_x_buffer.clear()
        self.last_bow_end_time = current_time
        self.previous_bow_direction = None
        
        print("🎻 BOW START")
        
        # Play all prepared notes if available
        if self.prepared_notes and not self.note_playing:
            self._play_current_notes()
    
    def _stop_bowing(self, current_time):
        """Stop bowing - stop current notes - UPDATED FOR POLYPHONY"""
        self.bow_active = False
        if self.note_playing:
            self._stop_current_notes()
        else:
            print("🎻 BOW STOP")
        
        self.bow_in_progress = False
        self.previous_bow_direction = None
    
    def _get_direction_and_strength(self, accel_x):
        """Get bow direction and strength"""
        self.accel_x_buffer.append(accel_x)
        
        if len(self.accel_x_buffer) < 3:
            return None, 0
        
        smoothed_ax = np.mean(self.accel_x_buffer)
        strength = abs(smoothed_ax)
        
        if strength < ACCEL_X_THRESHOLD:
            return None, 0
        
        if smoothed_ax > UP_BOW_MIN_AX:
            return 'up', smoothed_ax
        elif smoothed_ax < DOWN_BOW_MAX_AX:
            return 'down', smoothed_ax
        
        return None, 0
    
    def _check_bow_ended(self, accel_x, current_time):
        """Check if current bow stroke has ended"""
        bow_duration = current_time - self.bow_start_time
        
        if bow_duration < BOW_MIN_DURATION_MS:
            return False
        
        if bow_duration > BOW_MAX_DURATION_MS:
            return True
        
        low_threshold = ACCEL_X_THRESHOLD * LOW_MOTION_FACTOR
        
        if abs(accel_x) < low_threshold:
            self.low_motion_samples += 1
            
            if self.low_motion_start_time is None:
                self.low_motion_start_time = current_time
            
            low_duration = current_time - self.low_motion_start_time
            
            if low_duration >= BOW_END_DURATION_MS and self.low_motion_samples >= 4:
                return True
        else:
            if abs(accel_x) > ACCEL_X_THRESHOLD:
                self.low_motion_start_time = None
                self.low_motion_samples = 0
        
        return False
    
    def _process_bow_motion(self, sample, current_time):
        """Process bow motion detection with AI correction"""
        imu_sample = [sample['ax'], sample['ay'], sample['az'],
                     sample['gx'], sample['gy'], sample['gz']]
        accel_x = sample['ax']
        
        # Bow end check
        if self.bow_in_progress:
            self.bow_data_for_ai.append(imu_sample)
            
            if self._check_bow_ended(accel_x, current_time):
                self.bow_in_progress = False
                self.peak_ai_checked = False
                self.full_ai_checked = False
                self.any_correction_sent = False
                self.low_motion_start_time = None
                self.low_motion_samples = 0
                self.last_bow_end_time = current_time
                return
            
            # AI correction logic (from original) - ONLY if AI is loaded
            if self.ai_loaded:
                elapsed = current_time - self.bow_start_time
                
                # Peak AI correction (REQUIRED)
                if (not self.peak_ai_checked and 
                    not self.any_correction_sent and
                    elapsed >= AI_TIMING_MS):
                    
                    self.peak_ai_checked = True
                    ai_dir, ai_conf = self._get_peak_ai_prediction()
                    
                    if ai_dir:
                        if ai_dir == self.current_bow_direction:
                            # AI agrees with physical detection
                            pass  # No action needed
                        elif ai_conf > AI_CONFIDENCE_THRESHOLD:
                            # AI correction
                            self.any_correction_sent = True
                            self.current_bow_direction = ai_dir
                            
                            symbol = "↓" if ai_dir == 'down' else "↑"
                            print(f"   🔄 {symbol} {ai_dir.upper()} BOW (AI Corrected: {ai_conf:.2f})")
                
                # Full AI verification (optional)
                if (self.full_ai_available and
                    not self.full_ai_checked and
                    elapsed >= FULL_AI_TIMING_MS):
                    
                    self.full_ai_checked = True
                    full_dir, full_conf = self._get_full_ai_prediction()
                    
                    if full_dir:
                        if full_dir == self.current_bow_direction:
                            # Full AI agrees
                            pass
                        else:
                            # Full AI disagrees (for monitoring only)
                            print(f"   ⚠ Full AI disagrees: {full_dir} (conf: {full_conf:.2f})")
            
            return
        
        # New bow detection
        if not self.bow_in_progress:
            direction, ax_value = self._get_direction_and_strength(accel_x)
            
            if not direction:
                return
            
            if direction == self.previous_bow_direction:
                return
            
            time_since_last = current_time - self.last_bow_end_time
            
            if time_since_last < MIN_INTER_BOW_GAP_MS:
                return
            
            # Valid bow detected
            self.bow_in_progress = True
            self.bow_start_time = current_time
            self.bow_data_for_ai = []
            self.current_bow_direction = direction
            self.previous_bow_direction = direction
            self.peak_bow_strength = abs(ax_value)
            self.low_motion_start_time = None
            self.low_motion_samples = 0
            self.peak_ai_checked = False
            self.full_ai_checked = False
            self.any_correction_sent = False
            
            self.stats['direction_changes'] += 1
            if direction == 'down':
                self.stats['down_bow_count'] += 1
            else:
                self.stats['up_bow_count'] += 1
            
            symbol = "↓" if direction == 'down' else "↑"
            print(f"   {symbol} {direction.upper()} BOW")
    
    def _get_peak_ai_prediction(self):
        """Peak AI prediction (REQUIRED for violin)"""
        if not self.ai_loaded or len(self.bow_data_for_ai) < 12:
            return None, 0.0
        
        try:
            bow_data = np.array(self.bow_data_for_ai)
            
            gyro_mags = np.sqrt(bow_data[:, 3]**2 + bow_data[:, 4]**2 + bow_data[:, 5]**2)
            peak_idx = np.argmax(gyro_mags)
            
            half = 8
            start = max(0, peak_idx - half)
            end = min(len(bow_data), start + 16)
            
            if end - start < 16:
                if start == 0:
                    end = min(16, len(bow_data))
                else:
                    start = max(0, len(bow_data) - 16)
                    end = len(bow_data)
            
            window = bow_data[start:end, :6]
            
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
        """Full AI prediction (optional)"""
        if not self.full_ai_available or len(self.bow_data_for_ai) < 18:
            return None, 0.0
        
        try:
            bow_data = np.array(self.bow_data_for_ai)
            window = bow_data[:24, :6] if len(bow_data) >= 24 else bow_data[:, :6]
            
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
    # MIDI METHODS - UPDATED FOR POLYPHONY AND EXPRESSION
    # ============================================================================
    
    def _send_note_on(self, note, velocity):
        """Send MIDI note on message"""
        if self.midi_out is not None:
            with self.midi_lock:
                try:
                    msg = mido.Message('note_on', note=note, velocity=velocity)
                    self.midi_out.send(msg)
                except:
                    pass
    
    def _send_note_off(self, note):
        """Send MIDI note off message"""
        if self.midi_out is not None:
            with self.midi_lock:
                try:
                    msg = mido.Message('note_off', note=note)
                    self.midi_out.send(msg)
                except:
                    pass
    
    def _get_note_name(self, midi_note):
        """Convert MIDI note number to note name"""
        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        octave = (midi_note // 12) - 1
        note_index = midi_note % 12
        return f"{note_names[note_index]}{octave}"
    
    def _print_zone(self, zone):
        """Print zone name"""
        if zone == PitchZone.NATURAL:
            return "Natural"
        elif zone == PitchZone.SHARPS:
            return "Sharps"
        elif zone == PitchZone.FLATS:
            return "Flats"
    
    # ============================================================================
    # CLEANUP - UPDATED FOR POLYPHONY AND EXPRESSION
    # ============================================================================
    
    def cleanup(self):
        """Cleanup resources - UPDATED FOR POLYPHONY"""
        # Stop all active notes
        if self.active_notes:
            for note in list(self.active_notes):
                self._send_note_off(note)
        
        # Stop expression note if playing
        if self.expression_note_playing:
            self._send_note_off(EXPRESSION_NOTE)
        
        print("✓ Violin Controller: Cleaned up")

# ============================================================================
# STANDALONE DEMO
# ============================================================================

if __name__ == "__main__":
    print("🎻 Violin Controller standalone demo")
    print("This module is designed to be imported into main_controller.py")
    print("\nIMPORTANT: Violin controller loads AI models internally")
    print("Make sure model files are available at the specified path")