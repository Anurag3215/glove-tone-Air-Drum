#include "ChordsController.h"
#include "../../Audio/JuceAudioEngine.h"
#include "../../core/SensorSample.h"
#include "../../core/main_controller.h"
#include <algorithm>
#include <cmath>
#include <iostream>

extern JuceAudioEngine *g_audioEngine;

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ============================================================================
// HAND STATE IMPLEMENTATION
// ============================================================================

ChordsControllerImpl::ChordHandState::ChordHandState(const std::string &name,
                                                     bool is_right, int channel)
    : hand_name(name), is_right_hand(is_right), midi_channel(channel),
      pitch_calibration(0.0f), roll_calibration(0.0f), is_calibrated(true),
      current_octave(4),
      current_pitch_zone(ChordsControllerImpl::PitchZone::NEUTRAL),
      previous_roll(0.0f), // Initialize previous roll
      last_octave_change(0.0), last_pitch_zone_change(0.0) {

  // Initialize finger states to false (not bent)
  finger_states.fill(false);

  // Initialize last chord times to 0
  last_chord_time.fill(0.0);

  // Initialize active chords to empty vectors
  for (auto &chord : active_chords) {
    chord.clear();
  }
}

// ============================================================================
// CHORDS CONTROLLER IMPLEMENTATION
// ============================================================================

ChordsControllerImpl::ChordsControllerImpl(void *midi_out)
    : midi_out_(midi_out),
      left_hand_("LEFT", false, 0),  // MIDI channel 1 - MINOR chords
      right_hand_("RIGHT", true, 1), // MIDI channel 2 - MAJOR chords
      last_debug_print_(0.0), debug_print_interval_(2.0) {

  std::cout << "✓ Chords Controller: Ready" << std::endl;
  std::cout << "   Left Hand: MIDI Channel 1 - MINOR Chords" << std::endl;
  std::cout << "   Right Hand: MIDI Channel 2 - MAJOR Chords" << std::endl;
}

ChordsControllerImpl::~ChordsControllerImpl() { cleanup(); }

void ChordsControllerImpl::calibrate(
    const std::unordered_map<std::string, float> &left_baseline,
    const std::unordered_map<std::string, float> &right_baseline) {
  // Check if we have valid baseline dicts
  auto left_pitch_it = left_baseline.find("pitch_calibration");
  auto left_roll_it = left_baseline.find("roll_calibration");

  if (left_pitch_it != left_baseline.end() &&
      left_roll_it != left_baseline.end()) {
    left_hand_.pitch_calibration = left_pitch_it->second;
    left_hand_.roll_calibration = left_roll_it->second;
    left_hand_.is_calibrated = true;
  } else {
    std::cout << "⚠️  Chords Controller: Invalid left baseline format"
              << std::endl;
  }

  auto right_pitch_it = right_baseline.find("pitch_calibration");
  auto right_roll_it = right_baseline.find("roll_calibration");

  if (right_pitch_it != right_baseline.end() &&
      right_roll_it != right_baseline.end()) {
    right_hand_.pitch_calibration = right_pitch_it->second;
    right_hand_.roll_calibration = right_roll_it->second;
    right_hand_.is_calibrated = true;
  } else {
    std::cout << "⚠️  Chords Controller: Invalid right baseline format"
              << std::endl;
  }

  if (left_hand_.is_calibrated && right_hand_.is_calibrated) {
    std::cout << "✓ Chords Controller: Calibration complete" << std::endl;
  } else {
    std::cout << "⚠️  Chords Controller: Calibration incomplete" << std::endl;
  }
}

void ChordsControllerImpl::handle_samples(const SensorSample *left_sample,
                                          const SensorSample *right_sample) {
  // Process left hand (minor chords)
  if (left_sample && left_hand_.is_calibrated) {
    process_hand_sample(left_hand_, left_sample);
  }

  // Process right hand (major chords)
  if (right_sample && right_hand_.is_calibrated) {
    process_hand_sample(right_hand_, right_sample);
  }
}

// ============================================================================
// HAND PROCESSING
// ============================================================================

void ChordsControllerImpl::process_hand_sample(ChordHandState &hand_state,
                                               const SensorSample *sample) {
  // Convert quaternion to Euler angles
  float pitch, roll, yaw;
  quaternion_to_euler(sample->qw, sample->qx, sample->qy, sample->qz, pitch,
                      roll, yaw);

  // Process gestures (octave changes and pitch zones)
  process_gestures(hand_state, pitch, roll);

  // Process flex sensors
  uint16_t flex_values[5] = {sample->flex_thumb, sample->flex_index,
                             sample->flex_middle, sample->flex_ring,
                             sample->flex_pinky};
  process_flex_sensors(hand_state, flex_values);
}

