#define _USE_MATH_DEFINES
#include "ViolinController.h"
#include "../../core/Logger.h"
#include <algorithm>
#include <numeric>
#include <thread>
#include "../../Audio/JuceAudioEngine.h"
#include "../../core/SensorSample.h"

extern JuceAudioEngine* g_audioEngine;



ViolinController::ViolinController(MidiOutput* midi_out, const std::string& model_path) 
    : midi_out_(midi_out), ai_loaded_(false), full_ai_available_(false),
      current_pitch_(0.0f), current_roll_(0.0f), current_yaw_(0.0f),
      previous_roll_(0.0f), current_zone_(PitchZone::NATURAL), 
      previous_zone_(PitchZone::NATURAL), octave_offset_(0), current_octave_(4),
      roll_state_(RollState::NEUTRAL), last_roll_change_time_(0.0),
      returning_to_neutral_(false), fsr_active_(false), 
      fsr_state_change_time_(0.0), bow_in_progress_(false), bow_start_time_(0.0),
      last_bow_end_time_(0.0), current_bow_direction_(""), previous_bow_direction_(""),
      peak_bow_strength_(0.0f), low_motion_start_time_(0.0), low_motion_samples_(0),
      peak_ai_checked_(false), full_ai_checked_(false), any_correction_sent_(false),
      expression_active_(false), last_expression_time_(0.0), 
      expression_velocity_(EXPRESSION_MIN_VELOCITY), expression_ramp_start_time_(0.0),
      expression_note_playing_(false), middle_bent_(false), ring_bent_(false), 
      pinky_bent_(false), note_playing_(false), bow_active_(false) {
    
    std::cout << "🎻 Violin Controller: Initializing..." << std::endl;
    
    // Load AI models
    load_ai_models(model_path);
    
    // Initialize hand components
    setup_left_hand();
    setup_right_hand();
    
    std::cout << "✓ Violin Controller: Ready" << std::endl;
    std::cout << "   Left: POLYPHONIC Pitch control (multiple fingers = multiple notes)" << std::endl;
    std::cout << "   Right: Bow control (FSR + motion + AI correction)" << std::endl;
    std::cout << "   AI: " << (ai_loaded_ ? "Loaded" : "NOT LOADED - using basic detection") << std::endl;
}

ViolinController::~ViolinController() {
    cleanup();
}

void ViolinController::load_ai_models(const std::string& model_path) {
    // ✅ FIXED: Use parameter instead of hardcoded path
    std::string peak_model_file = model_path + "peak_centered_model.tflite";
    peak_model_ = tflite::FlatBufferModel::BuildFromFile(peak_model_file.c_str());
    
    if (peak_model_) {
        tflite::ops::builtin::BuiltinOpResolver resolver;
        tflite::InterpreterBuilder(*peak_model_, resolver)(&peak_interpreter_);
        
        if (peak_interpreter_ && peak_interpreter_->AllocateTensors() == kTfLiteOk) {
            ai_loaded_ = true;
            std::cout << "✓ Peak AI model loaded from: " << peak_model_file << std::endl;
            
            // ✅ ACTUAL SCALER VALUES FROM PYTHON OUTPUT
            std::vector<float> peak_mean = {-1.297957120030059f, 4.935435546887531f, 5.617038851968094f, 
                                           0.6244128288098837f, -1.4366412413353984f, 1.0179266499432607f};
            std::vector<float> peak_scale = {5.790669075863081f, 5.236846846547977f, 3.3489509870927243f,
                                           4.130277224726158f, 1.9638883873382f, 6.730611334609484f};
            peak_scaler_.set_params(peak_mean, peak_scale);
        }
    }
    
    if (!ai_loaded_) {
        std::cout << "⚠️  Peak AI model files not found at " << peak_model_file << std::endl;
        return;
    }
    
    // Try to load full model (optional)
    std::string full_model_file = model_path + "full_model.tflite";
    full_model_ = tflite::FlatBufferModel::BuildFromFile(full_model_file.c_str());
    
    if (full_model_) {
        tflite::ops::builtin::BuiltinOpResolver resolver;
        tflite::InterpreterBuilder(*full_model_, resolver)(&full_interpreter_);
        
        if (full_interpreter_ && full_interpreter_->AllocateTensors() == kTfLiteOk) {
            full_ai_available_ = true;
            
            // ✅ ACTUAL SCALER VALUES FROM PYTHON OUTPUT
            std::vector<float> full_mean = {3.3496790048818283f, 5.411688434014145f, 4.369721743392039f,
                                          0.17744901330466187f, 0.03346729904353241f, -0.09218868131658885f};
            std::vector<float> full_scale = {5.025037000058037f, 1.9874316911881293f, 2.813201836021886f,
                                           0.4681524532649702f, 0.27428502065841004f, 0.30135473716181144f};
            full_scaler_.set_params(full_mean, full_scale);
            
            std::cout << "✓ Full AI model loaded from: " << full_model_file << std::endl;
        } else {
            std::cout << "ℹ️  Full AI model not available (optional)" << std::endl;
        }
    }
}

