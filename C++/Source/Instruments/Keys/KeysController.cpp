#include "KeysController.h"
#include "../../Audio/JuceAudioEngine.h"
#include "../../core/Logger.h"
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
// NOTE MAPPING TABLES (EXACT MATCH TO PYTHON)
// ============================================================================

const int KeysControllerImpl::NOTE_OFFSETS[3][5] = {
    {0, 2, 4, 5, 7},  // NORMAL: C, D, E, F, G
    {1, 3, 6, 8, 10}, // SHARP: C#, D#, F#, G#, A#
    {9, 11, 0, 2, 4}  // LOW: A, B, C, D, E
};

const char *KeysControllerImpl::NOTE_NAMES[3][5] = {
    {"C", "D", "E", "F", "G"},      // NORMAL
    {"C#", "D#", "F#", "G#", "A#"}, // SHARP
    {"A", "B", "C", "D", "E"}       // LOW
};

// ============================================================================
// HANDSTATE IMPLEMENTATION
// ============================================================================

KeysControllerImpl::HandState::HandState(const std::string &name, bool is_right,
                                         int channel)
    : hand_name(name), is_right_hand(is_right), midi_channel(channel),
      pitch_calibration(0.0f), roll_calibration(0.0f), is_calibrated(true),
      current_octave(4),
      current_pitch_zone(KeysControllerImpl::PitchZone::NEUTRAL),
      previous_pitch_zone(KeysControllerImpl::PitchZone::NEUTRAL),
      previous_roll(0.0f), // Initialize previous roll
      last_octave_change(0.0), last_pitch_zone_change(0.0) {

  // Initialize finger states
  for (int i = 0; i < 5; ++i) {
    finger_states[i] = false;
    active_notes[i] = -1; // -1 means no active note
    last_note_time[i] = 0.0;
  }
}

// ============================================================================
// KEYSCONTROLLER IMPLEMENTATION
// ============================================================================

KeysControllerImpl::KeysControllerImpl(void *midi_out)
    : midi_out_(midi_out), left_hand_("LEFT", false, 0),
      right_hand_("RIGHT", true, 1), last_debug_print_(0.0),
      debug_print_interval_(2.0) {

  std::cout << "✓ Keys Controller: Ready (Single Notes)" << std::endl;
}

KeysControllerImpl::~KeysControllerImpl() { cleanup(); }

void KeysControllerImpl::calibrate(
    const std::unordered_map<std::string, float> &left_baseline,
    const std::unordered_map<std::string, float> &right_baseline) {
  // FIXED: Receive calibration baseline dicts from main controller
  if (!left_baseline.empty()) {
    auto pitch_it = left_baseline.find("pitch_calibration");
    auto roll_it = left_baseline.find("roll_calibration");
    if (pitch_it != left_baseline.end() && roll_it != left_baseline.end()) {
      left_hand_.pitch_calibration = pitch_it->second;
      left_hand_.roll_calibration = roll_it->second;
      left_hand_.is_calibrated = true;
    }
  }

  if (!right_baseline.empty()) {
    auto pitch_it = right_baseline.find("pitch_calibration");
    auto roll_it = right_baseline.find("roll_calibration");
    if (pitch_it != right_baseline.end() && roll_it != right_baseline.end()) {
      right_hand_.pitch_calibration = pitch_it->second;
      right_hand_.roll_calibration = roll_it->second;
      right_hand_.is_calibrated = true;
    }
  }

  if (left_hand_.is_calibrated && right_hand_.is_calibrated) {
    std::cout << "✓ Keys Controller: Calibration complete" << std::endl;
  } else {
    std::cout << "⚠️  Keys Controller: Calibration incomplete" << std::endl;
  }
}

void KeysControllerImpl::handle_samples(const SensorSample *left_sample,
                                        const SensorSample *right_sample) {
  if (left_sample && left_hand_.is_calibrated) {
    process_hand_sample(left_hand_, left_sample);
  }

  if (right_sample && right_hand_.is_calibrated) {
    process_hand_sample(right_hand_, right_sample);
  }
}

void KeysControllerImpl::process_hand_sample(HandState &hand_state,
                                             const SensorSample *sample) {
  float pitch, roll, yaw;
  quaternion_to_euler(sample->qw, sample->qx, sample->qy, sample->qz, pitch,
                      roll, yaw);

  double current_time = get_current_time();
  process_gestures(hand_state, pitch, roll, current_time);

  uint16_t flex_values[5] = {sample->flex_thumb, sample->flex_index,
                             sample->flex_middle, sample->flex_ring,
                             sample->flex_pinky};
  process_flex_sensors(hand_state, flex_values, current_time);
}

