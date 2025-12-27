#pragma once

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <deque>
#include <iostream>
#include <memory>
#include <mutex>
#include <numeric>
#include <string>
#include <unordered_map>
#include <vector>


// TensorFlow Lite for AI models
#include "tensorflow/lite/interpreter.h"
#include "tensorflow/lite/kernels/register.h"
#include "tensorflow/lite/model.h"


// Forward declarations to avoid circular dependencies
struct SensorSample;

// MIDI output interface - MUST BE IMPLEMENTED BY MAIN CONTROLLER
class MidiOutput {
public:
  virtual ~MidiOutput() = default;
  virtual void sendNoteOn(int note, int velocity) = 0;
  virtual void sendNoteOff(int note) = 0;
};

#include "../../core/main_controller.h"

class ViolinController : public InstrumentController {
private:
  // Configuration constants (EXACT from Python)
  static constexpr uint16_t FLEX_THRESHOLDS[5] = {350, 350, 350, 550, 650};
  static constexpr float NEUTRAL_CENTER = 130.0f;
  static constexpr float NEUTRAL_ZONE = 25.0f;
  static constexpr float OCTAVE_UP_THRESHOLD = 70.0f;
  static constexpr float OCTAVE_DOWN_THRESHOLD = -130.0f;
  static constexpr float ACCEL_X_THRESHOLD = 3.0f;
  static constexpr float UP_BOW_MIN_AX = 1.8f;
  static constexpr float DOWN_BOW_MAX_AX = -1.8f;
  static constexpr int BOW_MIN_DURATION_MS = 30;
  static constexpr int BOW_MAX_DURATION_MS = 800;
  static constexpr int MIN_INTER_BOW_GAP_MS = 60;
  static constexpr int BOW_END_DURATION_MS = 30;
  static constexpr float LOW_MOTION_FACTOR = 0.4f;
  static constexpr uint16_t FSR_THRESHOLD = 500;
  static constexpr int FSR_DEBOUNCE_MS = 20;
  static constexpr int AI_TIMING_MS = 60;
  static constexpr float AI_CONFIDENCE_THRESHOLD = 0.85f;
  static constexpr int FULL_AI_TIMING_MS = 100;
  static constexpr uint16_t FLEX_MIDDLE_THRESHOLD = 600;
  static constexpr uint16_t FLEX_RING_THRESHOLD = 600;
  static constexpr uint16_t FLEX_PINKY_THRESHOLD = 600;
  static constexpr int EXPRESSION_DEBOUNCE_MS = 100;
  static constexpr int EXPRESSION_NOTE = 1;
  static constexpr int EXPRESSION_MIN_VELOCITY = 20;
  static constexpr int EXPRESSION_MAX_VELOCITY = 127;
  static constexpr int EXPRESSION_RAMP_TIME_MS = 2000;
  static constexpr int EXPRESSION_RAMP_STEP_MS = 50;

  enum class PitchZone { FLATS, NATURAL, SHARPS };
  enum class RollState { NEUTRAL, THUMB_UP, PINKY_UP };

  struct FlexSensor {
    std::string name;
    uint16_t threshold;
    bool is_bent;
    int last_note;
    double last_note_time;
    bool finger_active_in_zone;
    PitchZone finger_locked_zone;

    FlexSensor()
        : threshold(0), is_bent(false), last_note(0), last_note_time(0),
          finger_active_in_zone(false), finger_locked_zone(PitchZone::NATURAL) {
    }

    FlexSensor(const std::string &n, uint16_t t)
        : name(n), threshold(t), is_bent(false), last_note(0),
          last_note_time(0.0), finger_active_in_zone(false),
          finger_locked_zone(PitchZone::NATURAL) {}
  };

  // AI Models
  std::unique_ptr<tflite::FlatBufferModel> peak_model_;
  std::unique_ptr<tflite::Interpreter> peak_interpreter_;
  std::unique_ptr<tflite::FlatBufferModel> full_model_;
  std::unique_ptr<tflite::Interpreter> full_interpreter_;
  bool ai_loaded_;
  bool full_ai_available_;

  // StandardScaler implementation for preprocessing
  class StandardScaler {
  private:
    std::vector<float> mean_;
    std::vector<float> scale_;

  public:
    void set_params(const std::vector<float> &mean,
                    const std::vector<float> &scale) {
      mean_ = mean;
      scale_ = scale;
    }