void ViolinController::setup_left_hand() {
    roll_history_ = std::deque<float>(5, 0.0f);
    
    // Initialize flex sensors (EXACT from Python)
    flex_sensors_["thumb"] = FlexSensor("thumb", FLEX_THRESHOLDS[0]);
    flex_sensors_["index"] = FlexSensor("index", FLEX_THRESHOLDS[1]);
    flex_sensors_["middle"] = FlexSensor("middle", FLEX_THRESHOLDS[2]);
    flex_sensors_["ring"] = FlexSensor("ring", FLEX_THRESHOLDS[3]);
    flex_sensors_["pinky"] = FlexSensor("pinky", FLEX_THRESHOLDS[4]);
}

void ViolinController::setup_right_hand() {
    // Initialization done in constructor
}

void ViolinController::handle_samples(const SensorSample* left_sample, const SensorSample* right_sample) {
    if (left_sample) {
        process_left_hand(left_sample);
    }
    
    if (right_sample) {
        process_right_hand(right_sample);
    }
}

void ViolinController::calibrate(const std::vector<SensorSample>& left_baseline, 
                                const std::vector<SensorSample>& right_baseline) {
    std::cout << "✓ Violin Controller: Calibration received" << std::endl;
}

// ============================================================================
// LEFT HAND PROCESSING - POLYPHONIC (COMPLETE)
// ============================================================================

void ViolinController::process_left_hand(const SensorSample* sample) {
    update_left_orientation(sample);
    
    PitchZone new_zone = determine_zone();
    if (new_zone != current_zone_) {
        previous_zone_ = current_zone_;
        current_zone_ = new_zone;
        LOG_INFO("→ Zone: " << print_zone(current_zone_) << " | yaw=" << current_yaw_ << "° [Sharps>25, Natural:-25~25, Flats<-25]");
    }
    
    update_octave_offset();
    
    for (auto& pair : flex_sensors_) {
        read_left_flex_sensor(pair.first, sample);
    }
}

void ViolinController::update_left_orientation(const SensorSample* sample) {
    auto euler = quaternion_to_euler(sample->qw, sample->qx, sample->qy, sample->qz);
    
    previous_roll_ = current_roll_;
    current_pitch_ = normalize_angle(euler[0]);
    current_roll_ = -normalize_angle(euler[1]);  // Inverted roll like Python
    current_yaw_ = normalize_angle(euler[2]);
    
    roll_history_.push_back(current_roll_);
    if (roll_history_.size() > 5) {
        roll_history_.pop_front();
    }
}

std::array<float, 3> ViolinController::quaternion_to_euler(float qw, float qx, float qy, float qz) const {
    std::array<float, 3> euler;
    
    float sinr_cosp = 2 * (qw * qx + qy * qz);
    float cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
    euler[1] = std::atan2(sinr_cosp, cosr_cosp) * 180.0f / M_PI; // roll
    
    float sinp = 2 * (qw * qy - qz * qx);
    if (std::abs(sinp) >= 1) {
        euler[0] = std::copysign(M_PI / 2.0f, sinp) * 180.0f / M_PI; // pitch
    } else {
        euler[0] = std::asin(sinp) * 180.0f / M_PI; // pitch
    }
    
    float siny_cosp = 2 * (qw * qz + qx * qy);
    float cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
    euler[2] = std::atan2(siny_cosp, cosy_cosp) * 180.0f / M_PI; // yaw
    
    return euler;
}

