"""
LOOP MANAGER - Gesture Engine & Instrument Switching
Refactored for modular architecture with proper API
"""

import time
import numpy as np
from collections import deque

# ============================================================================
# CONFIGURATION
# ============================================================================

# Gesture thresholds
LEFT_WAKANDA_RADIUS = 40.0
LEFT_L_POSE_RADIUS = 80.0
RIGHT_L_POSE_RADIUS = 40.0

POSE_CONFIDENCE_FRAMES = 3
INSTRUMENT_HOLD_TIME = 1.2
GESTURE_COOLDOWN = 0.8
WRIST_FLICK_THRESHOLD = 3.5

# Flex sensor thresholds
FLEX_THRESHOLDS = {
    'thumb': 500, 'index': 200, 'middle': 600, 'ring': 600, 'pinky': 600
}

# Hardcoded captured values (from original)
LEFT_WAKANDA_CAPTURED = np.array([0.115789, -0.600533, 0.481405, -0.627855])
LEFT_L_POSE_CAPTURED = np.array([0.645721, -0.297059, -0.679390, -0.182287])
RIGHT_L_POSE_CAPTURED = np.array([0.838002, 0.064784, -0.541629, 0.013930])

# ============================================================================
# QUATERNION MATH
# ============================================================================

def normalize_quaternion(q):
    norm = np.linalg.norm(q)
    if norm > 0.0001:
        return q / norm
    return q

def quaternion_angle(q1, q2):
    dot = np.dot(q1, q2)
    dot = np.clip(dot, -1.0, 1.0)
    angle_rad = 2.0 * np.arccos(abs(dot))
    return np.degrees(angle_rad)

# ============================================================================
# LOOP MANAGER (Gesture Engine)
# ============================================================================

