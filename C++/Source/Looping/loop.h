#pragma once

#include <array>
#include <cmath>
#include <iostream>
#include <string>
#include <unordered_map>
#include <algorithm>
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Configuration constants (exact from Python)
constexpr float LEFT_WAKANDA_RADIUS = 40.0f;


constexpr float RIGHT_WAKANDA_RADIUS = 40.0f;
constexpr int POSE_CONFIDENCE_FRAMES = 5;
constexpr double INSTRUMENT_HOLD_TIME = 1.2;
constexpr double GESTURE_COOLDOWN = 0.8;
constexpr float WRIST_FLICK_THRESHOLD = 3.5f;

// Hardcoded captured values (from original Python)
constexpr std::array<float, 4> LEFT_WAKANDA_CAPTURED = {0.713000f, -0.632000f, -0.279000f, -0.118000f};
constexpr std::array<float, 4> RIGHT_WAKANDA_CAPTURED = {0.461000f, -0.003000f, -0.701000f, -0.544000f};

// Forward declaration
struct SensorSample;

class LoopManager {
private:
    // Hand states (preserved from original Python)
    struct LeftHandState {
        bool in_wakanda_zone = false;
        bool in_l_pose_zone = false;
        int wakanda_confidence = 0;
        int l_pose_confidence = 0;
        double pose_enter_time = 0;
        bool pose_action_triggered = false;
        double last_gesture_time = 0;
        double last_flick_time = 0;
    };
    
    struct RightHandState {
        bool in_wakanda_zone = false;
        int wakanda_confidence = 0;
        double pose_enter_time = 0;
        bool pose_action_triggered = false;
        double last_gesture_time = 0;
    };
    
    // System state (from original Python behavior)
    int current_instrument_ = 1;  // 1-5
    int current_mode_ = 1;        // 1 or 2
    bool paused_ = false;
    bool loop_recording_ = false;
    
    // Hand states
    LeftHandState left_state_;
    RightHandState right_state_;
    
    // Target orientations (hardcoded from original Python)
    std::array<float, 4> left_wakanda_target_;
    std::array<float, 4> right_wakanda_target_;
    
    // State change flags for main controller
    bool instrument_changed_ = false;
    bool mode_changed_ = false;
    bool pause_changed_ = false;
    bool loop_state_changed_ = false;
    
    // Flex sensor thresholds (exact from Python)
    struct FlexThresholds {
        uint16_t thumb = 350;
        uint16_t index = 350;
        uint16_t middle = 350;
        uint16_t ring = 550;
        uint16_t pinky = 650;
    } flex_thresholds_;
    
    // Quaternion math functions (exact translation from Python)
    std::array<float, 4> normalize_quaternion(const std::array<float, 4>& q) const;
    float quaternion_angle(const std::array<float, 4>& q1, const std::array<float, 4>& q2) const;
    
    // Processing methods (exact translation from Python)
    void process_left_gestures(const SensorSample* sample);
    void process_right_gestures(const SensorSample* sample);
    void handle_instrument_selection(const SensorSample* sample);
    void handle_loop_toggle();
    void handle_pause_toggle();

public:
    LoopManager();
    
    // Main interface - exact translation of Python handle_samples
    void handle_samples(const SensorSample* left_sample, const SensorSample* right_sample);
    
    // Calibration interface - preserved from Python
    bool calibrate(const std::vector<SensorSample>& left_samples, const std::vector<SensorSample>& right_samples);
    
    void update_pose_targets(const std::array<float, 4>& left_wakanda,
                        const std::array<float, 4>& right_wakanda);
    // Getters for system state
    struct SystemState {
        int current_instrument;
        int current_mode;
        bool paused;
        bool loop_recording;
        bool instrument_changed;
        bool mode_changed;
        bool pause_changed;
        bool loop_state_changed;
    };
    
    SystemState get_system_state() const {
        return {
            current_instrument_,
            current_mode_,
            paused_,
            loop_recording_,
            instrument_changed_,
            mode_changed_,
            pause_changed_,
            loop_state_changed_
        };
    }
    
    // Individual getters
    int get_current_instrument() const { return current_instrument_; }
    int get_current_mode() const { return current_mode_; }
    bool is_paused() const { return paused_; }
    bool is_loop_recording() const { return loop_recording_; }
    
    // Change flag getters
    bool instrument_changed() const { return instrument_changed_; }
    bool mode_changed() const { return mode_changed_; }
    bool pause_changed() const { return pause_changed_; }
    bool loop_state_changed() const { return loop_state_changed_; }
};