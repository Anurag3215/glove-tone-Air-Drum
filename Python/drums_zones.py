"""
DRUM CONTROLLER - Zone-Based Detection
Refactored for modular architecture with original behavior preserved
"""

import time
import math
import numpy as np
from collections import deque
import pygame
import os

# ============================================================================
# CONFIGURATION (from original)
# ============================================================================

# Zone thresholds
LOUT_THRESH = -75.0
LIN_THRESH = -7.5
RIN_THRESH = -7.5
ROUT_THRESH = 45.0
WAIST_GRAVITY_THRESH = 0.4
WAIST_DEBOUNCE_MS = 200
HIT_ACCEL_THRESH = 28.0
HIT_GYRO_THRESH = 105.0
HIT_RESET_DELAY_MS = 150
EMA_ALPHA_SLOW = 0.15
EMA_ALPHA_FAST = 0.40
HYST_YAW = 8.0
PRINT_MS = 120

# Zone sounds (same mapping as original)
ZONE_SOUNDS = {
    "Waist": "D:\\drumm soundss\\Snare 909X 2.wav",
    "LeftOuter": "D:\\drumm soundss\\Kick 808 3.wav", 
    "LeftInner": "D:\\drumm soundss\\MidTom GarageX V15.wav",
    "RightInner": "D:\\drumm soundss\\Shaker Alphabetical 1.wav",
    "RightOuter": "D:\\drumm soundss\\Crash 909X.wav",
}

# Sound cache
sound_cache = {}

# ============================================================================
# UTILITY FUNCTIONS (from original)
# ============================================================================

def wrap180(a):
    """Wrap angle to [-180, 180] range"""
    while a > 180.0:
        a -= 360.0
    while a < -180.0:
        a += 360.0
    return a

def get_yaw_from_quat(w, x, y, z):
    """Extract yaw from quaternion (rotation around Z-axis)"""
    siny_cosp = 2.0 * (w * z + x * y)
    cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
    return math.atan2(siny_cosp, cosy_cosp) * 180.0 / math.pi

def get_gravity_z(w, x, y, z):
    """Get gravity vector Z-component (how much hand is tilted down)"""
    gz = w*w - x*x - y*y + z*z
    return gz

def load_sound(filepath):
    """Load sound with error handling"""
    if filepath not in sound_cache:
        try:
            if os.path.exists(filepath):
                sound_cache[filepath] = pygame.mixer.Sound(filepath)
                print(f"  ✓ Loaded: {os.path.basename(filepath)}")
            else:
                print(f"  ❌ File not found: {filepath}")
                return None
        except Exception as e:
            print(f"  ❌ Error loading {filepath}: {e}")
            return None
    return sound_cache[filepath]

def play_zone_sound(zone, zone_sounds):
    """Play sound for zone with error handling"""
    if zone not in zone_sounds:
        return
    sound = load_sound(zone_sounds[zone])
    if sound:
        channel = pygame.mixer.find_channel()
        if channel:
            channel.play(sound)

# ============================================================================
# HIT DETECTOR (from original)
# ============================================================================

class HitDetector:
    def __init__(self, accel_threshold=HIT_ACCEL_THRESH, gyro_threshold=HIT_GYRO_THRESH):
        self.accel_threshold = accel_threshold
        self.gyro_threshold = gyro_threshold
        self.was_above = False
        self.hit_triggered = False
        self.time_fell_below = 0
        self.reset_delay_ms = HIT_RESET_DELAY_MS
        
        self.accel_history = deque(maxlen=3)
        self.gyro_history = deque(maxlen=3)
        
    def process_sample(self, sample, current_time_ms):
        """Hit detection: accel + gyro both required"""
        
        accel_raw = np.sqrt(sample['ax']**2 + sample['ay']**2 + sample['az']**2)
        gyro_raw = np.sqrt(sample['gx']**2 + sample['gy']**2 + sample['gz']**2) * 180.0 / np.pi
        
        self.accel_history.append(accel_raw)
        self.gyro_history.append(gyro_raw)
        
        accel_mag = np.mean(self.accel_history)
        gyro_mag = np.mean(self.gyro_history)
        
        is_above = accel_mag > self.accel_threshold and gyro_mag > self.gyro_threshold
        
        hit = False
        
        if is_above and not self.was_above:
            self.hit_triggered = False
        
        if is_above and not self.hit_triggered:
            hit = True
            self.hit_triggered = True
        
        if not is_above and self.was_above:
            self.time_fell_below = current_time_ms
        
        if not is_above and (current_time_ms - self.time_fell_below) > self.reset_delay_ms:
            self.hit_triggered = False
        
        self.was_above = is_above
        
        if hit:
            return True, accel_mag
        
        return False, None

