"""
DRUM CONTROLLER - Flex-Based Detection
Refactored for modular architecture with original behavior preserved
"""

import numpy as np
from collections import deque
import pygame
import os

# ============================================================================
# CONFIGURATION
# ============================================================================

THRESHOLD = 30

# Flex sensor thresholds (from original)
FLEX_THRESHOLDS = {
    'thumb': 500,
    'index': 230, 
    'middle': 650,
    'ring': 680,
    'pinky': 750
}

# Drum sounds (same mapping for both hands as in original)
DRUM_SOUNDS = {
    0b11111: "D:\\drumm soundss\\Kick 808 3.wav",
    0b11110: "D:\\drumm soundss\\Snare 909X 2.wav", 
    0b11100: "D:\\drumm soundss\\MidTom GarageX V15.wav",
    0b11000: "D:\\drumm soundss\\Clap 808X.wav",
    0b10000: "D:\\drumm soundss\\Shaker Alphabetical 1.wav",
    0b00000: "D:\\drumm soundss\\Crash 909X.wav"
}

DRUM_NAMES = {
    0b11111: "KICK",
    0b11110: "SNARE",
    0b11100: "TOM1", 
    0b11000: "CLAP",
    0b10000: "SHAKER",
    0b00000: "CRASH"
}

# Sound cache
sound_cache = {}

# ============================================================================
# SOUND MANAGEMENT
# ============================================================================

def load_sound(filepath):
    """Cache drum sounds for instant playback"""
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

def play_drum_sound(flex_mask, drum_sounds, channel_id=0):
    """Play drum sound based on flex sensor mask"""
    if flex_mask not in drum_sounds:
        return
    
    filepath = drum_sounds[flex_mask]
    sound = load_sound(filepath)
    
    if sound:
        channel = pygame.mixer.Channel(channel_id)
        channel.play(sound)

# ============================================================================
# HIT DETECTOR (ORIGINAL BEHAVIOR PRESERVED)
# ============================================================================

class HitDetector:
    """Hit detection using accelerometer and gyroscope thresholds - ORIGINAL ALGORITHM"""
    
    def __init__(self, threshold=THRESHOLD):
        self.threshold = threshold
        self.gyro_threshold = 105  # From original
        self.was_above = False
        self.hit_triggered = False
        self.time_fell_below = 0
        self.reset_delay_ms = 150  # From original debouncing
        
        # Moving averages like original
        self.accel_history = deque(maxlen=3)
        self.gyro_history = deque(maxlen=3)
        
    def process_sample(self, sample, current_time_ms):
        """Hit detection: accel + gyro both required - ORIGINAL LOGIC"""
        
        # Compute magnitudes exactly like original
        accel_raw = np.sqrt(sample['ax']**2 + sample['ay']**2 + sample['az']**2)
        gyro_raw = np.sqrt(sample['gx']**2 + sample['gy']**2 + sample['gz']**2) * 180.0 / np.pi
        
        self.accel_history.append(accel_raw)
        self.gyro_history.append(gyro_raw)
        
        # Use moving average like original
        accel_mag = np.mean(self.accel_history)
        gyro_mag = np.mean(self.gyro_history)
        
        # Both thresholds must be exceeded (ORIGINAL REQUIREMENT)
        is_above = accel_mag > self.threshold and gyro_mag > self.gyro_threshold
        
        hit = False
        
        # State machine from original
        if is_above and not self.was_above:
            self.hit_triggered = False
        
        if is_above and not self.hit_triggered:
            hit = True
            self.hit_triggered = True
        
        if not is_above and self.was_above:
            self.time_fell_below = current_time_ms
        
        # Debouncing: wait 150ms after falling below threshold before allowing new hit
        if not is_above and (current_time_ms - self.time_fell_below) > self.reset_delay_ms:
            self.hit_triggered = False
        
        self.was_above = is_above
        
        if hit:
            flex_mask = self._compute_flex_mask(sample)
            return True, flex_mask, accel_mag
        
        return False, None, None
    
    def _compute_flex_mask(self, sample):
        """Compute flex mask from individual flex values - ORIGINAL LOGIC"""
        mask = 0
        
        # BENT (low value) = bit SET (1), EXTENDED (high value) = bit CLEAR (0)
        # Exactly as in original
        if sample['flex_thumb'] < FLEX_THRESHOLDS['thumb']:
            mask |= (1 << 0)  # thumb bit
        
        if sample['flex_index'] < FLEX_THRESHOLDS['index']:
            mask |= (1 << 1)  # index bit
            
        if sample['flex_middle'] < FLEX_THRESHOLDS['middle']:
            mask |= (1 << 2)  # middle bit
            
        if sample['flex_ring'] < FLEX_THRESHOLDS['ring']:
            mask |= (1 << 3)  # ring bit
            
        if sample['flex_pinky'] < FLEX_THRESHOLDS['pinky']:
            mask |= (1 << 4)  # pinky bit
        
        return mask