float ViolinController::normalize_angle(float angle) const {
    while (angle > 180.0f) angle -= 360.0f;
    while (angle < -180.0f) angle += 360.0f;
    return angle;
}

ViolinController::PitchZone ViolinController::determine_zone() const {
    if (current_yaw_ > 25.0f) {
        return PitchZone::SHARPS;
    } else if (current_yaw_ < -25.0f) {
        return PitchZone::FLATS;
    } else {
        return PitchZone::NATURAL;
    }
}

void ViolinController::update_octave_offset() {
    double current_time = now_ms() / 1000.0; // Convert to seconds

    // Cooldown check
    if (current_time - last_roll_change_time_ < ROLL_CHANGE_COOLDOWN) {
        return;
    }

    if (roll_history_.size() < 3) {
        return;
    }

    float recent_movement = current_roll_;
    
    // Check if in neutral zone
    bool in_neutral = std::abs(recent_movement - NEUTRAL_CENTER) < NEUTRAL_ZONE;
    
    if (in_neutral) {
        roll_state_ = RollState::NEUTRAL;
        returning_to_neutral_ = false;
        return;
    }

    // Not in neutral - check for octave changes
    if (!returning_to_neutral_) {
        // OCTAVE UP: Thumb side up
        if (recent_movement > 0 && recent_movement < OCTAVE_UP_THRESHOLD && 
            roll_state_ == RollState::NEUTRAL) {
            current_octave_ += 1;
            if (current_octave_ > MAX_OCTAVE) {
                current_octave_ = MAX_OCTAVE;
            }
            roll_state_ = RollState::THUMB_UP;
            last_roll_change_time_ = current_time;
            returning_to_neutral_ = true;
            octave_offset_ = (current_octave_ - 4) * 12;
            std::cout << ">>> OCTAVE UP to " << current_octave_ 
                      << " (roll: " << recent_movement << "°)" << std::endl;
        }
        // OCTAVE DOWN: Pinky side up  
        else if (recent_movement < OCTAVE_DOWN_THRESHOLD && 
                 roll_state_ == RollState::NEUTRAL) {
            current_octave_ -= 1;
            if (current_octave_ < MIN_OCTAVE) {
                current_octave_ = MIN_OCTAVE;
            }
            roll_state_ = RollState::PINKY_UP;
            last_roll_change_time_ = current_time;
            returning_to_neutral_ = true;
            octave_offset_ = (current_octave_ - 4) * 12;
            std::cout << ">>> OCTAVE DOWN to " << current_octave_ 
                      << " (roll: " << recent_movement << "°)" << std::endl;
        }
    }
    // Check for return to neutral
    else if (returning_to_neutral_) {
        if (in_neutral) {
            roll_state_ = RollState::NEUTRAL;
            returning_to_neutral_ = false;
        }
    }
}

