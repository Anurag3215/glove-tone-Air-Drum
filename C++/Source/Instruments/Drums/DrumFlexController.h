#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>
#include <deque>
#include <cmath>

// Forward declaration
struct SensorSample;

// ============================================================================
// CONFIGURATION
// ============================================================================

constexpr int DRUM_THRESHOLD = 28;
constexpr int DRUM_GYRO_THRESHOLD = 105;
constexpr int DRUM_RESET_DELAY_MS = 150;
int flexMaskToMidiNote(int flexMask);
// Flex sensor thresholds (from original Python)
struct DrumFlexThresholds {
    static constexpr int THUMB = 350;
    static constexpr int INDEX = 350;
    static constexpr int MIDDLE = 350;
    static constexpr int RING = 550;
    static constexpr int PINKY = 650;
};

// Drum sound file paths (hardcoded from Python)
const std::unordered_map<int, std::string> DRUM_SOUND_PATHS = {
    {0b11111, "D:\\drumm soundss\\Kick 808 3.wav"},
    {0b11110, "D:\\drumm soundss\\Snare 909X 2.wav"},
    {0b11100, "D:\\drumm soundss\\MidTom GarageX V15.wav"},
    {0b11000, "D:\\drumm soundss\\Clap 808X.wav"},
    {0b10000, "D:\\drumm soundss\\Shaker Alphabetical 1.wav"},
    {0b00000, "D:\\drumm soundss\\Crash 909X.wav"}
};

const std::unordered_map<int, std::string> DRUM_NAMES = {
    {0b11111, "KICK"},
    {0b11110, "SNARE"},
    {0b11100, "TOM1"},
    {0b11000, "CLAP"},
    {0b10000, "SHAKER"},
    {0b00000, "CRASH"}
};

// ============================================================================
// HIT DETECTOR (ORIGINAL ALGORITHM)
// ============================================================================

class HitDetector {
private:
    int threshold_;
    int gyro_threshold_;
    bool was_above_;
    bool is_right_hand_;
    bool hit_triggered_;
    uint32_t time_fell_below_;
    int reset_delay_ms_;
    
    // Moving averages (maxlen=3 like original)
    std::deque<float> accel_history_;
    std::deque<float> gyro_history_;
    static constexpr size_t HISTORY_SIZE = 3;
    
    int compute_flex_mask(const SensorSample* sample);
    
public:
    HitDetector(bool is_right_hand, int threshold = DRUM_THRESHOLD);
    
    // Returns: (hit_detected, flex_mask, magnitude)
    struct HitResult {
        bool hit_detected;
        int flex_mask;
        float magnitude;
    };
    
    HitResult process_sample(const SensorSample* sample, uint32_t current_time_ms);
};

// ============================================================================
// DRUM HAND FLEX (SINGLE HAND)
// ============================================================================

class DrumHandFlex {
private:
    std::string hand_name_;
    int channel_id_;
    HitDetector detector_;
    
    // Statistics
    int hit_count_;
    int sample_count_;
    
    // Performance: reduce print frequency
    int hit_counter_;
    
    void play_drum_sound(int flex_mask);
    
public:
    DrumHandFlex(const std::string& hand_name, int channel_id);
    
    void handle_sample(const SensorSample* sample);
    
    int get_hit_count() const { return hit_count_; }
    int get_sample_count() const { return sample_count_; }
};

// ============================================================================
// DRUM CONTROLLER FLEX (MAIN CLASS)
// ============================================================================

class DrumFlexControllerImpl {
private:
    DrumHandFlex left_hand_;
    DrumHandFlex right_hand_;
    
public:
    DrumFlexControllerImpl();
    ~DrumFlexControllerImpl();
    
    void calibrate(const std::vector<SensorSample>& left_baseline,
                  const std::vector<SensorSample>& right_baseline);
    
    void handle_samples(const SensorSample* left_sample, const SensorSample* right_sample);
    
    struct Stats {
        int left_hits;
        int left_samples;
        int right_hits;
        int right_samples;
    };
    
    Stats get_stats() const;
};