void KeysControllerImpl::quaternion_to_euler(float qw, float qx, float qy,
                                             float qz, float &pitch,
                                             float &roll, float &yaw) {
  // EXACT MATCH TO PYTHON IMPLEMENTATION
  float sinr_cosp = 2.0f * (qw * qx + qy * qz);
  float cosr_cosp = 1.0f - 2.0f * (qx * qx + qy * qy);
  roll = std::atan2(sinr_cosp, cosr_cosp);

  float sinp = 2.0f * (qw * qy - qz * qx);
  if (std::abs(sinp) >= 1.0f) {
    pitch = std::copysign(M_PI / 2.0f, sinp);
  } else {
    pitch = std::asin(sinp);
  }

  float siny_cosp = 2.0f * (qw * qz + qx * qy);
  float cosy_cosp = 1.0f - 2.0f * (qy * qy + qz * qz);
  yaw = std::atan2(siny_cosp, cosy_cosp);
}

void KeysControllerImpl::process_gestures(HandState &hand_state, float pitch,
                                          float roll, double current_time) {
  float pitch_cal = pitch - hand_state.pitch_calibration;
  float roll_cal = roll - hand_state.roll_calibration;

  // Octave changes - EDGE DETECTION (neutral → tilted transition only)
  if (current_time - hand_state.last_octave_change > OCTAVE_CHANGE_COOLDOWN) {
    if (hand_state.is_right_hand) {
      // Right hand: roll right = octave up, roll left = octave down
      bool was_neutral =
          (hand_state.previous_roll <= ROLL_RIGHT_HAND_ROLL_RIGHT_THRESHOLD &&
           hand_state.previous_roll >= ROLL_RIGHT_HAND_ROLL_LEFT_THRESHOLD);

      if (roll_cal > ROLL_RIGHT_HAND_ROLL_RIGHT_THRESHOLD && was_neutral) {
        hand_state.current_octave = std::min(8, hand_state.current_octave + 1);
        std::cout << "[" << hand_state.hand_name
                  << "] >>> OCTAVE UP: " << hand_state.current_octave
                  << std::endl;
        hand_state.last_octave_change = current_time;
      } else if (roll_cal < ROLL_RIGHT_HAND_ROLL_LEFT_THRESHOLD &&
                 was_neutral) {
        hand_state.current_octave = std::max(0, hand_state.current_octave - 1);
        std::cout << "[" << hand_state.hand_name
                  << "] >>> OCTAVE DOWN: " << hand_state.current_octave
                  << std::endl;
        hand_state.last_octave_change = current_time;
      }
    } else { // Left hand
      bool was_neutral =
          (hand_state.previous_roll >= ROLL_LEFT_HAND_ROLL_LEFT_THRESHOLD &&
           hand_state.previous_roll <= ROLL_LEFT_HAND_ROLL_RIGHT_THRESHOLD);

      if (roll_cal < ROLL_LEFT_HAND_ROLL_LEFT_THRESHOLD && was_neutral) {
        hand_state.current_octave = std::min(8, hand_state.current_octave + 1);
        std::cout << "[" << hand_state.hand_name
                  << "] >>> OCTAVE UP: " << hand_state.current_octave
                  << std::endl;
        hand_state.last_octave_change = current_time;
      } else if (roll_cal > ROLL_LEFT_HAND_ROLL_RIGHT_THRESHOLD &&
                 was_neutral) {
        hand_state.current_octave = std::max(0, hand_state.current_octave - 1);
        std::cout << "[" << hand_state.hand_name
                  << "] >>> OCTAVE DOWN: " << hand_state.current_octave
                  << std::endl;
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

  PitchZone new_zone;
  if (effective_pitch > PITCH_UP_THRESHOLD) {
    new_zone = PitchZone::UP;
  } else if (effective_pitch < PITCH_DOWN_THRESHOLD) {
    new_zone = PitchZone::DOWN;
  } else {
    new_zone = PitchZone::NEUTRAL;
  }

  if (new_zone != hand_state.current_pitch_zone) {
    hand_state.current_pitch_zone = new_zone;
    hand_state.last_pitch_zone_change = current_time;
  }
}

void KeysControllerImpl::process_flex_sensors(HandState &hand_state,
                                              const uint16_t flex_values[5],
                                              double current_time) {

  // if (hand_state.is_right_hand) return;//this for non existent Right FLEX
  // SENSOR,UNCOMMENT WHEN PYHICALLY INSATLLED
  for (int i = 0; i < 5; ++i) {
    FingerType finger = static_cast<FingerType>(i);
    uint16_t flex_value = flex_values[i];
    int threshold = get_flex_threshold(finger, hand_state.is_right_hand);

    bool is_bent = (flex_value < threshold);

    if (is_bent && !hand_state.finger_states[i]) {
      if (current_time - hand_state.last_note_time[i] > DEBOUNCE_TIME) {
        play_midi_note(hand_state, finger, i, flex_value, current_time);
        hand_state.last_note_time[i] = current_time;
      }
    } else if (!is_bent && hand_state.finger_states[i]) {
      stop_midi_note(hand_state, finger);
    }

    hand_state.finger_states[i] = is_bent;
  }
}

int KeysControllerImpl::get_flex_threshold(FingerType finger,
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
      return 500;
    }
  } else {
    switch (finger) {
    case FingerType::THUMB:
      return FlexThresholds::THUMB;
    case FingerType::INDEX:
      return FlexThresholds::INDEX;
    case FingerType::MIDDLE:
      return FlexThresholds::MIDDLE;
    case FingerType::RING:
      return FlexThresholds::RING;
    case FingerType::PINKY:
      return FlexThresholds::PINKY;
    default:
      return 500;
    }
  }
}

void KeysControllerImpl::get_midi_note(int finger_index, PitchZone pitch_zone,
                                       int octave, int &midi_note,
                                       const char *&note_name,
                                       int &use_octave) {
  // EXACT MATCH TO PYTHON LOGIC
  int mode_index;

  if (pitch_zone == PitchZone::UP) {
    mode_index = 1; // SHARP
    note_name = NOTE_NAMES[mode_index][finger_index];
    use_octave = octave;
  } else if (pitch_zone == PitchZone::DOWN) {
    mode_index = 2; // LOW
    note_name = NOTE_NAMES[mode_index][finger_index];
    use_octave = (finger_index < 2) ? (octave - 1) : octave;
  } else {
    mode_index = 0; // NORMAL
    note_name = NOTE_NAMES[mode_index][finger_index];
    use_octave = octave;
  }

  int note_offset = NOTE_OFFSETS[mode_index][finger_index];
  midi_note = (use_octave + 1) * 12 + note_offset;
}

void KeysControllerImpl::play_midi_note(HandState &hand_state,
                                        FingerType finger, int finger_index,
                                        uint16_t flex_value,
                                        double current_time) {
  int midi_note;
  const char *note_name;
  int use_octave;

  get_midi_note(finger_index, hand_state.current_pitch_zone,
                hand_state.current_octave, midi_note, note_name, use_octave);

  // Clamp MIDI note to valid range
  midi_note = std::max(0, std::min(127, midi_note));

  // Send MIDI to JUCE audio engine
  if (g_audioEngine) {
    g_audioEngine->sendMIDI(3, midi_note, 127, true); // Track 3 = Keys
  }

  hand_state.active_notes[finger_index] = midi_note;

  // Print note information
  const char *zone_name;
  switch (hand_state.current_pitch_zone) {
  case PitchZone::UP:
    zone_name = "UP";
    break;
  case PitchZone::DOWN:
    zone_name = "DOWN";
    break;
  case PitchZone::NEUTRAL:
    zone_name = "NEUTRAL";
    break;
  default:
    zone_name = "UNKNOWN";
    break;
  }

  const char *finger_names[] = {"thumb", "index", "middle", "ring", "pinky"};
  LOG_INFO("♪ " << note_name << use_octave << " (" << zone_name << ") ["
                << finger_names[finger_index] << "]");
}

void KeysControllerImpl::stop_midi_note(HandState &hand_state,
                                        FingerType finger) {
  int finger_index = static_cast<int>(finger);

  if (hand_state.active_notes[finger_index] != -1) {
    // Send MIDI note-off to JUCE audio engine
    LOG_DEBUG("Stopping note " << hand_state.active_notes[finger_index]);
    if (g_audioEngine) {
      g_audioEngine->sendMIDI(3, hand_state.active_notes[finger_index], 0,
                              false); // Track 3 = Keys
    }

    hand_state.active_notes[finger_index] = -1;
  }
}

void KeysControllerImpl::cleanup() {
  // Stop all active notes
  for (int hand_idx = 0; hand_idx < 2; ++hand_idx) {
    HandState &hand_state = (hand_idx == 0) ? left_hand_ : right_hand_;

    for (int i = 0; i < 5; ++i) {
      if (hand_state.active_notes[i] != -1) {
        // Send MIDI note-off to JUCE audio engine
        if (g_audioEngine) {
          g_audioEngine->sendMIDI(3, hand_state.active_notes[i], 0,
                                  false); // Track 3 = Keys
        }
        hand_state.active_notes[i] = -1;
      }
    }
  }
}

// ============================================================================
// CALIBRATION HELPER (STATIC UTILITY)
// ============================================================================

std::unordered_map<std::string, float>
KeysControllerImpl::CalibrationHelper::compute_orientation_baseline(
    const std::vector<SensorSample> &samples, int num_samples) {

  std::unordered_map<std::string, float> baseline;

  if (samples.size() < static_cast<size_t>(num_samples)) {
    return baseline; // Return empty map
  }

  float pitch_sum = 0.0f;
  float roll_sum = 0.0f;
  int count = 0;

  // Use last num_samples samples
  size_t start_idx = samples.size() - num_samples;
  for (size_t i = start_idx; i < samples.size(); ++i) {
    const SensorSample &sample = samples[i];

    float qw = sample.qw, qx = sample.qx, qy = sample.qy, qz = sample.qz;

    // Compute roll
    float sinr_cosp = 2.0f * (qw * qx + qy * qz);
    float cosr_cosp = 1.0f - 2.0f * (qx * qx + qy * qy);
    float roll = std::atan2(sinr_cosp, cosr_cosp);

    // Compute pitch
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
    baseline["pitch_calibration"] = pitch_sum / count;
    baseline["roll_calibration"] = roll_sum / count;
  }

  return baseline;
}