# ============================================================================
# DRUM HAND ZONES (rebuilt from original DrumHand class)
# ============================================================================

class DrumHandZones:
    """
    Zone-based drum controller for a single hand
    Replicates exact behavior from original drums_zones_original.py
    """
    
    def __init__(self, hand_name, zone_sounds, channel_id=0):
        self.hand_name = hand_name
        self.zone_sounds = zone_sounds
        self.channel_id = channel_id
        
        # State variables (from original)
        self.have_yaw_zero = False
        self.yaw0 = 0.0
        self.yaw_E = 0.0
        self.gyro_mag_E = 0.0
        self.grav_Z_E = 0.0
        self.seeded = False
        self.current_zone = "LeftInner"
        self.waist_start_ms = 0
        self.last_print = 0
        self.waist_gravity_thresh = WAIST_GRAVITY_THRESH  # Will be calibrated
        
        # Detection (from original)
        self.detector = HitDetector()
        self.stats = {'hits': 0, 'samples': 0}
        
        # Timing (from original)
        self.last_sample_time = time.perf_counter()
        self.sample_count = 0
        self.sample_rate = 0
        self.last_rate_calc_time = time.perf_counter()
        
        # Sample buffer for calibration (from original)
        self.sample_buffer = deque(maxlen=50)
        
        print(f"✓ Drum Hand ({hand_name}): Zone controller initialized")
    
    def set_baseline(self, yaw0, waist_gravity_thresh=None):
        """Set calibration baseline - replicates original calibration behavior"""
        self.yaw0 = yaw0
        self.have_yaw_zero = True
        self.seeded = False
        
        if waist_gravity_thresh is not None:
            self.waist_gravity_thresh = waist_gravity_thresh
            
        print(f"✓ Drum Hand ({self.hand_name}): Baseline set - yaw0: {yaw0:.2f}°, waist_thresh: {self.waist_gravity_thresh:.3f}")
    
    def handle_sample(self, sample):
        """Process a single sample - replicates original _process_loop logic"""
        if sample is None:
            return
            
        self.stats['samples'] += 1
        self.sample_count += 1
        self.sample_buffer.append(sample)
        
        # Update sample rate calculation (from original)
        current_time = time.perf_counter()
        if current_time - self.last_rate_calc_time >= 1.0:
            self.sample_rate = self.sample_count
            self.sample_count = 0
            self.last_rate_calc_time = current_time
        
        # Wait for calibration (from original)
        if not self.have_yaw_zero:
            return
        
        # Extract values (from original)
        qw, qx, qy, qz = sample['qw'], sample['qx'], sample['qy'], sample['qz']
        gx, gy, gz = sample['gx'], sample['gy'], sample['gz']
        current_time_ms = sample['ts']
        
        # Calculate yaw and gravity (from original)
        yaw = get_yaw_from_quat(qw, qx, qy, qz)
        grav_z = get_gravity_z(qw, qx, qy, qz)
        gyro_mag = math.sqrt(gx*gx + gy*gy + gz*gz) * 180.0 / math.pi
        
        # Calculate relative yaw (from original)
        yaw_rel = wrap180(yaw - self.yaw0)
        
        # Invert left hand zones for consistent orientation (from original)
        if self.hand_name.strip() == "LEFT":
            yaw_rel = -yaw_rel  # Invert for left hand
        
        # Initialize smoothing (from original)
        if not self.seeded:
            self.yaw_E = yaw_rel
            self.gyro_mag_E = gyro_mag
            self.grav_Z_E = grav_z
            self.seeded = True
        
        # Smooth values (from original)
        self.yaw_E = EMA_ALPHA_SLOW * yaw_rel + (1.0 - EMA_ALPHA_SLOW) * self.yaw_E
        self.gyro_mag_E = EMA_ALPHA_FAST * gyro_mag + (1.0 - EMA_ALPHA_FAST) * self.gyro_mag_E
        self.grav_Z_E = EMA_ALPHA_SLOW * grav_z + (1.0 - EMA_ALPHA_SLOW) * self.grav_Z_E
        
        # Classify zone (from original)
        zone = self._classify_zone(self.yaw_E, self.grav_Z_E, current_time_ms)
        
        # Detect hit (from original)
        hit_detected, magnitude = self.detector.process_sample(sample, current_time_ms)
        
        if hit_detected:
            self.stats['hits'] += 1
            play_zone_sound(zone, self.zone_sounds)
            
            # Format output (from original)
            hand_label = "LEFT " if self.hand_name.strip() == "LEFT" else "RIGHT"
            print(f"🥁 {hand_label} HIT #{self.stats['hits']:3d} | ZONE: {zone:12s} | {magnitude:5.1f} m/s² | yaw={self.yaw_E:6.1f}°")
        
        # Print status occasionally (from original)
        current_time_real = time.time() * 1000
        if current_time_real - self.last_print >= PRINT_MS:
            self.last_print = current_time_real
            
            hand_label = "LEFT " if self.hand_name.strip() == "LEFT" else "RIGHT"
            print(f"{hand_label}: yaw={self.yaw_E:5.1f}° gravZ={self.grav_Z_E:4.2f} | ZONE: {zone:12s} | Rate: {self.sample_rate:3.0f}Hz")
        
        self.current_zone = zone
    
    def _classify_zone(self, yaw_rel, grav_z, current_time_ms):
        """Zone classification with hysteresis - exact replica from original"""
        # WAIST detection (from original)
        if grav_z < self.waist_gravity_thresh:
            if self.waist_start_ms == 0:
                self.waist_start_ms = current_time_ms
            if current_time_ms - self.waist_start_ms >= WAIST_DEBOUNCE_MS:
                return "Waist"
        else:
            self.waist_start_ms = 0
        
        # Zone classification by yaw with hysteresis (from original)
        # Note: Left hand yaw is already inverted, so logic remains the same for both hands
        if yaw_rel < (LOUT_THRESH - (-HYST_YAW if self.current_zone == "LeftOuter" else HYST_YAW)):
            return "LeftOuter"
        elif yaw_rel < (LIN_THRESH - (-HYST_YAW if self.current_zone == "LeftInner" else HYST_YAW)):
            return "LeftInner"
        elif yaw_rel > (ROUT_THRESH + (-HYST_YAW if self.current_zone == "RightOuter" else HYST_YAW)):
            return "RightOuter"
        elif yaw_rel > (RIN_THRESH + (-HYST_YAW if self.current_zone == "RightInner" else HYST_YAW)):
            return "RightInner"
        else:
            if self.current_zone == "LeftOuter" or self.current_zone == "LeftInner":
                return "LeftInner"
            else:
                return "RightInner"

    def compute_yaw_average(self, num_samples=40):
        """Average yaw over samples - from original"""
        if len(self.sample_buffer) < num_samples:
            return None
        
        yaw_sum = 0.0
        count = 0
        
        for sample in list(self.sample_buffer)[-num_samples:]:
            yaw = get_yaw_from_quat(sample['qw'], sample['qx'], sample['qy'], sample['qz'])
            yaw_sum += yaw
            count += 1
        
        return yaw_sum / count if count > 0 else 0.0

    def compute_waist_baseline(self, num_samples=40):
        """Compute waist gravity baseline - from original"""
        if len(self.sample_buffer) < num_samples:
            return None
        
        gz_sum = 0.0
        count = 0
        
        for sample in list(self.sample_buffer)[-num_samples:]:
            gz = get_gravity_z(sample['qw'], sample['qx'], sample['qy'], sample['qz'])
            gz_sum += gz
            count += 1
        
        if count > 0:
            waist_grav_z = gz_sum / count
            return waist_grav_z - 0.5  # From original: waist_grav_z - 0.5
        
        return None

