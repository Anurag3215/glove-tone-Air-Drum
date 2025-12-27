#include "loop.h"
#include "../core/SensorSample.h" // For SensorSample and get_current_time
#include "../core/main_controller.h"
#include "../core/Logger.h"
// ============================================================================
// QUATERNION MATH (EXACT TRANSLATION FROM PYTHON)
// ============================================================================

std::array<float, 4> LoopManager::normalize_quaternion(const std::array<float, 4>& q) const {
    float norm = 0.0f;
    for (float val : q) {
        norm += val * val;
    }
    norm = std::sqrt(norm);
    
    if (norm > 0.0001f) {
        std::array<float, 4> result;
        for (size_t i = 0; i < 4; ++i) {
            result[i] = q[i] / norm;
        }
        return result;
    }
    return q;
}

float LoopManager::quaternion_angle(const std::array<float, 4>& q1, const std::array<float, 4>& q2) const {
    float dot = 0.0f;
    for (size_t i = 0; i < 4; ++i) {
        dot += q1[i] * q2[i];
    }
    
    // Clip to [-1, 1] exactly like Python np.clip
    dot = std::max(-1.0f, std::min(1.0f, dot));
    
    float angle_rad = 2.0f * std::acos(std::abs(dot));
    return angle_rad * (180.0f / M_PI);  // Convert to degrees
}

// ============================================================================
// LOOP MANAGER IMPLEMENTATION
// ============================================================================

LoopManager::LoopManager() {
    // Initialize with hardcoded DEFAULT values (fallback if no calibration)
    left_wakanda_target_ = LEFT_WAKANDA_CAPTURED;
    right_wakanda_target_ = RIGHT_WAKANDA_CAPTURED;
    
    std::cout << "✓ Loop Manager: Gesture engine initialized with default poses" << std::endl;
}

void LoopManager::handle_samples(const SensorSample* left_sample, const SensorSample* right_sample) {
    // Reset change flags (exact Python behavior)
    instrument_changed_ = false;
    mode_changed_ = false;
    pause_changed_ = false;
    loop_state_changed_ = false;
    
    // Process gestures (preserving original Python logic)
    if (left_sample) {
        process_left_gestures(left_sample);
    }
    
    if (right_sample) {  
        process_right_gestures(right_sample);
    }

}

bool LoopManager::calibrate(const std::vector<SensorSample>& left_samples, const std::vector<SensorSample>& right_samples) {
    std::cout << "✓ Loop Manager: Using hardcoded calibration (from original)" << std::endl;
    // Original used captured values, no dynamic calibration needed (exact Python behavior)
    return true;
}

void LoopManager::update_pose_targets(const std::array<float, 4>& left_wakanda,
                                     const std::array<float, 4>& right_wakanda) {
    left_wakanda_target_ = left_wakanda;
    right_wakanda_target_ = right_wakanda;
    
    std::cout << "✅ Pose targets updated dynamically!" << std::endl;
    std::cout << "   Wakanda (LEFT hand): [" << left_wakanda[0] << ", " << left_wakanda[1] 
              << ", " << left_wakanda[2] << ", " << left_wakanda[3] << "]" << std::endl;
    std::cout << "   Wakanda (RIGHT hand): [" << right_wakanda[0] << ", " << right_wakanda[1] 
              << ", " << right_wakanda[2] << ", " << right_wakanda[3] << "]" << std::endl;
    
}

