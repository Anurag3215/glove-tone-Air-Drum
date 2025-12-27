#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>
#include <deque>
#include <cmath>

// Forward declaration
#include "../../core/SensorSample.h"

// ============================================================================
// CONFIGURATION (from original Python)
// ============================================================================

// Zone thresholds
constexpr float LOUT_THRESH = -75.0f;
constexpr float LIN_THRESH = -7.5f;
constexpr float RIN_THRESH = -7.5f;
constexpr float ROUT_THRESH = 45.0f;
constexpr float WAIST_GRAVITY_THRESH = 0.4f;
constexpr int WAIST_DEBOUNCE_MS = 200;
constexpr float HIT_ACCEL_THRESH = 28.0f;
constexpr float HIT_GYRO_THRESH = 105.0f;
constexpr int HIT_RESET_DELAY_MS = 150;
constexpr float EMA_ALPHA_SLOW = 0.15f;
constexpr float EMA_ALPHA_FAST = 0.40f;
constexpr float HYST_YAW = 8.0f;
constexpr int PRINT_MS = 120;
int zoneToMidiNote(int zoneNote);

// Zone sounds (hardcoded from Python)
const std::unordered_map<std::string, std::string> ZONE_SOUND_PATHS = {
    {"Waist", "D:\\drumm soundss\\Snare 909X 2.wav"},
    {"LeftOuter", "D:\\drumm soundss\\Kick 808 3.wav"},
    {"LeftInner", "D:\\drumm soundss\\MidTom GarageX V15.wav"},
    {"RightInner", "D:\\drumm soundss\\Shaker Alphabetical 1.wav"},
    {"RightOuter", "D:\\drumm soundss\\Crash 909X.wav"}
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

float wrap180(float a);
float get_yaw_from_quat(float w, float x, float y, float z);
float get_gravity_z(float w, float x, float y, float z);

// ============================================================================
// HIT DETECTOR (from original)
// ============================================================================

class ZoneHitDetector {
private:
    float accel_threshold_;
    float gyro_threshold_;
    bool was_above_;
    bool hit_triggered_;
    uint32_t time_fell_below_;
    int reset_delay_ms_;
    
    std::deque<float> accel_history_;
    std::deque<float> gyro_history_;
    static constexpr size_t HISTORY_SIZE = 3;
    
public:
    ZoneHitDetector(float accel_threshold = HIT_ACCEL_THRESH, 
                    float gyro_threshold = HIT_GYRO_THRESH);
    
    struct HitResult {
        bool hit_detected;
        float magnitude;
    };
    
    HitResult process_sample(const SensorSample* sample, uint32_t current_time_ms);
};

// ============================================================================
// DRUM HAND ZONES (single hand)
// ============================================================================

class DrumHandZones {
private:
    std::string hand_name_;
    int channel_id_;
    ZoneHitDetector detector_;
    
    // State variables (from original)
    bool have_yaw_zero_;
    float yaw0_;
    float yaw_E_;
    float gyro_mag_E_;
    float grav_Z_E_;
    bool seeded_;
    std::string current_zone_;
    uint32_t waist_start_ms_;
    double last_print_;
    float waist_gravity_thresh_;
    
    // Statistics
    int hit_count_;
    int sample_count_;
    
    // Timing
    double last_sample_time_;
    int sample_rate_;
    double last_rate_calc_time_;
    
    // Sample buffer for calibration
    std::deque<SensorSample> sample_buffer_;
    static constexpr size_t BUFFER_SIZE = 50;
    
    std::string classify_zone(float yaw_rel, float grav_z, uint32_t current_time_ms);
    void play_zone_sound(const std::string& zone);
    
public:
    DrumHandZones(const std::string& hand_name, int channel_id);
    
    void set_baseline(float yaw0, float waist_gravity_thresh);
    void handle_sample(const SensorSample* sample);
    
    float compute_yaw_average(int num_samples = 40);
    float compute_waist_baseline(int num_samples = 40);
    
    int get_hit_count() const { return hit_count_; }
    int get_sample_count() const { return sample_count_; }
    bool is_calibrated() const { return have_yaw_zero_; }
    
    // For calibration
    void add_calibration_sample(const SensorSample& sample);
};

// ============================================================================
// DRUM CONTROLLER ZONES (main class)
// ============================================================================

class DrumZonesControllerImpl {
private:
    DrumHandZones left_hand_;
    DrumHandZones right_hand_;
    bool calibrated_;
    
public:
    DrumZonesControllerImpl();
    ~DrumZonesControllerImpl();
    
    void calibrate(const std::vector<SensorSample>& left_samples,
                  const std::vector<SensorSample>& right_samples);
    
    void handle_samples(const SensorSample* left_sample, const SensorSample* right_sample);
    
    struct Stats {
        int left_hits;
        int left_samples;
        int right_hits;
        int right_samples;
    };
    
    Stats get_stats() const;
};
