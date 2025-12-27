#pragma once

#include "../../core/SensorSample.h"
#include "../../core/main_controller.h"
#include <array>
#include <chrono>
#include <cstdint>
#include <deque>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

// TensorFlow Lite includes
#include "tensorflow/lite/interpreter.h"
#include "tensorflow/lite/kernels/register.h"
#include "tensorflow/lite/model.h"

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

// Right Hand - Strumming Detection
constexpr float GYRO_Z_THRESHOLD = 2.0f;
constexpr float DOWN_MIN_MULTIPLIER = 0.9f;
constexpr float DOWN_REPEAT_MULTIPLIER = 1.2f;
constexpr float UP_MIN_MULTIPLIER = 0.8f;
constexpr float UP_REPEAT_MULTIPLIER = 0.75f;
constexpr float RESET_MOTION_MULTIPLIER = 0.75f;

constexpr int STROKE_MIN_DURATION_MS = 20;
constexpr int STROKE_MAX_DURATION_MS = 200;
constexpr int MIN_INTER_STROKE_GAP_MS = 60; // Fixed gap, no adaptive
constexpr int OPPOSITE_DIRECTION_LOCKOUT_MS =
    80; // Reduced for faster alternating strums
constexpr int STROKE_END_DURATION_MS = 25;
constexpr float LOW_MOTION_FACTOR = 0.35f;

constexpr int FSR_THRESHOLD = 500;
constexpr int FSR_DEBOUNCE_MS = 30;

constexpr int AI_TIMING_MS = 60;
constexpr float AI_CONFIDENCE_THRESHOLD = 0.92f;
constexpr int FULL_AI_TIMING_MS = 110;

constexpr int ADAPTIVE_MIN_GAP = 80;
constexpr int ADAPTIVE_MAX_GAP = 150;
constexpr float ADAPTIVE_MULTIPLIER = 0.65f;

// Left Hand - Pitch Control

// MIDI
constexpr int MIDI_VELOCITY = 100;
constexpr int MIDI_CHANNEL = 0;
constexpr int NOTE_DURATION_MS = 50;

// GS-2 Strum Triggers
constexpr int DOWN_STRUM_NOTE = 36; // C2
constexpr int UP_STRUM_NOTE = 38;   // D2

// ============================================================================
// ENUMS AND STRUCTURES
// ============================================================================

struct ChordInfo {
  std::string root_note_name;
  std::string quality; // "maj", "min", "7", "m7"
};

// Hash function for pair<PitchZone, string> to use in unordered_map
struct PairHash {
  template <class T1, class T2>
  std::size_t operator()(const std::pair<T1, T2> &p) const {
    auto h1 = std::hash<int>{}(static_cast<int>(p.first));
    auto h2 = std::hash<std::string>{}(p.second);
    return h1 ^ (h2 << 1);
  }
};

// ============================================================================
// GUITAR CONTROLLER CLASS
// ============================================================================

class GuitarController : public InstrumentController {
public:
  struct FlexThresholds {
    static constexpr int THUMB = 350;
    static constexpr int INDEX = 350;
    static constexpr int MIDDLE = 350;
    static constexpr int RING = 550;
    static constexpr int PINKY = 650;
  };

  enum class PitchZone { NATURAL = 1, FLATS = 2 };

  struct FlexSensor {
    std::string name;
    int threshold;
    bool is_bent;
    int last_note;
    double last_note_time;
    bool zone_locked;
    PitchZone locked_zone;

    // Chord caching to avoid recalculation
    std::vector<int> cached_chord_notes;
    std::string cached_chord_name;
    PitchZone cached_zone;
    bool cache_valid;

    FlexSensor()
        : threshold(0), is_bent(false), last_note(0), last_note_time(0),
          zone_locked(false), locked_zone(PitchZone::NATURAL),
          cached_zone(PitchZone::NATURAL), cache_valid(false) {}
    FlexSensor(const std::string &n, int t)
        : name(n), threshold(t), is_bent(false), last_note(0),
          last_note_time(0), zone_locked(false),
          locked_zone(PitchZone::NATURAL), cached_zone(PitchZone::NATURAL),
          cache_valid(false) {}
  };

  GuitarController(
      void *midi_out = nullptr,
      const std::string &model_path = "D:\\Main project\\guitar\\models\\");
  ~GuitarController();

  void handle_samples(const SensorSample *left_sample,
                      const SensorSample *right_sample) override;
  void calibrate(const std::vector<SensorSample> &left_baseline,
                 const std::vector<SensorSample> &right_baseline) override;

private:
  // ========================================================================
  // MIDI OUTPUT (Simple interface for now)
  // ========================================================================
  void *midi_out_;
  std::mutex midi_lock_;
  int last_sent_note_;
  int64_t last_note_time_;

  // Non-threaded note-off scheduling
  int pending_note_off_;
  double pending_note_off_time_;

  void _send_midi_note_on(int note, bool retrigger = false);
  void _send_midi_note_off(int note);

  // ========================================================================
  // GS-2 CHORD STATE
  // ========================================================================
  std::vector<int> current_chord_notes_;
  std::string current_chord_name_;

