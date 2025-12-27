#include "GuitarController.h"
#include "../../Audio/JuceAudioEngine.h"
#include "../../core/Logger.h"
extern JuceAudioEngine *g_audioEngine;
#include "../../core/SensorSample.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <sstream>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ============================================================================
// CONSTRUCTOR / DESTRUCTOR
// ============================================================================

GuitarController::GuitarController(void *midi_out,
                                   const std::string &model_path)
    : midi_out_(midi_out), last_sent_note_(-1), last_note_time_(0),
      ai_loaded_(false), full_ai_available_(false), current_note_(-1),
      note_playing_(false), pending_note_off_(-1), pending_note_off_time_(0.0) {

  std::cout << "🎸 Guitar Controller: Initializing..." << std::endl;

  // Initialize normalization parameters (from user)
  peak_mean_ = {-18.23353570734496f,  12.806806494512463f,
                -4.249518456319018f,  -1.8220416939538742f,
                -0.5303169990793608f, 0.9311820878211362f};
  peak_scale_ = {11.438631211637857f, 11.284897574223248f, 7.980257737649419f,
                 7.646908811915798f,  8.033752332940296f,  15.475251235663265f};
  full_mean_ = {-2.0500865845271723f,   5.999611332319744f,
                -0.7089567803374701f,   0.005732363049013667f,
                -0.025703175341866464f, -0.013654469019599791f};
  full_scale_ = {6.447619279296426f,  2.1295440344723127f, 2.5332626422915134f,
                 0.2071986482081263f, 0.1458831250721997f, 0.1759795463981543f};

  // Initialize chord maps
  _init_chord_maps();

  // Load AI models
  if (!model_path.empty()) {
    ai_loaded_ = _load_ai_models(model_path);
    if (ai_loaded_) {
      std::cout << "✓ Guitar AI models loaded - AI correction ENABLED"
                << std::endl;
      if (full_ai_available_) {
        std::cout << "   AI: Enabled (Peak + Full)" << std::endl;
      } else {
        std::cout << "   AI: Enabled (Peak only)" << std::endl;
      }
    } else {
      std::cout
          << "⚠ [Guitar] WARNING: Failed to load AI model, running without AI"
          << std::endl;
      std::cout << "   Using basic strum detection without AI" << std::endl;
    }
  }

  // Initialize left and right hand state
  _setup_left_hand();
  _setup_right_hand();

  std::cout << "✓ Guitar Controller: Ready" << std::endl;
}

GuitarController::~GuitarController() {
  if (note_playing_) {
    _stop_current_note();
  }
  std::cout << "✓ Guitar Controller: Cleaned up" << std::endl;
}

// ============================================================================
// CHORD MAP INITIALIZATION
// ============================================================================

void GuitarController::_init_chord_maps() {
  // Note arrays
  notes_natural_ = {60, 62, 64, 65, 67}; // C, D, E, F, G
  notes_flats_ = {58, 60, 62, 63, 65};   // A#, C, D, D#, F

  // Note name to MIDI mapping
  note_name_to_midi_ = {
      {"C", 60},  {"C#", 61}, {"Db", 61}, {"D", 62},  {"D#", 63}, {"Eb", 63},
      {"E", 64},  {"F", 65},  {"F#", 66}, {"Gb", 66}, {"G", 67},  {"G#", 68},
      {"Ab", 68}, {"A", 69},  {"A#", 70}, {"Bb", 70}, {"B", 71}};

  // FIXED: White and black keys across ALL octaves (0-127)
  // White keys: C, D, E, F, G, A, B pattern repeats every 12 semitones
  // Black keys: C#, D#, F#, G#, A# pattern repeats every 12 semitones
  for (int octave = 0; octave < 11; octave++) {
    int base = octave * 12;
    white_keys_.insert({base + 0, base + 2, base + 4, base + 5, base + 7,
                        base + 9, base + 11}); // C D E F G A B
    black_keys_.insert(
        {base + 1, base + 3, base + 6, base + 8, base + 10}); // C# D# F# G# A#
  }

  // Chord map
  chord_map_[{PitchZone::NATURAL, "thumb"}] = {"C#", "min"}; // C# minor
  chord_map_[{PitchZone::NATURAL, "index"}] = {"F#", "min"}; // F# minor
  chord_map_[{PitchZone::NATURAL, "middle"}] = {"A", "maj"}; // A major
  chord_map_[{PitchZone::NATURAL, "ring"}] = {"B", "maj"};   // B major
  chord_map_[{PitchZone::NATURAL, "pinky"}] = {"E", "maj"};  // E major

  chord_map_[{PitchZone::FLATS, "thumb"}] = {"C", "min"};
  chord_map_[{PitchZone::FLATS, "index"}] = {"D", "min"};
  chord_map_[{PitchZone::FLATS, "middle"}] = {"E", "min"};
  chord_map_[{PitchZone::FLATS, "ring"}] = {"F", "min"};
  chord_map_[{PitchZone::FLATS, "pinky"}] = {"G", "min"};
}

// ============================================================================
// AI MODEL LOADING
// ============================================================================