class LoopManager:
    """
    Gesture engine that runs continuously
    Detects instrument switching, modes, pause, and loop controls
    Returns system state changes for main controller to act upon
    """
    
    def __init__(self):
        # Hand states (preserved from original)
        self.left_state = {
            'in_wakanda_zone': False,
            'in_l_pose_zone': False,
            'wakanda_confidence': 0,
            'l_pose_confidence': 0,
            'pose_enter_time': 0,
            'pose_action_triggered': False,
            'last_gesture_time': 0,
            'last_flick_time': 0
        }
        
        self.right_state = {
            'in_l_pose_zone': False,
            'l_pose_confidence': 0,
            'pose_enter_time': 0,
            'pose_action_triggered': False,
            'last_gesture_time': 0
        }
        
        # System state (from original behavior)
        self.current_instrument = 1  # 1-5
        self.current_mode = 1  # 1 or 2
        self.paused = False
        self.loop_recording = False
        self.both_hands_l_pose_handled = False
        
        # Target orientations (hardcoded from original)
        self.left_wakanda_target = LEFT_WAKANDA_CAPTURED
        self.left_l_pose_target = LEFT_L_POSE_CAPTURED
        self.right_l_pose_target = RIGHT_L_POSE_CAPTURED
        
        # State change flags for main controller
        self.instrument_changed = False
        self.mode_changed = False
        self.pause_changed = False
        self.loop_state_changed = False
        
        print("✓ Loop Manager: Gesture engine initialized")
    
    def handle_samples(self, left_sample, right_sample):
        """
        Process new samples and detect gestures
        Returns: dict with system state and change flags
        """
        # Reset change flags
        self.instrument_changed = False
        self.mode_changed = False
        self.pause_changed = False
        self.loop_state_changed = False
        
        # Process gestures (preserving original logic)
        if left_sample:
            self._process_left_gestures(left_sample)
        
        if right_sample:  
            self._process_right_gestures(right_sample)
        
        # Reset both hands flag if not in L-pose
        if not (self.left_state['in_l_pose_zone'] and self.right_state['in_l_pose_zone']):
            self.both_hands_l_pose_handled = False
        
        return self._get_system_state()
    
    def calibrate(self, left_samples, right_samples):
        """
        Calibration interface - original used hardcoded values
        so this is essentially a no-op for consistency
        """
        print("✓ Loop Manager: Using hardcoded calibration (from original)")
        # Original used captured values, no dynamic calibration needed
        return True
    
    def _get_system_state(self):
        """Return current system state for main controller"""
        return {
            'current_instrument': self.current_instrument,
            'current_mode': self.current_mode,
            'paused': self.paused,
            'loop_recording': self.loop_recording,
            'instrument_changed': self.instrument_changed,
            'mode_changed': self.mode_changed,
            'pause_changed': self.pause_changed,
            'loop_state_changed': self.loop_state_changed
        }
    
    def _process_left_gestures(self, sample):
        """Process left hand gestures (preserved from original)"""
        current_time = time.time()
        
        # Compare current orientation with targets
        current_quat = np.array([sample['qw'], sample['qx'], sample['qy'], sample['qz']])
        angle_to_wakanda = quaternion_angle(current_quat, self.left_wakanda_target)
        angle_to_l_pose = quaternion_angle(current_quat, self.left_l_pose_target)
        
        was_in_wakanda = self.left_state['in_wakanda_zone']
        was_in_l_pose = self.left_state['in_l_pose_zone']
        
        # Check spherical zones with separate radii (from original)
        in_wakanda_zone = angle_to_wakanda < LEFT_WAKANDA_RADIUS
        in_l_pose_zone = angle_to_l_pose < LEFT_L_POSE_RADIUS
        
        # Handle WAKANDA zone (instrument selection) - original logic
        if in_wakanda_zone and not in_l_pose_zone:
            self.left_state['wakanda_confidence'] += 1
            self.left_state['l_pose_confidence'] = max(0, self.left_state['l_pose_confidence'] - 1)
            
            if self.left_state['wakanda_confidence'] >= POSE_CONFIDENCE_FRAMES:
                self.left_state['in_wakanda_zone'] = True
                
                if not was_in_wakanda:
                    self.left_state['pose_enter_time'] = current_time
                    self.left_state['pose_action_triggered'] = False
                
                hold_duration = current_time - self.left_state['pose_enter_time']
                if hold_duration >= INSTRUMENT_HOLD_TIME and not self.left_state['pose_action_triggered']:
                    if current_time - self.left_state['last_gesture_time'] >= GESTURE_COOLDOWN:
                        self._handle_instrument_selection(sample)
                        self.left_state['last_gesture_time'] = current_time
                        self.left_state['pose_action_triggered'] = True
        
        # Handle L-POSE zone (pause + both-hands delete) - original logic
        elif in_l_pose_zone and not in_wakanda_zone:
            self.left_state['l_pose_confidence'] += 1
            self.left_state['wakanda_confidence'] = max(0, self.left_state['wakanda_confidence'] - 1)
            
            if self.left_state['l_pose_confidence'] >= POSE_CONFIDENCE_FRAMES:
                self.left_state['in_l_pose_zone'] = True
                
                if not was_in_l_pose:
                    self.left_state['pose_enter_time'] = current_time
                    self.left_state['pose_action_triggered'] = False
                    
                    # Check for both hands L-pose (delete track)
                    if self.right_state['in_l_pose_zone']:
                        self._handle_both_hands_delete(current_time)
                
                # Wrist flick detection for pause (from original)
                if abs(sample['gx']) > WRIST_FLICK_THRESHOLD:
                    if current_time - self.left_state['last_flick_time'] > 0.5:
                        if current_time - self.left_state['last_gesture_time'] >= GESTURE_COOLDOWN:
                            self._handle_pause_toggle()
                            self.left_state['last_gesture_time'] = current_time
                            self.left_state['last_flick_time'] = current_time
        
        # Not in any zone
        else:
            self.left_state['wakanda_confidence'] = max(0, self.left_state['wakanda_confidence'] - 1)
            self.left_state['l_pose_confidence'] = max(0, self.left_state['l_pose_confidence'] - 1)
            
            if self.left_state['wakanda_confidence'] == 0:
                self.left_state['in_wakanda_zone'] = False
            if self.left_state['l_pose_confidence'] == 0:
                self.left_state['in_l_pose_zone'] = False
            
            self.left_state['pose_action_triggered'] = False
    
    def _process_right_gestures(self, sample):
        """Process right hand gestures (preserved from original)"""
        current_time = time.time()
        
        current_quat = np.array([sample['qw'], sample['qx'], sample['qy'], sample['qz']])
        angle_to_l_pose = quaternion_angle(current_quat, self.right_l_pose_target)
        
        was_in_l_pose = self.right_state['in_l_pose_zone']
        
        in_l_pose_zone = angle_to_l_pose < RIGHT_L_POSE_RADIUS
        
        if in_l_pose_zone:
            self.right_state['l_pose_confidence'] += 1
            
            if self.right_state['l_pose_confidence'] >= POSE_CONFIDENCE_FRAMES:
                self.right_state['in_l_pose_zone'] = True
                
                if not was_in_l_pose:
                    self.right_state['pose_enter_time'] = current_time
                    self.right_state['pose_action_triggered'] = False
                    
                    # Check for both hands L-pose (delete track)
                    if self.left_state['in_l_pose_zone']:
                        self._handle_both_hands_delete(current_time)
                
                # Loop recording toggle on right L-pose (from original)
                if not self.right_state['pose_action_triggered']:
                    if current_time - self.right_state['last_gesture_time'] >= GESTURE_COOLDOWN:
                        self._handle_loop_toggle()
                        self.right_state['last_gesture_time'] = current_time
                        self.right_state['pose_action_triggered'] = True
        
        else:
            self.right_state['l_pose_confidence'] = max(0, self.right_state['l_pose_confidence'] - 1)
            if self.right_state['l_pose_confidence'] == 0:
                self.right_state['in_l_pose_zone'] = False
            self.right_state['pose_action_triggered'] = False
    
    def _handle_instrument_selection(self, sample):
        """Select instrument based on flex finger combinations (from original)"""
        # Check which fingers are BENT (flex value BELOW threshold)
        thumb_bent = sample['flex_thumb'] < FLEX_THRESHOLDS['thumb']
        index_bent = sample['flex_index'] < FLEX_THRESHOLDS['index']
        middle_bent = sample['flex_middle'] < FLEX_THRESHOLDS['middle']
        ring_bent = sample['flex_ring'] < FLEX_THRESHOLDS['ring']
        pinky_bent = sample['flex_pinky'] < FLEX_THRESHOLDS['pinky']
        
        new_instrument = self.current_instrument
        
        # CORRECTED FINGER COMBINATIONS (from original):
        if not thumb_bent and not index_bent and not middle_bent and not ring_bent and not pinky_bent:
            new_instrument = 5  # All fingers UNBENT
        elif not thumb_bent and not index_bent and not middle_bent and not ring_bent and pinky_bent:
            new_instrument = 4  # Thumb+index+middle+ring UNBENT, pinky BENT
        elif not thumb_bent and not index_bent and not middle_bent and ring_bent and pinky_bent:
            new_instrument = 3  # Thumb+index+middle UNBENT, ring+pinky BENT
        elif not thumb_bent and not index_bent and middle_bent and ring_bent and pinky_bent:
            new_instrument = 2  # Thumb+index UNBENT, middle+ring+pinky BENT
        elif not thumb_bent and index_bent and middle_bent and ring_bent and pinky_bent:
            new_instrument = 1  # Only thumb UNBENT, all others BENT
        
        if new_instrument != self.current_instrument:
            self.current_instrument = new_instrument
            self.instrument_changed = True
            
            # Debug finger states (from original)
            fingers = ""
            fingers += "T" if not thumb_bent else "-"
            fingers += "I" if not index_bent else "-" 
            fingers += "M" if not middle_bent else "-"
            fingers += "R" if not ring_bent else "-"
            fingers += "P" if not pinky_bent else "-"
            
            instrument_names = {1: "Drums", 2: "Keys", 3: "Violin", 4: "Guitar", 5: "MP3 Player"}
            print(f"🎵 INSTRUMENT: {instrument_names[new_instrument]} (Fingers: {fingers})")
    
    def _handle_loop_toggle(self):
        """Toggle loop recording (from original)"""
        self.loop_recording = not self.loop_recording
        self.loop_state_changed = True
        if self.loop_recording:
            print("🔴 LOOP RECORDING STARTED")
        else:
            print("⏹️ LOOP RECORDING STOPPED")
    
    def _handle_pause_toggle(self):
        """Toggle pause state (from original)"""
        self.paused = not self.paused
        self.pause_changed = True
        if self.paused:
            print("⏸️ PAUSED")
        else:
            print("▶️ RESUMED")
    
    def _handle_both_hands_delete(self, current_time):
        """Both hands in L-pose: delete track (from original)"""
        if not self.both_hands_l_pose_handled:
            if current_time - self.left_state['last_gesture_time'] >= GESTURE_COOLDOWN and \
               current_time - self.right_state['last_gesture_time'] >= GESTURE_COOLDOWN:
                print("🗑️ DELETE TRACK (BOTH HANDS)")
                self.left_state['last_gesture_time'] = current_time
                self.right_state['last_gesture_time'] = current_time
                self.both_hands_l_pose_handled = True

# ============================================================================
# STANDALONE DEMO
# ============================================================================

if __name__ == "__main__":
    print("Loop Manager standalone demo")
    print("This module is designed to be imported into main_controller.py")