void ChordsControllerImpl::quaternion_to_euler(float qw, float qx, float qy,
                                               float qz, float &pitch,
                                               float &roll, float &yaw) {
  // Roll (x-axis rotation)
  float sinr_cosp = 2.0f * (qw * qx + qy * qz);
  float cosr_cosp = 1.0f - 2.0f * (qx * qx + qy * qy);
  roll = std::atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation)
  float sinp = 2.0f * (qw * qy - qz * qx);
  if (std::abs(sinp) >= 1.0f) {
    pitch = std::copysign(M_PI / 2.0f, sinp);
  } else {
    pitch = std::asin(sinp);
  }

  // Yaw (z-axis rotation)
  float siny_cosp = 2.0f * (qw * qz + qx * qy);
  float cosy_cosp = 1.0f - 2.0f * (qy * qy + qz * qz);
  yaw = std::atan2(siny_cosp, cosy_cosp);
}

void ChordsControllerImpl::process_gestures(ChordHandState &hand_state,
                                            float pitch, float roll) {
  double current_time = get_current_time();

  // Apply calibration
  float pitch_cal = pitch - hand_state.pitch_calibration;
  float roll_cal = roll - hand_state.roll_calibration;

  // Octave changes - EDGE DETECTION (neutral to tilted transition only)
  if (current_time - hand_state.last_octave_change >
      CHORD_OCTAVE_CHANGE_COOLDOWN) {
    if (hand_state.is_right_hand) {
      // Right hand: roll RIGHT = octave UP, roll LEFT = octave DOWN
      bool was_neutral = (hand_state.previous_roll <=
                              CHORD_ROLL_RIGHT_HAND_ROLL_RIGHT_THRESHOLD &&
                          hand_state.previous_roll >=
                              CHORD_ROLL_RIGHT_HAND_ROLL_LEFT_THRESHOLD);

      if (roll_cal > CHORD_ROLL_RIGHT_HAND_ROLL_RIGHT_THRESHOLD &&
          was_neutral) {
        hand_state.current_octave = std::min(8, hand_state.current_octave + 1);
        printf("[%s] >>> OCTAVE UP: %d\n", hand_state.hand_name.c_str(),
               hand_state.current_octave);
        hand_state.last_octave_change = current_time;
      } else if (roll_cal < CHORD_ROLL_RIGHT_HAND_ROLL_LEFT_THRESHOLD &&
                 was_neutral) {
        hand_state.current_octave = std::max(0, hand_state.current_octave - 1);
        printf("[%s] >>> OCTAVE DOWN: %d\n", hand_state.hand_name.c_str(),
               hand_state.current_octave);
        hand_state.last_octave_change = current_time;
      }
    } else {
      // Left hand: roll LEFT = octave UP, roll RIGHT = octave DOWN
      bool was_neutral = (hand_state.previous_roll >=
                              CHORD_ROLL_LEFT_HAND_ROLL_LEFT_THRESHOLD &&
                          hand_state.previous_roll <=
                              CHORD_ROLL_LEFT_HAND_ROLL_RIGHT_THRESHOLD);

      if (roll_cal < CHORD_ROLL_LEFT_HAND_ROLL_LEFT_THRESHOLD && was_neutral) {
        hand_state.current_octave = std::min(8, hand_state.current_octave + 1);
        printf("[%s] >>> OCTAVE UP: %d\n", hand_state.hand_name.c_str(),
               hand_state.current_octave);
        hand_state.last_octave_change = current_time;
      } else if (roll_cal > CHORD_ROLL_LEFT_HAND_ROLL_RIGHT_THRESHOLD &&
                 was_neutral) {
        hand_state.current_octave = std::max(0, hand_state.current_octave - 1);
        printf("[%s] >>> OCTAVE DOWN: %d\n", hand_state.hand_name.c_str(),
               hand_state.current_octave);
        hand_state.last_octave_change = current_time;
      }
    }
  }

  // Update previous roll for next iteration
  hand_state.previous_roll = roll_cal;

  // Pitch zone tracking
  PitchZone old_pitch_zone = hand_state.current_pitch_zone;

  // FIXED: Right hand was inverted - removed flip
  float effective_pitch = -pitch_cal; // Left hand default
  if (hand_state.is_right_hand) {
    effective_pitch = -pitch_cal; // Right hand: keep same as left
  }

  // Direct pitch zone detection
  PitchZone new_zone;
  if (effective_pitch > CHORD_PITCH_UP_THRESHOLD) {
    new_zone = PitchZone::UP;
  } else if (effective_pitch < CHORD_PITCH_DOWN_THRESHOLD) {
    new_zone = PitchZone::DOWN;
  } else {
    new_zone = PitchZone::NEUTRAL;
  }

  // Update zone if changed
  if (new_zone != hand_state.current_pitch_zone) {
    hand_state.current_pitch_zone = new_zone;
    hand_state.last_pitch_zone_change = current_time;
  }
}