void ViolinController::read_left_flex_sensor(const std::string& finger_name, const SensorSample* sample) {
    FlexSensor& sensor = flex_sensors_[finger_name];
    double current_time = now_ms() / 1000.0;
    
    uint16_t flex_value = 0;
    if (finger_name == "thumb") flex_value = sample->flex_thumb;
    else if (finger_name == "index") flex_value = sample->flex_index;
    else if (finger_name == "middle") flex_value = sample->flex_middle;
    else if (finger_name == "ring") flex_value = sample->flex_ring;
    else if (finger_name == "pinky") flex_value = sample->flex_pinky;
    
    bool is_bent_now = flex_value < sensor.threshold;
    
    if (is_bent_now && !sensor.is_bent) {
        sensor.finger_locked_zone = current_zone_;
        sensor.finger_active_in_zone = true;
        
        if (current_time - sensor.last_note_time > DEBOUNCE_TIME) {
            int note = prepare_note(finger_name);
            if (note > 0) {
                prepared_notes_.push_back(note);
                sensor.last_note = note;
                sensor.last_note_time = current_time;
            }
        }
        
        sensor.is_bent = true;

        if (bow_active_) {
            stop_current_notes();
            play_current_notes();
        }
    } else if (!is_bent_now && sensor.is_bent) {
        sensor.is_bent = false;
        sensor.finger_active_in_zone = false;
        
        // Remove note from prepared notes
        auto it = std::find(prepared_notes_.begin(), prepared_notes_.end(), sensor.last_note);
        if (it != prepared_notes_.end()) {
            prepared_notes_.erase(it);
        }
        
        // Stop note if playing
        auto active_it = std::find(active_notes_.begin(), active_notes_.end(), sensor.last_note);
        if (active_it != active_notes_.end()) {
            send_note_off(sensor.last_note);
            active_notes_.erase(active_it);
            std::cout << "✗ " << sensor.name << " - " << get_note_name(sensor.last_note) << std::endl;
            
            // Update note playing state
            if (active_notes_.empty()) {
                note_playing_ = false;
            }
        }
    }
}

int ViolinController::prepare_note(const std::string& finger_name) {
    FlexSensor& sensor = flex_sensors_[finger_name];
    int finger_index = 0;
    if (finger_name == "thumb") finger_index = 0;
    else if (finger_name == "index") finger_index = 1;
    else if (finger_name == "middle") finger_index = 2;
    else if (finger_name == "ring") finger_index = 3;
    else if (finger_name == "pinky") finger_index = 4;
    
    PitchZone zone_to_use = sensor.finger_active_in_zone ? sensor.finger_locked_zone : current_zone_;
    int base_note = 0;
    
    switch (zone_to_use) {
        case PitchZone::NATURAL:
            base_note = NOTES_NATURAL[finger_index];
            break;
        case PitchZone::SHARPS:
            base_note = NOTES_SHARPS[finger_index];
            break;
        case PitchZone::FLATS:
            base_note = NOTES_FLATS[finger_index];
            break;
    }
    
    int final_note = base_note + octave_offset_;
    final_note = std::max(0, std::min(127, final_note));
    
    std::string zone_name;
    switch (zone_to_use) {
        case PitchZone::NATURAL: zone_name = "Natural"; break;
        case PitchZone::SHARPS: zone_name = "Sharps"; break;
        case PitchZone::FLATS: zone_name = "Flats"; break;
    }
    
    LOG_INFO("♪ " << sensor.name << " → " << get_note_name(final_note) << " (" << zone_name << ") [READY]");
    
    return final_note;
}

void ViolinController::play_current_notes() {
    if (!prepared_notes_.empty() && !note_playing_) {
        for (int note : prepared_notes_) {
            send_note_on(note, 127);
            active_notes_.push_back(note);
        }
        
        note_playing_ = true;
        std::string note_names;
        for (size_t i = 0; i < prepared_notes_.size(); ++i) {
            if (i > 0) note_names += ", ";
            note_names += get_note_name(prepared_notes_[i]);
        }
        LOG_INFO("🎻 BOWING: " << note_names);
    }
}

void ViolinController::stop_current_notes() {
    if (!active_notes_.empty()) {
        for (int note : active_notes_) {
            send_note_off(note);
        }
        active_notes_.clear();
        note_playing_ = false;
        std::cout << "🎻 BOW STOPPED - All notes off" << std::endl;
    }
}

// ============================================================================
// RIGHT HAND PROCESSING - COMPLETE BOW MOTION + AI
// ============================================================================

double ViolinController::now_ms() const {
    auto now = std::chrono::steady_clock::now();
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()).count();
}

void ViolinController::process_right_hand(const SensorSample* sample) {
    double current_time = now_ms();
    
    check_expression_state(sample, current_time);
    update_bow_state(sample->fsr, current_time);
    
    if (bow_active_) {
        process_bow_motion(sample, current_time);
    }
}