bool GuitarController::_load_ai_models(const std::string &model_path) {
  try {
    // Load peak model
    std::string peak_model_file = model_path + "peak_model.tflite";
    peak_model_ =
        tflite::FlatBufferModel::BuildFromFile(peak_model_file.c_str());

    if (!peak_model_) {
      std::cout << "⚠ Failed to load peak model from: " << peak_model_file
                << std::endl;
      return false;
    }

    tflite::ops::builtin::BuiltinOpResolver resolver;
    tflite::InterpreterBuilder builder(*peak_model_, resolver);
    builder(&peak_interpreter_);

    if (!peak_interpreter_) {
      std::cout << "⚠ Failed to create peak interpreter" << std::endl;
      return false;
    }

    peak_interpreter_->AllocateTensors();
    std::cout << "✓ Peak AI loaded (80ms window)" << std::endl;

    // Try to load full model (optional)
    try {
      std::string full_model_file = model_path + "full_model.tflite";
      full_model_ =
          tflite::FlatBufferModel::BuildFromFile(full_model_file.c_str());

      if (full_model_) {
        tflite::InterpreterBuilder full_builder(*full_model_, resolver);
        full_builder(&full_interpreter_);

        if (full_interpreter_) {
          full_interpreter_->AllocateTensors();
          full_ai_available_ = true;
          std::cout << "✓ Full AI loaded (120ms window - stats only)"
                    << std::endl;
        }
      }
    } catch (...) {
      std::cout << "⚠ Full AI not found (optional)" << std::endl;
      full_ai_available_ = false;
    }

    return true;

  } catch (const std::exception &e) {
    std::cout << "⚠ Exception loading AI models: " << e.what() << std::endl;
    return false;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

void GuitarController::handle_samples(const SensorSample *left_sample,
                                      const SensorSample *right_sample) {
  // Check for pending note-off
  if (pending_note_off_ != -1) {
    double current_time = _now_ms();
    if (current_time >= pending_note_off_time_) {
      std::lock_guard<std::mutex> lock(midi_lock_);
      if (last_sent_note_ == pending_note_off_) {
        _send_midi_note_off(pending_note_off_);
      }
      pending_note_off_ = -1;
    }
  }

  if (left_sample) {
    _process_left_hand(left_sample);
  }
  if (right_sample) {
    _process_right_hand(right_sample);
  }
}

void GuitarController::calibrate(
    const std::vector<SensorSample> &left_baseline,
    const std::vector<SensorSample> &right_baseline) {
  std::cout << "🎸 Guitar: Calibration received (not used)" << std::endl;
}

// ============================================================================
// LEFT HAND SETUP
// ============================================================================

void GuitarController::_setup_left_hand() {
  current_pitch_ = 0.0f;
  current_roll_ = 0.0f;
  current_yaw_ = 0.0f;

  current_zone_ = PitchZone::NATURAL;
  previous_zone_ = PitchZone::NATURAL;

  // Initialize flex sensors
  flex_sensors_["thumb"] = FlexSensor("thumb", FlexThresholds::THUMB);
  flex_sensors_["index"] = FlexSensor("index", FlexThresholds::INDEX);
  flex_sensors_["middle"] = FlexSensor("middle", FlexThresholds::MIDDLE);
  flex_sensors_["ring"] = FlexSensor("ring", FlexThresholds::RING);
  flex_sensors_["pinky"] = FlexSensor("pinky", FlexThresholds::PINKY);

  current_note_ = -1;
  note_playing_ = false;
  active_finger_ = "";

  left_sensor_data_.quat_w = 1.0f;
  left_sensor_data_.quat_x = 0.0f;
  left_sensor_data_.quat_y = 0.0f;
  left_sensor_data_.quat_z = 0.0f;
}

// ============================================================================
// RIGHT HAND SETUP
// ============================================================================

void GuitarController::_setup_right_hand() {
  fsr_active_ = false;
  fsr_state_change_time_ = -1;
  strumming_active_ = false;

  stroke_in_progress_ = false;
  stroke_start_time_ = 0;
  last_stroke_end_time_ = 0;

  low_motion_start_time_ = -1;
  low_motion_samples_ = 0;

  peak_stroke_strength_ = 0.0f;
  current_stroke_direction_ = "";

  gyro_z_buffer_.clear();
  imu_buffer_.clear();

  peak_ai_checked_ = false;
  full_ai_checked_ = false;
  any_correction_sent_ = false;

  last_confirmed_direction_ = "";
  last_confirmed_strength_ = 0.0f;

  adaptive_mode_ = false;
  current_gap_ = MIN_INTER_STROKE_GAP_MS;

  strength_validation_mode_ = true;
  debug_mode_ = false;

  stats_ = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
}

// ============================================================================
// GS-2 CHORD HELPERS
// ============================================================================

int GuitarController::_nearest_left(int root_midi, bool want_black) {
  // GS-2 Spec: Find the IMMEDIATE left neighbor on the keyboard
  // For black key: find first black key to the left
  // For white key: find first white key to the left

  if (root_midi <= 0) {
    return root_midi - 1;
  }

  // Search only immediate neighbors (max 2-3 semitones for safety)
  for (int candidate = root_midi - 1; candidate >= std::max(0, root_midi - 3);
       candidate--) {
    if (want_black) {
      if (black_keys_.find(candidate) != black_keys_.end()) {
        std::cout << "   [DEBUG _nearest_left] root=" << root_midi
                  << " want_black=true found=" << candidate << std::endl;
        return candidate;
      }
    } else {
      if (white_keys_.find(candidate) != white_keys_.end()) {
        std::cout << "   [DEBUG _nearest_left] root=" << root_midi
                  << " want_black=false found=" << candidate << std::endl;
        return candidate;
      }
    }
  }

  // Fallback if nothing found (shouldn't happen with proper keyboard layout)
  std::cout << "   [DEBUG _nearest_left] FALLBACK! root=" << root_midi
            << " want_black=" << want_black << " returning=" << (root_midi - 1)
            << std::endl;
  return root_midi - 1;
}

std::pair<std::vector<int>, std::string>
GuitarController::_gs2_chord_keys(int root_midi, const std::string &quality) {
  std::string root_name = _get_note_name(root_midi);
  // Remove octave number
  size_t pos = root_name.find_first_of("0123456789");
  if (pos != std::string::npos) {
    root_name = root_name.substr(0, pos);
  }

  if (quality == "maj" || quality == "") {
    return {{root_midi}, root_name};
  } else if (quality == "min" || quality == "m") {
    int black_key = _nearest_left(root_midi, true);
    // FIXED: Return notes in ascending order (lowest first)
    return {{black_key, root_midi}, root_name + "m"};
  } else if (quality == "7") {
    int white_key = _nearest_left(root_midi, false);
    // FIXED: Return notes in ascending order (lowest first)
    return {{white_key, root_midi}, root_name + "7"};
  } else if (quality == "m7") {
    int black_key = _nearest_left(root_midi, true);
    int white_key = _nearest_left(root_midi, false);
    // FIXED: Sort all three notes in ascending order
    std::vector<int> notes = {root_midi, black_key, white_key};
    std::sort(notes.begin(), notes.end());
    return {notes, root_name + "m7"};
  } else {
    return {{root_midi}, root_name};
  }
}

std::pair<std::vector<int>, std::string>
GuitarController::_get_chord_for_finger(const std::string &finger_name,
                                        PitchZone zone) {

  auto it = chord_map_.find({zone, finger_name});
  if (it == chord_map_.end()) {
    return {{}, ""};
  }

  const ChordInfo &chord_info = it->second;
  auto midi_it = note_name_to_midi_.find(chord_info.root_note_name);
  if (midi_it == note_name_to_midi_.end()) {
    return {{}, ""};
  }

  int root_midi = midi_it->second;
  return _gs2_chord_keys(root_midi, chord_info.quality);
}

std::string GuitarController::_get_note_name(int midi_note) {
  static const char *note_names[] = {"C",  "C#", "D",  "D#", "E",  "F",
                                     "F#", "G",  "G#", "A",  "A#", "B"};
  int octave = (midi_note / 12) - 1;
  int note_index = midi_note % 12;
  return std::string(note_names[note_index]) + std::to_string(octave);
}

std::string GuitarController::_print_zone(PitchZone zone) {
  return (zone == PitchZone::NATURAL) ? "Natural" : "Flats";
}

// ============================================================================
// LEFT HAND PROCESSING
// ============================================================================

void GuitarController::_process_left_hand(const SensorSample *sample) {
  // Update sensor data
  left_sensor_data_.quat_w = sample->qw;
  left_sensor_data_.quat_x = sample->qx;
  left_sensor_data_.quat_y = sample->qy;
  left_sensor_data_.quat_z = sample->qz;

  // Update orientation
  _update_left_orientation();

  // Determine zone
  PitchZone new_zone = _determine_zone();
  if (new_zone != current_zone_) {
    previous_zone_ = current_zone_;
    current_zone_ = new_zone;
    std::cout << "→ Zone: " << _print_zone(current_zone_) << std::endl;
  }

  // Process flex sensors
  for (auto &pair : flex_sensors_) {
    _read_left_flex_sensor(pair.first, sample);
  }
}

void GuitarController::_update_left_orientation() {
  auto [pitch, roll, yaw] =
      _quaternion_to_euler(left_sensor_data_.quat_w, left_sensor_data_.quat_x,
                           left_sensor_data_.quat_y, left_sensor_data_.quat_z);

  current_pitch_ = _normalize_angle(pitch);
  current_roll_ = _normalize_angle(roll);
  current_yaw_ = _normalize_angle(yaw);
}

std::tuple<float, float, float>
GuitarController::_quaternion_to_euler(float qw, float qx, float qy, float qz) {
  // Roll (x-axis rotation)
  float sinr_cosp = 2.0f * (qw * qx + qy * qz);
  float cosr_cosp = 1.0f - 2.0f * (qx * qx + qy * qy);
  float roll = std::atan2(sinr_cosp, cosr_cosp) * 180.0f / M_PI;

  // Pitch (y-axis rotation)
  float sinp = 2.0f * (qw * qy - qz * qx);
  float pitch;
  if (std::abs(sinp) >= 1.0f) {
    pitch = std::copysign(90.0f, sinp);
  } else {
    pitch = std::asin(sinp) * 180.0f / M_PI;
  }

  // Yaw (z-axis rotation)
  float siny_cosp = 2.0f * (qw * qz + qx * qy);
  float cosy_cosp = 1.0f - 2.0f * (qy * qy + qz * qz);
  float yaw = std::atan2(siny_cosp, cosy_cosp) * 180.0f / M_PI;

  return {pitch, roll, yaw};
}

float GuitarController::_normalize_angle(float angle) {
  while (angle > 180.0f)
    angle -= 360.0f;
  while (angle < -180.0f)
    angle += 360.0f;
  return angle;
}

GuitarController::PitchZone GuitarController::_determine_zone() {
  return (current_yaw_ < -25.0f) ? PitchZone::FLATS : PitchZone::NATURAL;
}

void GuitarController::_read_left_flex_sensor(const std::string &finger_name,
                                              const SensorSample *sample) {
  FlexSensor &sensor = flex_sensors_[finger_name];
  double current_time = _now_ms() / 1000.0;

  int flex_value;
  if (finger_name == "thumb")
    flex_value = sample->flex_thumb;
  else if (finger_name == "index")
    flex_value = sample->flex_index;
  else if (finger_name == "middle")
    flex_value = sample->flex_middle;
  else if (finger_name == "ring")
    flex_value = sample->flex_ring;
  else if (finger_name == "pinky")
    flex_value = sample->flex_pinky;
  else
    return;

  bool is_bent_now = flex_value < sensor.threshold;

  if (is_bent_now && !sensor.is_bent) {
    // Finger just bent
    sensor.is_bent = true;
    sensor.zone_locked = true;
    sensor.locked_zone = current_zone_;

    // Add to bent fingers
    bent_fingers_.erase(finger_name);
    bent_fingers_.insert(finger_name);
    finger_bend_times_[finger_name] = current_time;

    // If strumming is active, switch to this finger immediately
    if (strumming_active_) {
      // Stop current note if playing a different finger
      if (note_playing_ && active_finger_ != finger_name) {
        // FIXED: Get next chord notes FIRST, then pass to smart MIDI
        auto next_chord = _get_chord_for_finger(finger_name, current_zone_);
        _stop_current_note(next_chord.first); // Smart MIDI: pass NEXT chord
      }
      _activate_note(finger_name, current_time);
      // Play the new note immediately
      if (!note_playing_) {
        _play_current_note();
      }
    } else {
      // Just activate without playing
      _activate_note(finger_name, current_time);
    }

  } else if (!is_bent_now && sensor.is_bent) {
    // Finger just released
    sensor.is_bent = false;
    sensor.zone_locked = false;

    bent_fingers_.erase(finger_name);
    finger_bend_times_.erase(finger_name);

    // If this finger was the active one
    if (active_finger_ == finger_name) {
      // If strumming and other fingers are still bent, switch to one of them
      if (strumming_active_ && !bent_fingers_.empty()) {
        // Find the most recent bent finger
        std::string next_finger = "";
        double latest_time = 0.0;
        for (const auto &pair : finger_bend_times_) {
          if (pair.second > latest_time) {
            latest_time = pair.second;
            next_finger = pair.first;
          }
        }

        if (!next_finger.empty()) {
          // Stop current note and switch to the next finger
          if (note_playing_) {
            // FIXED: Get next chord notes FIRST
            auto next_chord = _get_chord_for_finger(next_finger, current_zone_);
            _stop_current_note(next_chord.first); // Smart MIDI: pass NEXT chord
          }
          _activate_note(next_finger, current_time);
          _play_current_note();
          LOG_DEBUG("   ↩ Switched to " << next_finger);
        } else {
          // No other fingers bent, just stop
          if (note_playing_) {
            _stop_current_note();
          }
          active_finger_ = "";
        }
      } else {
        // Not strumming or no other fingers bent, just stop
        if (note_playing_) {
          _stop_current_note();
        }
        active_finger_ = "";
      }
    }
  }
}

int GuitarController::_get_note_for_finger(const std::string &finger_name) {
  FlexSensor &sensor = flex_sensors_[finger_name];

  // Use locked zone if available
  PitchZone zone_to_use =
      sensor.zone_locked ? sensor.locked_zone : current_zone_;

  // Check if we can use cached chord
  if (sensor.cache_valid && sensor.cached_zone == zone_to_use) {
    // Reuse cached chord
    current_chord_notes_ = sensor.cached_chord_notes;
    current_chord_name_ = sensor.cached_chord_name;
    return sensor.cached_chord_notes.empty() ? 60
                                             : sensor.cached_chord_notes[0];
  }

  // Need to recalculate chord
  auto [chord_notes, chord_name] =
      _get_chord_for_finger(finger_name, zone_to_use);

  if (!chord_notes.empty()) {
    // Update cache
    sensor.cached_chord_notes = chord_notes;
    sensor.cached_chord_name = chord_name;
    sensor.cached_zone = zone_to_use;
    sensor.cache_valid = true;

    current_chord_notes_ = chord_notes;
    current_chord_name_ = chord_name;
    return chord_notes[0]; // Return root note
  } else {
    // Fallback to original behavior
    std::vector<std::string> finger_order = {"thumb", "index", "middle", "ring",
                                             "pinky"};
    auto it = std::find(finger_order.begin(), finger_order.end(), finger_name);
    if (it == finger_order.end())
      return 60;

    int finger_index = std::distance(finger_order.begin(), it);

    if (zone_to_use == GuitarController::PitchZone::NATURAL) {
      return notes_natural_[finger_index];
    } else {
      return notes_flats_[finger_index];
    }
  }
}

void GuitarController::_activate_note(const std::string &finger_name,
                                      double current_time) {
  FlexSensor &sensor = flex_sensors_[finger_name];

  int final_note = _get_note_for_finger(finger_name);
  final_note = std::max(0, std::min(127, final_note));

  sensor.last_note = final_note;
  current_note_ = final_note;
  active_finger_ = finger_name;

  PitchZone zone_to_use =
      sensor.zone_locked ? sensor.locked_zone : current_zone_;
  std::string zone_name = _print_zone(zone_to_use);
  std::string lock_status = sensor.zone_locked ? " [LOCKED]" : "";

  // Show chord information
  if (!current_chord_name_.empty()) {
    LOG_INFO("♪ " << sensor.name << " → " << current_chord_name_ << " ("
                  << zone_name << lock_status << ")");
  } else {
    LOG_INFO("♪ " << sensor.name << " → " << _get_note_name(final_note) << " ("
                  << zone_name << lock_status << ")");
  }

  // If strumming is active, play the note immediately
  if (strumming_active_ && !note_playing_) {
    _play_current_note();
  }
}

void GuitarController::_play_current_note() {
  if (current_note_ >= 0 && !note_playing_) {
    // Send GS-2 chord notes if available
    if (!current_chord_notes_.empty()) {
      std::cout << "   [DEBUG] Sending chord MIDI notes: ";
      for (int note : current_chord_notes_) {
        std::cout << note << " ";
        _send_midi_note_on(note);
      }
      std::cout << std::endl;
    } else {
      _send_midi_note_on(current_note_);
    }

    note_playing_ = true;
    stats_.notes_played++;

    // Show which finger is being played
    if (!active_finger_.empty()) {
      if (!current_chord_name_.empty()) {
        LOG_INFO("   🎸 " << active_finger_ << " -> " << current_chord_name_);
      } else {
        LOG_INFO("   🎸 " << active_finger_ << " -> "
                          << _get_note_name(current_note_));
      }
    }
  }
}

void GuitarController::_update_note_during_strumming() {
  if (!strumming_active_ || bent_fingers_.empty()) {
    return;
  }

  std::string current_finger = active_finger_;

  // If no finger is active but there are bent fingers, activate one
  if (current_finger.empty() && !bent_fingers_.empty()) {
    std::string next_finger = *bent_fingers_.begin();
    _activate_note(next_finger, _now_ms() / 1000.0);
    return;
  }

  // If current finger is still bent, check if note needs update due to zone
  // change
  if (!current_finger.empty() &&
      bent_fingers_.find(current_finger) != bent_fingers_.end()) {
    FlexSensor &sensor = flex_sensors_[current_finger];
    int new_note = _get_note_for_finger(current_finger);

    // If note has changed (due to zone change on non-locked finger), update it
    if (!sensor.zone_locked && new_note != current_note_) {
      current_note_ = new_note;
      if (note_playing_) {
        // For GS-2, update all chord notes
        if (!current_chord_notes_.empty()) {
          for (int note : current_chord_notes_) {
            _send_midi_note_off(note);
          }
          for (int note : current_chord_notes_) {
            _send_midi_note_on(note);
          }
        } else {
          _send_midi_note_on(current_note_, true);
        }

        if (!current_chord_name_.empty()) {
          std::cout << "   🔄 CHORD UPDATE: " << current_finger << " -> "
                    << current_chord_name_ << std::endl;
        } else {
          std::cout << "   🔄 NOTE UPDATE: " << current_finger << " -> "
                    << _get_note_name(current_note_) << std::endl;
        }
      }
    }
  }
}

void GuitarController::_stop_current_note() {
  _stop_current_note({}); // Call with empty next chord
}

void GuitarController::_stop_current_note(
    const std::vector<int> &next_chord_notes) {
  if (note_playing_) {
    // Stop GS-2 chord notes if available
    if (!current_chord_notes_.empty()) {
      // Only stop notes that won't be used in next chord (smart switching)
      for (int note : current_chord_notes_) {
        bool will_be_reused =
            std::find(next_chord_notes.begin(), next_chord_notes.end(), note) !=
            next_chord_notes.end();
        if (!will_be_reused) {
          _send_midi_note_off(note);
        }
      }
    } else if (current_note_ >= 0) {
      bool will_be_reused =
          std::find(next_chord_notes.begin(), next_chord_notes.end(),
                    current_note_) != next_chord_notes.end();
      if (!will_be_reused) {
        _send_midi_note_off(current_note_);
      }
    }

    note_playing_ = false;
    current_chord_notes_.clear();
    current_chord_name_ = "";
  }
}

// ============================================================================
// RIGHT HAND PROCESSING
// ============================================================================

void GuitarController::_process_right_hand(const SensorSample *sample) {
  int64_t current_time = _now_ms();

  // Update strumming state based on FSR
  bool fsr_active = _update_strumming_state(sample->fsr, current_time);

  if (fsr_active) {
    _process_strum_motion(sample, current_time);
  }
}

bool GuitarController::_update_strumming_state(int fsr_value,
                                               int64_t current_time) {
  bool fsr_now = fsr_value > FSR_THRESHOLD;

  if (fsr_now != fsr_active_) {
    if (fsr_state_change_time_ < 0) {
      fsr_state_change_time_ = current_time;
    } else if (current_time - fsr_state_change_time_ >= FSR_DEBOUNCE_MS) {
      fsr_active_ = fsr_now;
      fsr_state_change_time_ = -1;

      LOG_DEBUG("✋ FSR: " << (fsr_active_ ? "ACTIVE" : "INACTIVE"));

      if (fsr_active_) {
        _start_strumming(current_time);
      } else {
        _stop_strumming(current_time);
      }
    }
  } else {
    fsr_state_change_time_ = -1;
  }

  return fsr_active_;
}

void GuitarController::_start_strumming(int64_t current_time) {
  strumming_active_ = true;
  LOG_INFO("🎸 STRUM START");

  // Check for any bent fingers and activate note
  if (!bent_fingers_.empty() && active_finger_.empty()) {
    std::string next_finger = *bent_fingers_.begin();
    _activate_note(next_finger, current_time / 1000.0);
  }

  // Play the current note if one is prepared
  if (current_note_ >= 0 && !note_playing_) {
    _play_current_note();
  }
}

void GuitarController::_stop_strumming(int64_t current_time) {
  strumming_active_ = false;
  std::cout << "🎸 STRUM STOP" << std::endl;

  // Only reset stroke state, don't stop the note
  stroke_in_progress_ = false;
  peak_ai_checked_ = false;
  full_ai_checked_ = false;
  any_correction_sent_ = false;
  low_motion_start_time_ = -1;
  low_motion_samples_ = 0;
  peak_stroke_strength_ = 0.0f;
  current_stroke_direction_ = "";
}

std::pair<std::string, float>
GuitarController::_get_direction_and_strength(float gyro_z) {
  gyro_z_buffer_.push_back(gyro_z);
  if (gyro_z_buffer_.size() > 2) { // Reduced from 3 to 2 for lower latency
    gyro_z_buffer_.pop_front();
  }

  float sum = 0.0f;
  for (float val : gyro_z_buffer_) {
    sum += val;
  }
  float smoothed = sum / gyro_z_buffer_.size();

  float strength = std::abs(smoothed);

  if (strength < GYRO_Z_THRESHOLD) {
    return {"", 0.0f};
  }

  std::string direction = (smoothed < 0) ? "down" : "up";
  return {direction, strength};
}

std::pair<bool, std::string>
GuitarController::_validate_stroke_strength(const std::string &direction,
                                            float strength) {
  if (!strength_validation_mode_) {
    return {true, "validation_off"};
  }

  float reset_threshold = GYRO_Z_THRESHOLD * RESET_MOTION_MULTIPLIER;

  if (strength < reset_threshold) {
    stats_.blocked_reset++;
    std::ostringstream oss;
    oss << "reset_motion(" << strength << "<" << reset_threshold << ")";
    return {false, oss.str()};
  }

  if (direction == "down") {
    if (last_confirmed_direction_ == "down") {
      float required = GYRO_Z_THRESHOLD * DOWN_REPEAT_MULTIPLIER;
      if (strength < required) {
        stats_.blocked_repeat_down++;
        std::ostringstream oss;
        oss << "weak_repeat_down(" << strength << "<" << required << ")";
        return {false, oss.str()};
      }
    } else {
      float required = GYRO_Z_THRESHOLD * DOWN_MIN_MULTIPLIER;
      if (strength < required) {
        stats_.blocked_weak++;
        std::ostringstream oss;
        oss << "weak_down(" << strength << "<" << required << ")";
        return {false, oss.str()};
      }
    }
  } else if (direction == "up") {
    if (last_confirmed_direction_ == "up") {
      float required = GYRO_Z_THRESHOLD * UP_REPEAT_MULTIPLIER;
      if (strength < required) {
        stats_.blocked_repeat_up++;
        std::ostringstream oss;
        oss << "weak_repeat_up(" << strength << "<" << required << ")";
        return {false, oss.str()};
      }
    } else {
      float required = GYRO_Z_THRESHOLD * UP_MIN_MULTIPLIER;
      if (strength < required) {
        stats_.blocked_weak++;
        std::ostringstream oss;
        oss << "weak_up(" << strength << "<" << required << ")";
        return {false, oss.str()};
      }
    }
  }

  return {true, "valid"};
}

void GuitarController::_update_adaptive_gap(int64_t stroke_gap) {
  // Adaptive mode disabled - always use fixed minimum gap
  current_gap_ = MIN_INTER_STROKE_GAP_MS;
  // Adaptive logic removed for consistent timing
  return;
}

bool GuitarController::_check_stroke_ended(float gyro_z, int64_t current_time) {
  int64_t stroke_duration = current_time - stroke_start_time_;

  float strength = std::abs(gyro_z);
  if (strength > peak_stroke_strength_) {
    peak_stroke_strength_ = strength;
  }

  if (stroke_duration < STROKE_MIN_DURATION_MS) {
    return false;
  }

  if (stroke_duration > STROKE_MAX_DURATION_MS) {
    if (debug_mode_) {
      std::cout << "   [Timeout: " << stroke_duration << "ms]" << std::endl;
    }
    return true;
  }

  float low_threshold = GYRO_Z_THRESHOLD * LOW_MOTION_FACTOR;

  if (std::abs(gyro_z) < low_threshold) {
    low_motion_samples_++;

    if (low_motion_start_time_ < 0) {
      low_motion_start_time_ = current_time;
    }

    int64_t low_duration = current_time - low_motion_start_time_;
    int required_samples = 5;

    if (low_duration >= STROKE_END_DURATION_MS &&
        low_motion_samples_ >= required_samples) {
      return true;
    }
  } else {
    if (std::abs(gyro_z) > GYRO_Z_THRESHOLD * 1.5f) {
      low_motion_start_time_ = -1;
      low_motion_samples_ = 0;
    }
  }

  return false;
}

void GuitarController::_process_strum_motion(const SensorSample *sample,
                                             int64_t current_time) {
  std::array<float, 6> imu_sample = {sample->ax, sample->ay, sample->az,
                                     sample->gx, sample->gy, sample->gz};
  float gyro_z = sample->gz;

  // Update note during strumming before processing stroke
  if (strumming_active_) {
    _update_note_during_strumming();
  }

  // Stroke end detection
  if (stroke_in_progress_) {
    stroke_data_for_ai_.push_back(imu_sample);

    if (_check_stroke_ended(gyro_z, current_time)) {
      int64_t stroke_duration = current_time - stroke_start_time_;

      if (last_stroke_end_time_ > 0) {
        int64_t gap = current_time - last_stroke_end_time_;
        _update_adaptive_gap(gap);
      }

      stroke_in_progress_ = false;
      peak_ai_checked_ = false;
      full_ai_checked_ = false;
      any_correction_sent_ = false;
      low_motion_start_time_ = -1;
      low_motion_samples_ = 0;
      peak_stroke_strength_ = 0.0f;
      last_stroke_end_time_ = current_time;

      if (debug_mode_) {
        std::cout << "   [Ended: " << stroke_duration
                  << "ms, peak: " << peak_stroke_strength_ << "]" << std::endl;
      }

      return;
    }

    // AI correction during stroke (only if AI is loaded)
    if (ai_loaded_) {
      int64_t elapsed = current_time - stroke_start_time_;

      // Peak AI correction
      if (!peak_ai_checked_ && !any_correction_sent_ &&
          elapsed >= AI_TIMING_MS) {
        peak_ai_checked_ = true;
        auto [ai_dir, ai_conf] = _get_peak_ai_prediction();

        if (!ai_dir.empty()) {
          if (ai_dir == current_stroke_direction_) {
            stats_.peak_ai_agreed++;
            if (debug_mode_) {
              std::cout << "   [Peak AI agreed: " << ai_dir
                        << ", conf: " << ai_conf << "]" << std::endl;
            }
          } else if (ai_conf > AI_CONFIDENCE_THRESHOLD) {
            stats_.peak_ai_corrected++;
            stats_.physical_correct--;

            if (current_stroke_direction_ == "down")
              stats_.down--;
            else
              stats_.up--;

            if (ai_dir == "down")
              stats_.down++;
            else
              stats_.up++;

            any_correction_sent_ = true;
            last_confirmed_direction_ = ai_dir;
            current_stroke_direction_ = ai_dir;

            std::string symbol = (ai_dir == "down") ? "↓" : "↑";
            LOG_INFO("   " << symbol << " " << ai_dir << " strum");
          }
        }
      }

      // Full AI verification
      if (full_ai_available_ && !full_ai_checked_ &&
          elapsed >= FULL_AI_TIMING_MS) {
        full_ai_checked_ = true;
        auto [full_dir, full_conf] = _get_full_ai_prediction();

        if (!full_dir.empty()) {
          if (full_dir == current_stroke_direction_) {
            stats_.full_ai_agreed++;
            if (debug_mode_) {
              std::cout << "   [Full AI agreed: " << full_dir
                        << ", conf: " << full_conf << "]" << std::endl;
            }
          } else {
            stats_.full_ai_disagreed++;
            if (debug_mode_) {
              std::cout << "   ⚠ Full AI disagrees: " << full_dir
                        << " (conf: " << full_conf << ")" << std::endl;
            }
          }
        }
      }
    }

    return;
  }

  // New stroke detection
  if (!stroke_in_progress_) {
    auto [direction, strength] = _get_direction_and_strength(gyro_z);

    if (!direction.empty()) {
      auto [valid, reason] = _validate_stroke_strength(direction, strength);

      if (!valid) {
        if (debug_mode_) {
          std::cout << "   [Blocked: " << reason << "]" << std::endl;
        }
        return;
      }

      int64_t time_since_last = current_time - last_stroke_end_time_;

      // Check for opposite direction lockout to prevent return motion detection
      if (!last_confirmed_direction_.empty() &&
          direction != last_confirmed_direction_ &&
          time_since_last < OPPOSITE_DIRECTION_LOCKOUT_MS) {
        stats_.blocked_reset++;
        if (debug_mode_) {
          std::cout << "   [Blocked: opposite direction lockout, "
                    << time_since_last << "ms < "
                    << OPPOSITE_DIRECTION_LOCKOUT_MS << "ms]" << std::endl;
        }
        return;
      }

      // Standard timing check for same direction
      if (time_since_last < current_gap_) {
        stats_.multi_trigger_prevented++;
        if (debug_mode_) {
          std::cout << "   [Too soon: " << time_since_last << "ms < "
                    << current_gap_ << "ms]" << std::endl;
        }
        return;
      }

      // VALID STROKE DETECTED
      stroke_in_progress_ = true;
      stroke_start_time_ = current_time;
      stroke_data_for_ai_.clear();
      current_stroke_direction_ = direction;
      peak_stroke_strength_ = strength;
      low_motion_start_time_ = -1;
      low_motion_samples_ = 0;
      peak_ai_checked_ = false;
      full_ai_checked_ = false;
      any_correction_sent_ = false;

      stats_.total_strokes++;
      if (direction == "down")
        stats_.down++;
      else
        stats_.up++;
      stats_.physical_correct++;

      last_confirmed_direction_ = direction;
      last_confirmed_strength_ = strength;

      std::string symbol = (direction == "down") ? "↓" : "↑";
      std::string ai_status = ai_loaded_ ? " [AI ENABLED]" : " [NO AI]";

      // Add chord information
      std::string chord_info;
      if (!current_chord_name_.empty()) {
        chord_info = " [" + current_chord_name_ + "]";
      } else if (!active_finger_.empty() && current_note_ >= 0) {
        chord_info =
            " [" + active_finger_ + ": " + _get_note_name(current_note_) + "]";
      } else {
        chord_info = " [No chord]";
      }

      // Send GS-2 strum trigger note
      int strum_note =
          (direction == "down") ? 24 : 26; // C1 (24) for Down, D1 (26) for Up
      _send_midi_note_on(strum_note);

      std::cout << symbol << " " << direction << " STRUM" << chord_info
                << ai_status << " (GS-2 Trigger: " << _get_note_name(strum_note)
                << ")" << std::endl;
    }
  }
}

// ============================================================================
// AI PREDICTION
// ============================================================================

std::pair<std::string, float> GuitarController::_get_peak_ai_prediction() {
  if (!ai_loaded_ || stroke_data_for_ai_.size() < 12) {
    return {"", 0.0f};
  }

  try {
    // Find peak gyro magnitude
    float max_gyro_mag = 0.0f;
    size_t peak_idx = 0;

    for (size_t i = 0; i < stroke_data_for_ai_.size(); i++) {
      float gx = stroke_data_for_ai_[i][3];
      float gy = stroke_data_for_ai_[i][4];
      float gz = stroke_data_for_ai_[i][5];
      float mag = std::sqrt(gx * gx + gy * gy + gz * gz);

      if (mag > max_gyro_mag) {
        max_gyro_mag = mag;
        peak_idx = i;
      }
    }

    // Extract 16-sample window centered on peak
    int half = 8;
    int start = std::max(0, static_cast<int>(peak_idx) - half);
    int end =
        std::min(static_cast<int>(stroke_data_for_ai_.size()), start + 16);

    if (end - start < 16) {
      if (start == 0) {
        end = std::min(16, static_cast<int>(stroke_data_for_ai_.size()));
      } else {
        start = std::max(0, static_cast<int>(stroke_data_for_ai_.size()) - 16);
        end = stroke_data_for_ai_.size();
      }
    }

    // Prepare input tensor
    float *input = peak_interpreter_->typed_input_tensor<float>(0);

    for (int i = 0; i < 16; i++) {
      for (int j = 0; j < 6; j++) {
        float val;
        if (start + i < static_cast<int>(stroke_data_for_ai_.size())) {
          val = stroke_data_for_ai_[start + i][j];
        } else {
          val = 0.0f; // Padding
        }

        // Normalize
        val = (val - peak_mean_[j]) / peak_scale_[j];
        input[i * 6 + j] = val;
      }
    }

    // Run inference
    peak_interpreter_->Invoke();

    // Get output
    float *output = peak_interpreter_->typed_output_tensor<float>(0);
    int pred_class = (output[0] > output[1]) ? 0 : 1;
    float confidence = output[pred_class];

    std::string direction = (pred_class == 1) ? "up" : "down";
    return {direction, confidence};

  } catch (const std::exception &e) {
    std::cout << "⚠ Peak AI prediction error: " << e.what() << std::endl;
    return {"", 0.0f};
  }
}

std::pair<std::string, float> GuitarController::_get_full_ai_prediction() {
  if (!full_ai_available_ || stroke_data_for_ai_.size() < 18) {
    return {"", 0.0f};
  }

  try {
    // Prepare input tensor (first 24 samples)
    float *input = full_interpreter_->typed_input_tensor<float>(0);

    for (int i = 0; i < 24; i++) {
      for (int j = 0; j < 6; j++) {
        float val;
        if (i < static_cast<int>(stroke_data_for_ai_.size())) {
          val = stroke_data_for_ai_[i][j];
        } else {
          val = 0.0f; // Padding
        }

        // Normalize
        val = (val - full_mean_[j]) / full_scale_[j];
        input[i * 6 + j] = val;
      }
    }

    // Run inference
    full_interpreter_->Invoke();

    // Get output
    float *output = full_interpreter_->typed_output_tensor<float>(0);
    int pred_class = (output[0] > output[1]) ? 0 : 1;
    float confidence = output[pred_class];

    std::string direction = (pred_class == 1) ? "up" : "down";
    return {direction, confidence};

  } catch (const std::exception &e) {
    std::cout << "⚠ Full AI prediction error: " << e.what() << std::endl;
    return {"", 0.0f};
  }
}

// ============================================================================
// MIDI METHODS
// ============================================================================

void GuitarController::_send_midi_note_on(int note, bool retrigger) {
  if (g_audioEngine) {
    g_audioEngine->sendMIDI(6, note, 100, true); // Track 6 = Guitar
  }
}

void GuitarController::_send_midi_note_off(int note) {
  if (g_audioEngine) {
    g_audioEngine->sendMIDI(6, note, 0, false); // Track 6 = Guitar
  }
}

// ============================================================================
// UTILITY
// ============================================================================

int64_t GuitarController::_now_ms() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}
