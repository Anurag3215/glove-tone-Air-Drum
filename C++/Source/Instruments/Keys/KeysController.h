#pragma once

#include <cmath>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

// Forward declaration
struct SensorSample;

// ============================================================================
// CONFIGURATION
// ============================================================================

// Flex sensor thresholds

// IMU gesture thresholds (radians)
constexpr float PITCH_UP_THRESHOLD = 0.5f;
constexpr float PITCH_DOWN_THRESHOLD = -0.5f;

// Roll thresholds - separate for each hand and direction
constexpr float ROLL_RIGHT_HAND_ROLL_RIGHT_THRESHOLD =
    1.0f; // Right hand rolling right
constexpr float ROLL_RIGHT_HAND_ROLL_LEFT_THRESHOLD =
    -1.0f; // Right hand rolling left
constexpr float ROLL_LEFT_HAND_ROLL_LEFT_THRESHOLD =
    -1.0f; // Left hand rolling left
constexpr float ROLL_LEFT_HAND_ROLL_RIGHT_THRESHOLD =
    1.0f; // Left hand rolling right

// Debounce settings
constexpr double DEBOUNCE_TIME = 0.05;
constexpr double OCTAVE_CHANGE_COOLDOWN = 1.0;

// Note mappings
enum class NoteMode { NORMAL, SHARP, LOW };

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// ============================================================================
// KEYS CONTROLLER
// ============================================================================

class KeysControllerImpl {
public:
  struct FlexThresholds {
    static constexpr int THUMB = 350;
    static constexpr int INDEX = 350;
    static constexpr int MIDDLE = 350;
    static constexpr int RING = 550;
    static constexpr int PINKY = 650;
  };

  enum class PitchZone { NEUTRAL, UP, DOWN };

  enum class FingerType {
    THUMB = 0,
    INDEX = 1,
    MIDDLE = 2,
    RING = 3,
    PINKY = 4
  };

  class HandState {
  public:
    std::string hand_name;
    bool is_right_hand;
    int midi_channel;

    // Calibration
    float pitch_calibration;
    float roll_calibration;
    bool is_calibrated;

    // Current octave
    int current_octave;

    // Gesture tracking
    PitchZone current_pitch_zone;
    PitchZone previous_pitch_zone;
    float previous_roll; // Track previous roll for octave edge detection

    // Finger states
    bool finger_states[5]; // thumb, index, middle, ring, pinky

    // Active notes
    int active_notes[5]; // -1 means no active note

    // Timing
    double last_note_time[5];
    double last_octave_change;
    double last_pitch_zone_change;

    HandState(const std::string &name, bool is_right, int channel);
  };

  KeysControllerImpl(void *midi_out = nullptr);
  ~KeysControllerImpl();

  void calibrate(const std::unordered_map<std::string, float> &left_baseline,
                 const std::unordered_map<std::string, float> &right_baseline);

  void handle_samples(const SensorSample *left_sample,
                      const SensorSample *right_sample);

  void cleanup();

  // Calibration helper (static utility)
  class CalibrationHelper {
  public:
    static std::unordered_map<std::string, float>
    compute_orientation_baseline(const std::vector<SensorSample> &samples,
                                 int num_samples = 50);
  };

private:
  // MIDI output (abstract interface - will be nullptr for now)
  void *midi_out_;

  // Hand states
  HandState left_hand_;
  HandState right_hand_;

  // Debug printing
  double last_debug_print_;
  double debug_print_interval_;

  // Note offset tables
  static const int NOTE_OFFSETS[3][5];
  static const char *NOTE_NAMES[3][5];

  // Helper methods
  void process_hand_sample(HandState &hand_state, const SensorSample *sample);
  void quaternion_to_euler(float qw, float qx, float qy, float qz, float &pitch,
                           float &roll, float &yaw);
  void process_gestures(HandState &hand_state, float pitch, float roll,
                        double current_time);
  void process_flex_sensors(HandState &hand_state,
                            const uint16_t flex_values[5], double current_time);

  void get_midi_note(int finger_index, PitchZone pitch_zone, int octave,
                     int &midi_note, const char *&note_name, int &use_octave);
  void play_midi_note(HandState &hand_state, FingerType finger,
                      int finger_index, uint16_t flex_value,
                      double current_time);
  void stop_midi_note(HandState &hand_state, FingerType finger);

  int get_flex_threshold(FingerType finger, bool is_right_hand);
};