void ViolinController::check_expression_state(const SensorSample* sample, double current_time) {
    bool middle_bent_now = sample->flex_middle < FlexThresholdsRight::MIDDLE;
    bool ring_bent_now = sample->flex_ring < FlexThresholdsRight::RING;
    bool pinky_bent_now = sample->flex_pinky < FlexThresholdsRight::PINKY;
    
    bool expression_condition = (middle_bent_now && ring_bent_now && !pinky_bent_now);
    
    if (expression_condition) {
        if (!expression_active_) {
            if (current_time - last_expression_time_ >= EXPRESSION_DEBOUNCE_MS) {
                expression_active_ = true;
                expression_ramp_start_time_ = current_time;
                expression_velocity_ = EXPRESSION_MIN_VELOCITY;
                last_expression_time_ = current_time;
                stats_.expression_triggers++;
                
                send_note_on(EXPRESSION_NOTE, expression_velocity_);
                expression_note_playing_ = true;
                std::cout << "🎭 EXPRESSION START" << std::endl;
            }
        }
        
        // Gradually increase expression velocity
        if (expression_active_) {
            double elapsed = current_time - expression_ramp_start_time_;
            float progress = std::min(1.0f, static_cast<float>(elapsed) / EXPRESSION_RAMP_TIME_MS);
            
            int new_velocity = EXPRESSION_MIN_VELOCITY + 
                static_cast<int>((EXPRESSION_MAX_VELOCITY - EXPRESSION_MIN_VELOCITY) * progress);
            
            if (new_velocity != expression_velocity_) {
                expression_velocity_ = new_velocity;
                send_note_on(EXPRESSION_NOTE, expression_velocity_);
                std::cout << "🎭 EXPRESSION: " << expression_velocity_ << std::endl;
            }
        }
    } else {
        if (expression_active_) {
            expression_active_ = false;
            if (expression_note_playing_) {
                send_note_off(EXPRESSION_NOTE);
                expression_note_playing_ = false;
                std::cout << "🎭 EXPRESSION STOP" << std::endl;
            }
        }
    }
    
    middle_bent_ = middle_bent_now;
    ring_bent_ = ring_bent_now;
    pinky_bent_ = pinky_bent_now;
}

void ViolinController::update_bow_state(uint16_t fsr_value, double current_time) {
    bool fsr_now = fsr_value > FSR_THRESHOLD;
    
    if (fsr_now != fsr_active_) {
        if (fsr_state_change_time_ == 0.0) {
            fsr_state_change_time_ = current_time;
        } else if (current_time - fsr_state_change_time_ >= FSR_DEBOUNCE_MS) {
            fsr_active_ = fsr_now;
            fsr_state_change_time_ = 0.0;
            
            if (fsr_active_) {
                start_bowing(current_time);
            } else {
                stop_bowing(current_time);
            }
        }
    } else {
        fsr_state_change_time_ = 0.0;
    }
}

void ViolinController::start_bowing(double current_time) {
    bow_active_ = true;
    stats_.total_notes++;
    
    accel_x_buffer_.clear();
    accel_variance_buffer_.clear(); // ✅ INITIALIZE VARIANCE BUFFER
    last_bow_end_time_ = current_time;
    previous_bow_direction_ = "";
    
    std::cout << "🎻 BOW START" << std::endl;
    
    if (!prepared_notes_.empty() && !note_playing_) {
        play_current_notes();
    }
}

void ViolinController::stop_bowing(double current_time) {
    bow_active_ = false;
    if (note_playing_) {
        stop_current_notes();
    } else {
        std::cout << "🎻 BOW STOP" << std::endl;
    }
    
    bow_in_progress_ = false;
    previous_bow_direction_ = "";
}