void ChordsControllerImpl::process_flex_sensors(ChordHandState &hand_state,
                                                const uint16_t flex_values[5]) {
  double current_time = get_current_time();
  // if (hand_state.is_right_hand) return;//this for non existent Right FLEX
  // SENSOR,UNCOMMENT WHEN PYHICALLY INSATLLED
  for (int i = 0; i < 5; ++i) {
    FingerType finger = static_cast<FingerType>(i);
    uint16_t flex_value = flex_values[i];
    int threshold = get_flex_threshold(finger, hand_state.is_right_hand);

    // Finger is bent if value is BELOW threshold
    bool is_bent = (flex_value < threshold);

    // Detect state change (flat to bent) - chord on
    if (is_bent && !hand_state.finger_states[i]) {
      if (current_time - hand_state.last_chord_time[i] > CHORD_DEBOUNCE_TIME) {
        play_chord(hand_state, finger, i, flex_value);
        hand_state.last_chord_time[i] = current_time;
      }
    }
    // Detect state change (bent to flat) - chord off
    else if (!is_bent && hand_state.finger_states[i]) {
      stop_chord(hand_state, finger);
    }

    hand_state.finger_states[i] = is_bent;
  }
}

// ============================================================================
// CHORD GENERATION AND PLAYING
// ============================================================================

ChordsControllerImpl::ChordNotes
ChordsControllerImpl::get_chord_notes(int finger_index, bool is_right_hand,
                                      PitchZone pitch_zone, int octave) {

  ChordNotes result;
  int note_offset;
  std::string note_name;
  int use_octave;

  // Select note based on pitch zone
  if (pitch_zone == PitchZone::UP) {
    note_offset = NOTE_OFFSETS_SHARP[finger_index];
    note_name = NOTE_NAMES_SHARP[finger_index];
    use_octave = octave;
  } else if (pitch_zone == PitchZone::DOWN) {
    note_offset = NOTE_OFFSETS_LOW[finger_index];
    note_name = NOTE_NAMES_LOW[finger_index];
    // A and B come from previous octave
    use_octave = (finger_index < 2) ? (octave - 1) : octave;
  } else {
    note_offset = NOTE_OFFSETS_NORMAL[finger_index];
    note_name = NOTE_NAMES_NORMAL[finger_index];
    use_octave = octave;
  }

  // Calculate root MIDI note
  int root_midi = (use_octave + 1) * 12 + note_offset;

  // Build chord based on hand type
  std::array<int, 3> chord_intervals;
  if (is_right_hand) {
    // Major chord
    chord_intervals = MAJOR_CHORD;
    result.chord_name = note_name;
  } else {
    // Minor chord
    chord_intervals = MINOR_CHORD;
    result.chord_name = note_name + "m";
  }

  // Generate chord notes
  for (int interval : chord_intervals) {
    int note = root_midi + interval;
    // Clamp to valid MIDI range
    note = std::max(0, std::min(127, note));
    result.notes.push_back(note);
  }

  result.octave = use_octave;
  return result;
}

void ChordsControllerImpl::play_chord(ChordHandState &hand_state,
                                      FingerType finger, int finger_index,
                                      uint16_t flex_value) {
  // Get chord notes
  auto chord_info =
      get_chord_notes(finger_index, hand_state.is_right_hand,
                      hand_state.current_pitch_zone, hand_state.current_octave);

  // Send MIDI for all notes in the chord to JUCE audio engine
  if (g_audioEngine) {
    for (int note : chord_info.notes) {
      g_audioEngine->sendMIDI(4, note, 120, true); // Track 4 = Chords
    }
  }

  // Store active chord
  hand_state.active_chords[finger_index] = chord_info.notes;

  // Print info
  const char *chord_type = hand_state.is_right_hand ? "MAJOR" : "MINOR";
  const char *zone_name;
  switch (hand_state.current_pitch_zone) {
  case PitchZone::UP:
    zone_name = "UP";
    break;
  case PitchZone::DOWN:
    zone_name = "DOWN";
    break;
  default:
    zone_name = "NEUTRAL";
    break;
  }

  printf("[%s] ♪ %s %s (%s)\n", hand_state.hand_name.c_str(),
         chord_info.chord_name.c_str(), chord_type, zone_name);
}