void LoopManager::process_left_gestures(const SensorSample* sample) {
    double current_time = get_current_time();
    
    // Compare current orientation with targets (exact Python logic)
    std::array<float, 4> current_quat = {sample->qw, sample->qx, sample->qy, sample->qz};
    float angle_to_wakanda = quaternion_angle(current_quat, left_wakanda_target_);
    
    bool was_in_wakanda = left_state_.in_wakanda_zone;
    bool in_wakanda_zone = angle_to_wakanda < LEFT_WAKANDA_RADIUS;
    
    // Handle WAKANDA zone (instrument selection)
    if (in_wakanda_zone) {
        left_state_.wakanda_confidence += 1;
        
        if (left_state_.wakanda_confidence >= POSE_CONFIDENCE_FRAMES) {
            left_state_.in_wakanda_zone = true;
            
            if (!was_in_wakanda) {
                left_state_.pose_enter_time = current_time;
                left_state_.pose_action_triggered = false;
            }
            
            double hold_duration = current_time - left_state_.pose_enter_time;
            if (hold_duration >= INSTRUMENT_HOLD_TIME && !left_state_.pose_action_triggered) {
                if (current_time - left_state_.last_gesture_time >= GESTURE_COOLDOWN) {
                    handle_instrument_selection(sample);
                    left_state_.last_gesture_time = current_time;
                    left_state_.pose_action_triggered = true;
                }
            }
        }
    }
    // Not in Wakanda zone
    else {
        left_state_.wakanda_confidence = std::max(0, left_state_.wakanda_confidence - 1);
        
        if (left_state_.wakanda_confidence == 0) {
            left_state_.in_wakanda_zone = false;
        }
        
        left_state_.pose_action_triggered = false;
    }
    
    static int debug_counter = 0;
    if (++debug_counter % 30 == 0) {
        LOG_DEBUG("🎯 LEFT HAND | Quat: w=" << sample->qw << " x=" << sample->qx << " y=" << sample->qy << " z=" << sample->qz << " | Wakanda: " << angle_to_wakanda << "°/" << LEFT_WAKANDA_RADIUS << "° " << (in_wakanda_zone ? "✓" : "✗") << " | W-conf: " << left_state_.wakanda_confidence << "/5");
    }
}

void LoopManager::process_right_gestures(const SensorSample* sample) {
    double current_time = get_current_time();
    
    std::array<float, 4> current_quat = {sample->qw, sample->qx, sample->qy, sample->qz};
    float angle_to_wakanda = quaternion_angle(current_quat, right_wakanda_target_);
    
    bool was_in_wakanda = right_state_.in_wakanda_zone;
    bool in_wakanda_zone = angle_to_wakanda < RIGHT_WAKANDA_RADIUS;
    
    // Handle WAKANDA zone (pause/loop control)
    if (in_wakanda_zone) {
        right_state_.wakanda_confidence += 1;
        
        if (right_state_.wakanda_confidence >= POSE_CONFIDENCE_FRAMES) {
            right_state_.in_wakanda_zone = true;
            
            if (!was_in_wakanda) {
                right_state_.pose_enter_time = current_time;
                right_state_.pose_action_triggered = false;
            }
            
            double hold_duration = current_time - right_state_.pose_enter_time;
            if (hold_duration >= INSTRUMENT_HOLD_TIME && !right_state_.pose_action_triggered) {
                if (current_time - right_state_.last_gesture_time >= GESTURE_COOLDOWN) {
                    // Use RIGHT HAND thresholds from main_controller.h
                    bool thumb_bent = sample->flex_thumb < FlexThresholdsRight::THUMB;
                    bool index_bent = sample->flex_index < FlexThresholdsRight::INDEX;
                    bool middle_bent = sample->flex_middle < FlexThresholdsRight::MIDDLE;
                    bool ring_bent = sample->flex_ring < FlexThresholdsRight::RING;
                    bool pinky_bent = sample->flex_pinky < FlexThresholdsRight::PINKY;
                    
                    // Debug flex readings
                    static int flex_debug = 0;
                    if (++flex_debug % 10 == 0) {
                        LOG_DEBUG("🎯 RIGHT HAND FLEX | T=" << sample->flex_thumb << "/" << FlexThresholdsRight::THUMB << " I=" << sample->flex_index << "/" << FlexThresholdsRight::INDEX << " M=" << sample->flex_middle << "/" << FlexThresholdsRight::MIDDLE << " R=" << sample->flex_ring << "/" << FlexThresholdsRight::RING << " P=" << sample->flex_pinky << "/" << FlexThresholdsRight::PINKY << " | Pattern: " << (thumb_bent ? "-" : "T") << (index_bent ? "-" : "I") << (middle_bent ? "-" : "M") << (ring_bent ? "-" : "R") << (pinky_bent ? "-" : "P"));
                    }
                    
                    // PAUSE: Thumb straight, all others bent
                    if (!thumb_bent && index_bent && middle_bent && ring_bent && pinky_bent) {
                        handle_pause_toggle();
                        right_state_.last_gesture_time = current_time;
                        right_state_.pose_action_triggered = true;
                    }
                    // LOOP: Thumb+Index+Middle straight, Ring+Pinky bent
                    else if (!thumb_bent && !index_bent && !middle_bent && ring_bent && pinky_bent) {
                        handle_loop_toggle();
                        right_state_.last_gesture_time = current_time;
                        right_state_.pose_action_triggered = true;
                    }
                }
            }
        }
    }
    // Not in Wakanda zone
    else {
        right_state_.wakanda_confidence = std::max(0, right_state_.wakanda_confidence - 1);
        
        if (right_state_.wakanda_confidence == 0) {
            right_state_.in_wakanda_zone = false;
        }
        
        right_state_.pose_action_triggered = false;
    }
    
    // Add debug output for right hand quaternion
    static int right_debug_counter = 0;
    if (++right_debug_counter % 30 == 0) {
        LOG_DEBUG("🎯 RIGHT HAND | Quat: w=" << sample->qw << " x=" << sample->qx << " y=" << sample->qy << " z=" << sample->qz << " | Wakanda: " << angle_to_wakanda << "°/" << RIGHT_WAKANDA_RADIUS << "° " << (in_wakanda_zone ? "✓" : "✗") << " | W-conf: " << right_state_.wakanda_confidence << "/5");
    }
}