std::pair<std::string, float> ViolinController::get_direction_and_strength(float accel_x) {
    accel_x_buffer_.push_back(accel_x);
    
    if (accel_x_buffer_.size() < 3) {
        return std::make_pair("", 0.0f);
    }
    
    float smoothed_ax = std::accumulate(accel_x_buffer_.begin(), accel_x_buffer_.end(), 0.0f) / accel_x_buffer_.size();
    float strength = std::abs(smoothed_ax);
    
    if (strength < ACCEL_X_THRESHOLD) {
        return std::make_pair("", 0.0f);
    }
    
    if (smoothed_ax > UP_BOW_MIN_AX) {
        return std::make_pair("down", smoothed_ax);
    } else if (smoothed_ax < DOWN_BOW_MAX_AX) {
        return std::make_pair("up", smoothed_ax);
    }
    
    return std::make_pair("", 0.0f);
}

bool ViolinController::check_bow_ended(float accel_x, double current_time) {
    double bow_duration = current_time - bow_start_time_;
    
    if (bow_duration < BOW_MIN_DURATION_MS) {
        return false;
    }
    
    if (bow_duration > BOW_MAX_DURATION_MS) {
        return true;
    }
    
    float low_threshold = ACCEL_X_THRESHOLD * LOW_MOTION_FACTOR;
    
    if (std::abs(accel_x) < low_threshold) {
        low_motion_samples_++;
        
        if (low_motion_start_time_ == 0.0) {
            low_motion_start_time_ = current_time;
        }
        
        double low_duration = current_time - low_motion_start_time_;
        
        if (low_duration >= BOW_END_DURATION_MS && low_motion_samples_ >= 4) {
            return true;
        }
    } else {
        if (std::abs(accel_x) > ACCEL_X_THRESHOLD) {
            low_motion_start_time_ = 0.0;
            low_motion_samples_ = 0;
        }
    }
    
    return false;
}

// ✅ COMPLETE IMPLEMENTATION WITH VARIANCE BUFFER
void ViolinController::process_bow_motion(const SensorSample* sample, double current_time) {
    std::array<float, 6> imu_sample = {sample->ax, sample->ay, sample->az,
                                       sample->gx, sample->gy, sample->gz};
    float accel_x = sample->ax;
    
    // ✅ VARIANCE BUFFER UPDATE (EXACT Python behavior)
    float current_variance = sample->ax * sample->ax; // Simplified variance calculation
    accel_variance_buffer_.push_back(current_variance);
    if (accel_variance_buffer_.size() > 6) {
        accel_variance_buffer_.pop_front();
    }
    
    // Bow end check
    if (bow_in_progress_) {
        bow_data_for_ai_.push_back(imu_sample);
        
        if (check_bow_ended(accel_x, current_time)) {
            bow_in_progress_ = false;
            peak_ai_checked_ = false;
            full_ai_checked_ = false;
            any_correction_sent_ = false;
            low_motion_start_time_ = 0.0;
            low_motion_samples_ = 0;
            last_bow_end_time_ = current_time;
            
            // ✅ PRINT STATS WHEN BOW ENDS
            print_stats_if_needed();
            return;
        }
        
        // AI correction logic (EXACT Python logic)
        if (ai_loaded_) {
            double elapsed = current_time - bow_start_time_;
            
            // Peak AI correction (REQUIRED)
            if (!peak_ai_checked_ && !any_correction_sent_ && elapsed >= AI_TIMING_MS) {
                peak_ai_checked_ = true;
                auto [ai_dir, ai_conf] = get_peak_ai_prediction();
                
                if (!ai_dir.empty()) {
                    if (ai_dir == current_bow_direction_) {
                        // AI agrees with physical detection - no action
                    } else if (ai_conf > AI_CONFIDENCE_THRESHOLD) {
                        // AI correction
                        any_correction_sent_ = true;
                        current_bow_direction_ = ai_dir;
                        
                        std::string symbol = (ai_dir == "down") ? "↓" : "↑";
                        LOG_INFO("   " << symbol << " " << ai_dir << " BOW");
                    }
                }
            }
            
            // Full AI verification (optional)
            if (full_ai_available_ && !full_ai_checked_ && elapsed >= FULL_AI_TIMING_MS) {
                full_ai_checked_ = true;
                auto [full_dir, full_conf] = get_full_ai_prediction();
                
                if (!full_dir.empty()) {
                    if (full_dir == current_bow_direction_) {
                        // Full AI agrees - no action
                    } else {
                        // Full AI disagrees (for monitoring only)
                        std::cout << "   ⚠ Full AI disagrees: " << full_dir << " (conf: " << full_conf << ")" << std::endl;
                    }
                }
            }
        }
        
        return;
    }
    
    // New bow detection
    if (!bow_in_progress_) {
        auto [direction, ax_value] = get_direction_and_strength(accel_x);
        
        if (direction.empty()) {
            return;
        }
        
        if (direction == previous_bow_direction_) {
            return;
        }
        
        double time_since_last = current_time - last_bow_end_time_;
        
        if (time_since_last < MIN_INTER_BOW_GAP_MS) {
            return;
        }
        
        // Valid bow detected
        bow_in_progress_ = true;
        bow_start_time_ = current_time;
        bow_data_for_ai_.clear();
        current_bow_direction_ = direction;
        previous_bow_direction_ = direction;
        peak_bow_strength_ = std::abs(ax_value);
        low_motion_start_time_ = 0.0;
        low_motion_samples_ = 0;
        peak_ai_checked_ = false;
        full_ai_checked_ = false;
        any_correction_sent_ = false;
        
        stats_.direction_changes++;
        if (direction == "down") {
            stats_.down_bow_count++;
        } else {
            stats_.up_bow_count++;
        }
        
        std::string symbol = (direction == "down") ? "↓" : "↑";
        std::cout << "   " << symbol << " " << direction << " BOW" << std::endl;
    }
}