# ============================================================================
# DRUM HAND FLEX (ORIGINAL BEHAVIOR)
# ============================================================================

class DrumHandFlex:
    """
    Flex-based drum controller for a single hand
    Uses finger combinations to determine drum sounds - ORIGINAL BEHAVIOR
    """
    
    def __init__(self, hand_name, drum_sounds, channel_id=0):
        self.hand_name = hand_name
        self.drum_sounds = drum_sounds
        self.channel_id = channel_id
        
        # Detection (same as original)
        self.detector = HitDetector()
        self.stats = {'hits': 0, 'samples': 0}
        
        # Performance: Reduce print frequency
        self.last_hit_print = 0
        self.hit_counter = 0
        
        print(f"✓ Drum Hand ({hand_name}): Flex controller initialized")
    
    def handle_sample(self, sample):
        """Process a single sample for this hand - ORIGINAL PROCESSING"""
        if sample is None:
            return
            
        self.stats['samples'] += 1
        current_time = sample['ts']
        
        # Detect hit using original algorithm
        hit_detected, flex_mask, magnitude = self.detector.process_sample(sample, current_time)
        
        if hit_detected:
            self.stats['hits'] += 1
            self.hit_counter += 1
            drum_name = DRUM_NAMES.get(flex_mask, "UNKNOWN")
            
            # Play sound on designated channel (0 for left, 1 for right as in original)
            play_drum_sound(flex_mask, self.drum_sounds, self.channel_id)
            
            # PERFORMANCE: Only print every 5th hit to reduce console spam
            if self.hit_counter % 5 == 0:
                hand_label = "LEFT " if self.hand_name.strip() == "LEFT" else "RIGHT"
                print(f"🥁 {hand_label} HIT #{self.stats['hits']:3d} | {drum_name:8s} | "
                      f"{magnitude:5.1f} m/s² | Flex: 0b{flex_mask:05b}")

# ============================================================================
# DRUM CONTROLLER FLEX (MAIN CLASS FOR MAIN_CONTROLLER)
# ============================================================================

class DrumControllerFlex:
    """
    Flex-based drum controller for both hands
    Uses finger combinations to determine drum sounds on hit
    ORIGINAL BEHAVIOR PRESERVED
    """
    
    def __init__(self):
        # Initialize hand controllers with drum sounds (same for both as in original)
        self.left_hand = DrumHandFlex("LEFT", DRUM_SOUNDS, channel_id=0)
        self.right_hand = DrumHandFlex("RIGHT", DRUM_SOUNDS, channel_id=1)
        
        print("✓ Drum Controller (Flex): Initialized")
        print("  Finger combinations determine drum sounds:")
        print("  0b11111 = KICK, 0b11110 = SNARE, 0b11100 = TOM1")
        print("  0b11000 = CLAP, 0b10000 = SHAKER, 0b00000 = CRASH")
    
    def calibrate(self, left_baseline, right_baseline):
        """
        Receive calibration data from main controller
        Original didn't use dynamic calibration, so this is a no-op
        """
        print("✓ Drum Controller (Flex): Calibration received (using fixed flex thresholds)")
        # Original used fixed FLEX_THRESHOLDS, no dynamic calibration needed
    
    def handle_samples(self, left_sample, right_sample):
        """Process samples from both hands - ORIGINAL BEHAVIOR"""
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
# FLEX MASK EXPLANATION
# ============================================================================

def explain_flex_masks():
    """Explain the flex mask to drum sound mapping"""
    print("\n🎵 Flex Mask to Drum Sound Mapping:")
    print("  Bits: [thumb][index][middle][ring][pinky]")
    print("  1 = bent, 0 = extended")
    print()
    
    for mask, drum_name in DRUM_NAMES.items():
        binary_str = f"0b{mask:05b}"
        finger_states = []
        for i, finger in enumerate(['thumb', 'index', 'middle', 'ring', 'pinky']):
            if mask & (1 << (4 - i)):
                finger_states.append(finger[0].upper())
            else:
                finger_states.append('-')
        finger_display = ''.join(finger_states)
        
        print(f"  {binary_str} ({finger_display}) → {drum_name}")

# ============================================================================
# STANDALONE DEMO
# ============================================================================

if __name__ == "__main__":
    print("Drum Controller (Flex) standalone demo")
    print("This module is designed to be imported into main_controller.py")
    explain_flex_masks()
    
    # Demo of how it would be used
    print("\nExample usage in main controller:")
    print("  drum_controller = DrumControllerFlex()")
    print("  drum_controller.handle_samples(left_sample, right_sample)")