    void transform(const std::vector<std::array<float, 6>> &data,
                   float *output) const {
      for (size_t i = 0; i < data.size(); ++i) {
        for (int j = 0; j < 6; ++j) {
          output[i * 6 + j] = (data[i][j] - mean_[j]) / scale_[j];
        }
      }
    }
  };

  StandardScaler peak_scaler_;
  StandardScaler full_scaler_;

  // MIDI
  MidiOutput *midi_out_;
  std::mutex midi_mutex_;

  // Left hand state
  float current_pitch_, current_roll_, current_yaw_;
  float previous_roll_;
  std::deque<float> roll_history_;
  PitchZone current_zone_, previous_zone_;
  int octave_offset_, current_octave_;
  RollState roll_state_;
  double last_roll_change_time_;
  bool returning_to_neutral_;
  double DEBOUNCE_TIME = 0.05;
  double ROLL_CHANGE_COOLDOWN = 0.5;
  int MIN_OCTAVE = 4, MAX_OCTAVE = 8;

  std::unordered_map<std::string, FlexSensor> flex_sensors_;

  // Right hand state
  bool fsr_active_;
  double fsr_state_change_time_;
  bool bow_in_progress_;
  double bow_start_time_;
  std::vector<std::array<float, 6>> bow_data_for_ai_;
  double last_bow_end_time_;

  std::string current_bow_direction_, previous_bow_direction_;
  float peak_bow_strength_;

  double low_motion_start_time_;
  int low_motion_samples_;

  std::deque<float> accel_x_buffer_;
  std::deque<float> accel_variance_buffer_;

  bool peak_ai_checked_, full_ai_checked_, any_correction_sent_;

  // Expression state
  bool expression_active_;
  double last_expression_time_;
  int expression_velocity_;
  double expression_ramp_start_time_;
  bool expression_note_playing_;
  bool middle_bent_, ring_bent_, pinky_bent_;

  // Polyphonic state
  std::vector<int> active_notes_;
  std::vector<int> prepared_notes_;
  bool note_playing_;
  bool bow_active_;

  // Statistics
  struct Stats {
    int total_notes = 0;
    int direction_changes = 0;
    int down_bow_count = 0;
    int up_bow_count = 0;
    int expression_triggers = 0;
  } stats_;

  // Note definitions (EXACT from Python)
  static constexpr int NOTES_NATURAL[5] = {60, 62, 64, 65, 67};
  static constexpr int NOTES_SHARPS[5] = {61, 63, 66, 68, 70};
  static constexpr int NOTES_FLATS[5] = {57, 59, 60, 62, 64};

  // Private methods
  void load_ai_models(const std::string &model_path);
  void setup_left_hand();
  void setup_right_hand();
  void process_left_hand(const SensorSample *sample);
  void process_right_hand(const SensorSample *sample);
  void update_left_orientation(const SensorSample *sample);
  std::array<float, 3> quaternion_to_euler(float qw, float qx, float qy,
                                           float qz) const;
  float normalize_angle(float angle) const;
  PitchZone determine_zone() const;
  void update_octave_offset();
  void read_left_flex_sensor(const std::string &finger_name,
                             const SensorSample *sample);
  int prepare_note(const std::string &finger_name);
  void play_current_notes();
  void stop_current_notes();

  double now_ms() const;
  void check_expression_state(const SensorSample *sample, double current_time);
  void update_bow_state(uint16_t fsr_value, double current_time);
  void start_bowing(double current_time);
  void stop_bowing(double current_time);
  std::pair<std::string, float> get_direction_and_strength(float accel_x);
  bool check_bow_ended(float accel_x, double current_time);
  void process_bow_motion(const SensorSample *sample, double current_time);
  std::pair<std::string, float> get_peak_ai_prediction();
  std::pair<std::string, float> get_full_ai_prediction();

  void send_note_on(int note, int velocity);
  void send_note_off(int note);
  std::string get_note_name(int midi_note) const;
  std::string print_zone(PitchZone zone) const;

  // Statistics printing
  void print_stats_if_needed();

public:
  ViolinController(
      MidiOutput *midi_out = nullptr,
      const std::string &model_path = "D:\\Main project\\violin\\models\\");
  ~ViolinController();

  void handle_samples(const SensorSample *left_sample,
                      const SensorSample *right_sample) override;
  void calibrate(const std::vector<SensorSample> &left_baseline,
                 const std::vector<SensorSample> &right_baseline) override;
  void cleanup();
};