  // Chord mapping
  std::unordered_map<std::pair<PitchZone, std::string>, ChordInfo, PairHash>
      chord_map_;
  std::unordered_map<std::string, int> note_name_to_midi_;
  std::set<int> white_keys_;
  std::set<int> black_keys_;

  // Note arrays
  std::array<int, 5> notes_natural_;
  std::array<int, 5> notes_flats_;

  void _init_chord_maps();
  int _nearest_left(int root_midi, bool want_black);
  std::pair<std::vector<int>, std::string>
  _gs2_chord_keys(int root_midi, const std::string &quality);
  std::pair<std::vector<int>, std::string>
  _get_chord_for_finger(const std::string &finger_name, PitchZone zone);
  std::string _get_note_name(int midi_note);
  std::string _print_zone(PitchZone zone);

  // ========================================================================
  // AI MODELS
  // ========================================================================
  bool ai_loaded_;
  bool full_ai_available_;

  // TensorFlow Lite models
  std::unique_ptr<tflite::FlatBufferModel> peak_model_;
  std::unique_ptr<tflite::Interpreter> peak_interpreter_;
  std::unique_ptr<tflite::FlatBufferModel> full_model_;
  std::unique_ptr<tflite::Interpreter> full_interpreter_;

  // Normalization parameters (hardcoded from user)
  std::array<float, 6> peak_mean_;
  std::array<float, 6> peak_scale_;
  std::array<float, 6> full_mean_;
  std::array<float, 6> full_scale_;

  bool _load_ai_models(const std::string &model_path);
  std::pair<std::string, float> _get_peak_ai_prediction();
  std::pair<std::string, float> _get_full_ai_prediction();

  // ========================================================================
  // LEFT HAND STATE
  // ========================================================================
  float current_pitch_;
  float current_roll_;
  float current_yaw_;

  PitchZone current_zone_;
  PitchZone previous_zone_;

  std::unordered_map<std::string, FlexSensor> flex_sensors_;

  int current_note_;
  bool note_playing_;
  std::string active_finger_;
  std::set<std::string> bent_fingers_;
  std::unordered_map<std::string, double> finger_bend_times_;

  struct {
    float quat_w, quat_x, quat_y, quat_z;
  } left_sensor_data_;

  void _setup_left_hand();
  void _process_left_hand(const SensorSample *sample);
  void _update_left_orientation();
  std::tuple<float, float, float> _quaternion_to_euler(float qw, float qx,
                                                       float qy, float qz);
  float _normalize_angle(float angle);
  PitchZone _determine_zone();
  void _read_left_flex_sensor(const std::string &finger_name,
                              const SensorSample *sample);
  int _get_note_for_finger(const std::string &finger_name);
  void _activate_note(const std::string &finger_name, double current_time);
  void _play_current_note();
  void _update_note_during_strumming();
  void _stop_current_note();
  void _stop_current_note(
      const std::vector<int> &next_chord_notes); // Smart MIDI switching

  // ========================================================================
  // RIGHT HAND STATE
  // ========================================================================
  bool fsr_active_;
  int64_t fsr_state_change_time_;
  bool strumming_active_;

  bool stroke_in_progress_;
  int64_t stroke_start_time_;
  std::vector<std::array<float, 6>> stroke_data_for_ai_;
  int64_t last_stroke_end_time_;

  int64_t low_motion_start_time_;
  int low_motion_samples_;

  float peak_stroke_strength_;
  std::string current_stroke_direction_;

  std::deque<float> gyro_z_buffer_;
  std::deque<std::array<float, 6>> imu_buffer_;

  bool peak_ai_checked_;
  bool full_ai_checked_;
  bool any_correction_sent_;

  std::string last_confirmed_direction_;
  float last_confirmed_strength_;

  bool adaptive_mode_;
  std::deque<int64_t> recent_gaps_;
  int64_t current_gap_;

  bool strength_validation_mode_;
  bool debug_mode_;

  struct {
    int total_strokes;
    int down;
    int up;
    int physical_correct;
    int peak_ai_agreed;
    int peak_ai_corrected;
    int full_ai_agreed;
    int full_ai_disagreed;
    int blocked_weak;
    int blocked_reset;
    int blocked_repeat_down;
    int blocked_repeat_up;
    int multi_trigger_prevented;
    int notes_played;
  } stats_;

  void _setup_right_hand();
  void _process_right_hand(const SensorSample *sample);
  bool _update_strumming_state(int fsr_value, int64_t current_time);
  void _start_strumming(int64_t current_time);
  void _stop_strumming(int64_t current_time);
  std::pair<std::string, float> _get_direction_and_strength(float gyro_z);
  std::pair<bool, std::string>
  _validate_stroke_strength(const std::string &direction, float strength);
  void _update_adaptive_gap(int64_t stroke_gap);
  bool _check_stroke_ended(float gyro_z, int64_t current_time);
  void _process_strum_motion(const SensorSample *sample, int64_t current_time);

  // ========================================================================
  // UTILITY
  // ========================================================================
  int64_t _now_ms();
};