// ✅ IMPLEMENTED MISSING METHOD
void ViolinController::print_stats_if_needed() {
    // Print statistics every 100 notes (adjust frequency as needed)
    if (stats_.total_notes > 0 && stats_.total_notes % 100 == 0) {
        std::cout << "\n📊 VIOLIN STATS:" << std::endl;
        std::cout << "   Total notes: " << stats_.total_notes << std::endl;
        std::cout << "   Direction changes: " << stats_.direction_changes << std::endl;
        std::cout << "   Down bows: " << stats_.down_bow_count << std::endl;
        std::cout << "   Up bows: " << stats_.up_bow_count << std::endl;
        std::cout << "   Expression triggers: " << stats_.expression_triggers << std::endl;
        
        // Calculate success rate if we have enough data
        if (stats_.direction_changes > 0) {
            float success_rate = (static_cast<float>(stats_.down_bow_count + stats_.up_bow_count) / stats_.direction_changes) * 100.0f;
            std::cout << "   Success rate: " << success_rate << "%" << std::endl;
        }
    }
}

std::pair<std::string, float> ViolinController::get_peak_ai_prediction() {
    if (!ai_loaded_ || bow_data_for_ai_.size() < 12) {
        return std::make_pair("", 0.0f);
    }
    
    try {
        // Convert to numpy array equivalent
        std::vector<float> gyro_mags;
        for (const auto& sample : bow_data_for_ai_) {
            float mag = std::sqrt(sample[3]*sample[3] + sample[4]*sample[4] + sample[5]*sample[5]);
            gyro_mags.push_back(mag);
        }
        
        // Find peak index (equivalent to np.argmax)
        int peak_idx = std::distance(gyro_mags.begin(), 
                                   std::max_element(gyro_mags.begin(), gyro_mags.end()));
        
        // Extract window around peak (EXACT Python logic)
        int half = 8;
        int start = std::max(0, peak_idx - half);
        int end = std::min(static_cast<int>(bow_data_for_ai_.size()), start + 16);
        
        if (end - start < 16) {
            if (start == 0) {
                end = std::min(16, static_cast<int>(bow_data_for_ai_.size()));
            } else {
                start = std::max(0, static_cast<int>(bow_data_for_ai_.size()) - 16);
                end = bow_data_for_ai_.size();
            }
        }
        
        std::vector<std::array<float, 6>> window;
        for (int i = start; i < end; ++i) {
            window.push_back(bow_data_for_ai_[i]);
        }
        
        // Pad if needed (EXACT Python logic)
        if (window.size() < 16) {
            window.resize(16, {0,0,0,0,0,0});
        }
        
        // Apply StandardScaler transformation (EXACT Python preprocessing)
        std::vector<float> window_norm(16 * 6);
        peak_scaler_.transform(window, window_norm.data());
        
        // Set input tensor
        float* input = peak_interpreter_->typed_input_tensor<float>(0);
        std::copy(window_norm.begin(), window_norm.end(), input);
        
        // Run inference
        if (peak_interpreter_->Invoke() != kTfLiteOk) {
            return std::make_pair("", 0.0f);
        }
        
        // Get output (assuming 2-class classification)
        float* output = peak_interpreter_->typed_output_tensor<float>(0);
        int pred_class = (output[1] > output[0]) ? 1 : 0;
        float confidence = output[pred_class];
        
        std::string direction = (pred_class == 1) ? "up" : "down";
        return std::make_pair(direction, confidence);
        
    } catch (const std::exception& e) {
        std::cout << "⚠ Peak AI prediction error: " << e.what() << std::endl;
        return std::make_pair("", 0.0f);
    }
}