void LoopManager::handle_instrument_selection(const SensorSample* sample) {
    // Check which fingers are BENT (flex value BELOW threshold) - exact Python logic
    bool thumb_bent = sample->flex_thumb < flex_thresholds_.thumb;
    bool index_bent = sample->flex_index < flex_thresholds_.index;
    bool middle_bent = sample->flex_middle < flex_thresholds_.middle;
    bool ring_bent = sample->flex_ring < flex_thresholds_.ring;
    bool pinky_bent = sample->flex_pinky < flex_thresholds_.pinky;
    
    int new_instrument = current_instrument_;
    
    // CORRECTED FINGER COMBINATIONS (from original Python):
    if (!thumb_bent && !index_bent && !middle_bent && !ring_bent && !pinky_bent) {
        new_instrument = 5;  // All fingers UNBENT
    } else if (!thumb_bent && !index_bent && !middle_bent && !ring_bent && pinky_bent) {
        new_instrument = 4;  // Thumb+index+middle+ring UNBENT, pinky BENT
    } else if (!thumb_bent && !index_bent && !middle_bent && ring_bent && pinky_bent) {
        new_instrument = 3;  // Thumb+index+middle UNBENT, ring+pinky BENT
    } else if (!thumb_bent && !index_bent && middle_bent && ring_bent && pinky_bent) {
        new_instrument = 2;  // Thumb+index UNBENT, middle+ring+pinky BENT
    } else if (!thumb_bent && index_bent && middle_bent && ring_bent && pinky_bent) {
        new_instrument = 1;  // Only thumb UNBENT, all others BENT
    }
    
    if (new_instrument != current_instrument_) {
        current_instrument_ = new_instrument;
        instrument_changed_ = true;
        
        // Debug finger states (from original Python)
        std::string fingers = "";
        fingers += (!thumb_bent) ? "T" : "-";
        fingers += (!index_bent) ? "I" : "-";
        fingers += (!middle_bent) ? "M" : "-";
        fingers += (!ring_bent) ? "R" : "-";
        fingers += (!pinky_bent) ? "P" : "-";
        
        std::unordered_map<int, std::string> instrument_names = {
            {1, "Drums"}, {2, "Keys"}, {3, "Violin"}, {4, "Guitar"}, {5, "MP3 Player"}
        };
        
        LOG_INFO("🎵 INSTRUMENT: " << instrument_names[new_instrument] << " (Fingers: " << fingers << ")");
    }
}

void LoopManager::handle_loop_toggle() {
    // Exact Python behavior
    loop_recording_ = !loop_recording_;
    loop_state_changed_ = true;
    if (loop_recording_) {
        LOG_INFO("🔴 LOOP RECORDING STARTED");
    } else {
        LOG_INFO("⏹️ LOOP RECORDING STOPPED");
    }
}

void LoopManager::handle_pause_toggle() {
    // Exact Python behavior
    paused_ = !paused_;
    pause_changed_ = true;
    if (paused_) {
        LOG_INFO("⏸️ PAUSED");
    } else {
        LOG_INFO("▶️ RESUMED");
    }
}