# ============================================================================
# DRUM CONTROLLER ZONES (main interface for main_controller.py)
# ============================================================================

class DrumControllerZones:
    """
    Zone-based drum controller for both hands
    Uses orientation-based zones instead of flex sensors
    """
    
    def __init__(self):
        # Initialize hand controllers with their own zone sounds
        self.left_hand = DrumHandZones("LEFT", ZONE_SOUNDS, channel_id=0)
        self.right_hand = DrumHandZones("RIGHT", ZONE_SOUNDS, channel_id=1)
        
        # Calibration state
        self.calibrated = False
        
        print("✓ Drum Controller (Zones): Initialized - 5 zones per hand")
        print("  Zones: LeftOuter, LeftInner, RightInner, RightOuter, Waist")
    
    def calibrate(self, left_calibration_samples, right_calibration_samples):
        """
    Receive calibration samples from main controller and compute baselines
    FIXED VERSION: Handles both raw sample lists and baseline dicts
    """
        try:
        # Check if we received raw sample lists (from calibration) or baseline dicts
            if (isinstance(left_calibration_samples, list) and 
                isinstance(right_calibration_samples, list) and
                len(left_calibration_samples) > 0 and 
                len(right_calibration_samples) > 0):
            
            # This is the expected case - raw calibration samples
                if not left_calibration_samples or not right_calibration_samples:
                    print("❌ Drum Controller (Zones): No calibration samples provided")
                    return
            
            # Fill hand buffers with calibration samples (like original)
                for sample in left_calibration_samples:
                    self.left_hand.sample_buffer.append(sample)
                for sample in right_calibration_samples:
                    self.right_hand.sample_buffer.append(sample)
            
            # Compute yaw baselines (like original)
                left_yaw0 = self.left_hand.compute_yaw_average(40)
                right_yaw0 = self.right_hand.compute_yaw_average(40)
            
            # Compute waist gravity thresholds (like original)  
                left_waist_thresh = self.left_hand.compute_waist_baseline(40)
                right_waist_thresh = self.right_hand.compute_waist_baseline(40)
            
                if left_yaw0 is None or right_yaw0 is None:
                    print("❌ Drum Controller (Zones): Calibration failed - not enough samples")
                    return
            
            # Set baselines (use defaults if waist computation failed)
                self.left_hand.set_baseline(
                left_yaw0, 
                left_waist_thresh if left_waist_thresh is not None else WAIST_GRAVITY_THRESH
                )
                self.right_hand.set_baseline(
                right_yaw0,
                right_waist_thresh if right_waist_thresh is not None else WAIST_GRAVITY_THRESH
                )
            
                self.calibrated = True
                print("✓ Drum Controller (Zones): Calibration complete")
                print(f"  Left: yaw0={left_yaw0:.2f}°, waist_thresh={self.left_hand.waist_gravity_thresh:.3f}")
                print(f"  Right: yaw0={right_yaw0:.2f}°, waist_thresh={self.right_hand.waist_gravity_thresh:.3f}")
            
            else:
            # Received baseline dicts (from other instruments' calibration format) - ignore for zones
            # But still mark as calibrated since we have default thresholds
                print("✓ Drum Controller (Zones): Using internal calibration (default thresholds)")
            # Set default baselines if needed
                if not self.left_hand.have_yaw_zero:
                    self.left_hand.set_baseline(0.0, WAIST_GRAVITY_THRESH)
                if not self.right_hand.have_yaw_zero:
                    self.right_hand.set_baseline(0.0, WAIST_GRAVITY_THRESH)
                self.calibrated = True
            
        except Exception as e:
            print(f"❌ Drum Controller (Zones): Calibration failed - {e}")
            self.calibrated = False
    
    def handle_samples(self, left_sample, right_sample):
        """Process samples from both hands - main entry point for main_controller"""
        
        if not self.calibrated:
            return
            
        if left_sample:
            self.left_hand.handle_sample(left_sample)
        
        if right_sample:
            self.right_hand.handle_sample(right_sample)
    
    def get_stats(self):
        """Get statistics from both hands"""
        return {
            'left': self.left_hand.stats,
            'right': self.right_hand.stats
        }

# ============================================================================
# STANDALONE DEMO
# ============================================================================

if __name__ == "__main__":
    print("Drum Controller (Zones) standalone demo")
    print("This module is designed to be imported into main_controller.py")
    print("\nZone Configuration:")
    print("  5 Zones: LeftOuter, LeftInner, RightInner, RightOuter, Waist")
    print("  Zones detected by hand orientation (yaw) and tilt (gravity Z)")