std::pair<std::string, float> ViolinController::get_full_ai_prediction() {
    if (!full_ai_available_ || bow_data_for_ai_.size() < 18) {
        return std::make_pair("", 0.0f);
    }
    
    try {
        std::vector<std::array<float, 6>> window;
        if (bow_data_for_ai_.size() >= 24) {
            window = std::vector<std::array<float, 6>>(bow_data_for_ai_.begin(), bow_data_for_ai_.begin() + 24);
        } else {
            window = bow_data_for_ai_;
        }
        
        // Pad if needed
        if (window.size() < 24) {
            window.resize(24, {0,0,0,0,0,0});
        }
        
        // Apply StandardScaler transformation
        std::vector<float> window_norm(24 * 6);
        full_scaler_.transform(window, window_norm.data());
        
        // Set input tensor
        float* input = full_interpreter_->typed_input_tensor<float>(0);
        std::copy(window_norm.begin(), window_norm.end(), input);
        
        // Run inference
        if (full_interpreter_->Invoke() != kTfLiteOk) {
            return std::make_pair("", 0.0f);
        }
        
        // Get output
        float* output = full_interpreter_->typed_output_tensor<float>(0);
        int pred_class = (output[1] > output[0]) ? 1 : 0;
        float confidence = output[pred_class];
        
        std::string direction = (pred_class == 1) ? "up" : "down";
        return std::make_pair(direction, confidence);
        
    } catch (const std::exception& e) {
        std::cout << "⚠ Full AI prediction error: " << e.what() << std::endl;
        return std::make_pair("", 0.0f);
    }
}

void ViolinController::send_note_on(int note, int velocity) {
    if (g_audioEngine) {
        g_audioEngine->sendMIDI(5, note, velocity, true);  // Track 5 = Violin
    }
}

void ViolinController::send_note_off(int note) {
    if (g_audioEngine) {
        g_audioEngine->sendMIDI(5, note, 0, false);  // Track 5 = Violin
    }
}

std::string ViolinController::get_note_name(int midi_note) const {
    static const std::vector<std::string> note_names = {
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
    };
    int octave = (midi_note / 12) - 1;
    int note_index = midi_note % 12;
    return note_names[note_index] + std::to_string(octave);
}

std::string ViolinController::print_zone(PitchZone zone) const {
    switch (zone) {
        case PitchZone::NATURAL: return "Natural";
        case PitchZone::SHARPS: return "Sharps";
        case PitchZone::FLATS: return "Flats";
        default: return "Unknown";
    }
}

void ViolinController::cleanup() {
    // Stop all active notes
    for (int note : active_notes_) {
        send_note_off(note);
    }
    
    // Stop expression note if playing
    if (expression_note_playing_) {
        send_note_off(EXPRESSION_NOTE);
    }
    
    std::cout << "✓ Violin Controller: Cleaned up" << std::endl;
}