#pragma once

#include <array>
#include <cmath>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

// Forward declaration
struct SensorSample;

// ============================================================================
// CONFIGURATION (from original Python)
// ============================================================================

// Flex sensor thresholds
struct ChordFlexThresholds {
  static constexpr int THUMB = 350;
  static constexpr int INDEX = 350;
  static constexpr int MIDDLE = 350;
  static constexpr int RING = 550;
  static constexpr int PINKY = 650;
};

// IMU gesture thresholds (radians)
constexpr float CHORD_PITCH_UP_THRESHOLD = 0.5f;
constexpr float CHORD_PITCH_DOWN_THRESHOLD = -0.5f;

// Roll thresholds - separate for each hand and direction
constexpr float CHORD_ROLL_RIGHT_HAND_ROLL_RIGHT_THRESHOLD =
    1.0f; // Right hand rolling right
constexpr float CHORD_ROLL_RIGHT_HAND_ROLL_LEFT_THRESHOLD =
    -1.0f; // Right hand rolling left
constexpr float CHORD_ROLL_LEFT_HAND_ROLL_LEFT_THRESHOLD =
    -1.0f; // Left hand rolling left
constexpr float CHORD_ROLL_LEFT_HAND_ROLL_RIGHT_THRESHOLD =
    1.0f; // Left hand rolling right

// Debounce settings
constexpr double CHORD_DEBOUNCE_TIME = 0.05;
constexpr double CHORD_OCTAVE_CHANGE_COOLDOWN = 1.0;

// Chord definitions (intervals from root note)
const std::array<int, 3> MAJOR_CHORD = {0, 4,
                                        7}; // Root, Major 3rd, Perfect 5th
const std::array<int, 3> MINOR_CHORD = {0, 3,
                                        7}; // Root, Minor 3rd, Perfect 5th

// Note mappings (MIDI note offsets within octave)
const std::array<int, 5> NOTE_OFFSETS_NORMAL = {0, 2, 4, 5, 7}; // C, D, E, F, G
const std::array<int, 5> NOTE_OFFSETS_SHARP = {1, 3, 6, 8,
                                               10}; // C#, D#, F#, G#, A#
const std::array<int, 5> NOTE_OFFSETS_LOW = {9, 11, 0, 2, 4}; // A, B, C, D, E

const std::array<std::string, 5> NOTE_NAMES_NORMAL = {"C", "D", "E", "F", "G"};
const std::array<std::string, 5> NOTE_NAMES_SHARP = {"C#", "D#", "F#", "G#",
                                                     "A#"};
const std::array<std::string, 5> NOTE_NAMES_LOW = {"A", "B", "C", "D", "E"};

// ============================================================================
// ENUMS
// ============================================================================

// ============================================================================
// HAND STATE
// ============================================================================

// ============================================================================
// CHORDS CONTROLLER
// ============================================================================

class ChordsControllerImpl {
public:
  enum class PitchZone { UP, NEUTRAL, DOWN };

  enum class FingerType {
    THUMB = 0,
    INDEX = 1,
    MIDDLE = 2,
    RING = 3,
    PINKY = 4
  };

  struct ChordHandState {
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
    float previous_roll; // Track previous roll for octave edge detection

    // Finger states (bent/not bent)
    std::array<bool, 5> finger_states;

    // Active chords (store list of MIDI notes currently playing)
    std::array<std::vector<int>, 5> active_chords;

    // Timing
    std::array<double, 5> last_chord_time;
    double last_octave_change;
    double last_pitch_zone_change;

    ChordHandState(const std::string &name, bool is_right, int channel);
  };

  ChordsControllerImpl(void *midi_out = nullptr);
  ~ChordsControllerImpl();

  void calibrate(const std::unordered_map<std::string, float> &left_baseline,
                 const std::unordered_map<std::string, float> &right_baseline);

  void handle_samples(const SensorSample *left_sample,
                      const SensorSample *right_sample);

  void cleanup();

  // Calibration helper (static)
  class CalibrationHelper {
  public:
    static std::unordered_map<std::string, float>
    compute_orientation_baseline(const std::vector<SensorSample> &samples,
                                 int num_samples = 50);
  };

private:
  void *midi_out_; // MIDI output (stubbed for now)

  ChordHandState left_hand_;
  ChordHandState right_hand_;

  // Debug printing
  double last_debug_print_;
  double debug_print_interval_;

  // Helper methods
  void process_hand_sample(ChordHandState &hand_state,
                           const SensorSample *sample);
  void quaternion_to_euler(float qw, float qx, float qy, float qz, float &pitch,
                           float &roll, float &yaw);
  void process_gestures(ChordHandState &hand_state, float pitch, float roll);
  void process_flex_sensors(ChordHandState &hand_state,
                            const uint16_t flex_values[5]);

  struct ChordNotes {
    std::vector<int> notes;
    std::string chord_name;
    int octave;
  };

  ChordNotes get_chord_notes(int finger_index, bool is_right_hand,
                             PitchZone pitch_zone, int octave);
  void play_chord(ChordHandState &hand_state, FingerType finger,
                  int finger_index, uint16_t flex_value);
  void stop_chord(ChordHandState &hand_state, FingerType finger);

  int get_flex_threshold(FingerType finger, bool is_right_hand);
};