void ChordsControllerImpl::stop_chord(ChordHandState &hand_state,
                                      FingerType finger) {
  int finger_index = static_cast<int>(finger);

  if (!hand_state.active_chords[finger_index].empty()) {
    // Send MIDI note-off for all notes in the chord
    std::cout << "DEBUG: Stopping chord" << std::endl;
    if (g_audioEngine) {
      for (int note : hand_state.active_chords[finger_index]) {
        g_audioEngine->sendMIDI(4, note, 0, false); // Track 4 = Chords
      }
    }
    hand_state.active_chords[finger_index].clear();
  }
}

int ChordsControllerImpl::get_flex_threshold(FingerType finger,
                                             bool is_right_hand) {
  if (is_right_hand) {
    switch (finger) {
    case FingerType::THUMB:
      return FlexThresholdsRight::THUMB;
    case FingerType::INDEX:
      return FlexThresholdsRight::INDEX;
    case FingerType::MIDDLE:
      return FlexThresholdsRight::MIDDLE;
    case FingerType::RING:
      return FlexThresholdsRight::RING;
    case FingerType::PINKY:
      return FlexThresholdsRight::PINKY;
    default:
      return 600;
    }
  } else {
    switch (finger) {
    case FingerType::THUMB:
      return ChordFlexThresholds::THUMB;
    case FingerType::INDEX:
      return ChordFlexThresholds::INDEX;
    case FingerType::MIDDLE:
      return ChordFlexThresholds::MIDDLE;
    case FingerType::RING:
      return ChordFlexThresholds::RING;
    case FingerType::PINKY:
      return ChordFlexThresholds::PINKY;
    default:
      return 600;
    }
  }
}

// ============================================================================
// CALIBRATION HELPER
// ============================================================================

std::unordered_map<std::string, float>
ChordsControllerImpl::CalibrationHelper::compute_orientation_baseline(
    const std::vector<SensorSample> &samples, int num_samples) {

  if (samples.size() < static_cast<size_t>(num_samples)) {
    return {};
  }

  float pitch_sum = 0.0f;
  float roll_sum = 0.0f;
  int count = 0;

  // Use last num_samples
  size_t start_idx = samples.size() - num_samples;
  for (size_t i = start_idx; i < samples.size(); ++i) {
    const auto &sample = samples[i];

    // Convert quaternion to Euler for each sample
    float qw = sample.qw, qx = sample.qx, qy = sample.qy, qz = sample.qz;

    // Roll (x-axis rotation)
    float sinr_cosp = 2.0f * (qw * qx + qy * qz);
    float cosr_cosp = 1.0f - 2.0f * (qx * qx + qy * qy);
    float roll = std::atan2(sinr_cosp, cosr_cosp);

    // Pitch (y-axis rotation)
    float sinp = 2.0f * (qw * qy - qz * qx);
    float pitch;
    if (std::abs(sinp) >= 1.0f) {
      pitch = std::copysign(M_PI / 2.0f, sinp);
    } else {
      pitch = std::asin(sinp);
    }

    pitch_sum += pitch;
    roll_sum += roll;
    count++;
  }

  if (count > 0) {
    std::unordered_map<std::string, float> baseline;
    baseline["pitch_calibration"] = pitch_sum / count;
    baseline["roll_calibration"] = roll_sum / count;
    return baseline;
  }

  return {};
}

// ============================================================================
// CLEANUP
// ============================================================================

void ChordsControllerImpl::cleanup() {
  // Send note off for all active chords in both hands

  for (auto *hand_state : {&left_hand_, &right_hand_}) {
    for (size_t i = 0; i < 5; ++i) {
      if (!hand_state->active_chords[i].empty()) {
        // Send MIDI note-off for all notes in the chord
        if (g_audioEngine) {
          for (int note : hand_state->active_chords[i]) {
            g_audioEngine->sendMIDI(4, note, 0, false); // Track 4 = Chords
          }
        }
        hand_state->active_chords[i].clear();
      }
    }
  }

  std::cout << "✓ Chords Controller: All chords stopped" << std::endl;
}
