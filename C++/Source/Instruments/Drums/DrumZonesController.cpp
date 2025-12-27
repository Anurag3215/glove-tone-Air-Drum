#include "DrumZonesController.h"
#include "../../Audio/JuceAudioEngine.h"
#include "../../core/Logger.h"
#include "../../core/SensorSample.h"
#include "../../core/main_controller.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <iostream>
#include <numeric>

extern JuceAudioEngine *g_audioEngine;

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ============================================================================
// UTILITY FUNCTIONS (from original Python)
// ============================================================================

float wrap180(float a) {
  while (a > 180.0f) {
    a -= 360.0f;
  }
  while (a < -180.0f) {
    a += 360.0f;
  }
  return a;
}

float get_yaw_from_quat(float w, float x, float y, float z) {
  // Extract yaw from quaternion (rotation around Z-axis)
  float siny_cosp = 2.0f * (w * z + x * y);
  float cosy_cosp = 1.0f - 2.0f * (y * y + z * z);
  return std::atan2(siny_cosp, cosy_cosp) * 180.0f / M_PI;
}

float get_gravity_z(float w, float x, float y, float z) {
  // Get gravity vector Z-component (how much hand is tilted down)
  return w * w - x * x - y * y + z * z;
}

// ============================================================================
// ZONE HIT DETECTOR IMPLEMENTATION
// ============================================================================

ZoneHitDetector::ZoneHitDetector(float accel_threshold, float gyro_threshold)
    : accel_threshold_(accel_threshold), gyro_threshold_(gyro_threshold),
      was_above_(false), hit_triggered_(false), time_fell_below_(0),
      reset_delay_ms_(HIT_RESET_DELAY_MS) {}

ZoneHitDetector::HitResult
ZoneHitDetector::process_sample(const SensorSample *sample,
                                uint32_t current_time_ms) {
  // Compute magnitudes exactly like original Python
  float accel_raw =
      std::sqrt(sample->ax * sample->ax + sample->ay * sample->ay +
                sample->az * sample->az);

  // Convert gyro from rad/s to deg/s
  float gyro_raw = std::sqrt(sample->gx * sample->gx + sample->gy * sample->gy +
                             sample->gz * sample->gz) *
                   180.0f / M_PI;

  // Add to history (maxlen=3)
  accel_history_.push_back(accel_raw);
  if (accel_history_.size() > HISTORY_SIZE) {
    accel_history_.pop_front();
  }

  gyro_history_.push_back(gyro_raw);
  if (gyro_history_.size() > HISTORY_SIZE) {
    gyro_history_.pop_front();
  }

  // Compute moving average
  float accel_mag =
      std::accumulate(accel_history_.begin(), accel_history_.end(), 0.0f) /
      accel_history_.size();
  float gyro_mag =
      std::accumulate(gyro_history_.begin(), gyro_history_.end(), 0.0f) /
      gyro_history_.size();

  // Both thresholds must be exceeded
  bool is_above =
      (accel_mag > accel_threshold_) && (gyro_mag > gyro_threshold_);

  bool hit = false;

  // State machine from original
  if (is_above && !was_above_) {
    hit_triggered_ = false;
  }

  if (is_above && !hit_triggered_) {
    hit = true;
    hit_triggered_ = true;
  }

  if (!is_above && was_above_) {
    time_fell_below_ = current_time_ms;
  }

  if (!is_above && (current_time_ms - time_fell_below_) > reset_delay_ms_) {
    hit_triggered_ = false;
  }

  was_above_ = is_above;

  HitResult result;
  result.hit_detected = hit;
  result.magnitude = hit ? accel_mag : 0.0f;

  return result;
}

// ============================================================================
// DRUM HAND ZONES IMPLEMENTATION
// ============================================================================

DrumHandZones::DrumHandZones(const std::string &hand_name, int channel_id)
    : hand_name_(hand_name), channel_id_(channel_id), detector_(),
      have_yaw_zero_(false), yaw0_(0.0f), yaw_E_(0.0f), gyro_mag_E_(0.0f),
      grav_Z_E_(0.0f), seeded_(false), current_zone_("LeftInner"),
      waist_start_ms_(0), last_print_(0.0),
      waist_gravity_thresh_(WAIST_GRAVITY_THRESH), hit_count_(0),
      sample_count_(0), last_sample_time_(0.0), sample_rate_(0),
      last_rate_calc_time_(0.0) {

  std::cout << "✓ Drum Hand (" << hand_name << "): Zone controller initialized"
            << std::endl;
}

void DrumHandZones::set_baseline(float yaw0, float waist_gravity_thresh) {
  yaw0_ = yaw0;
  have_yaw_zero_ = true;
  seeded_ = false;
  waist_gravity_thresh_ = waist_gravity_thresh;

  printf("✓ Drum Hand (%s): Baseline set - yaw0: %.2f°, waist_thresh: %.3f\n",
         hand_name_.c_str(), yaw0, waist_gravity_thresh_);
}

void DrumHandZones::add_calibration_sample(const SensorSample &sample) {
  sample_buffer_.push_back(sample);
  if (sample_buffer_.size() > BUFFER_SIZE) {
    sample_buffer_.pop_front();
  }
}

void DrumHandZones::handle_sample(const SensorSample *sample) {
  if (!sample)
    return;

  // Debug sensor data (only when debug mode is ON)
  static int debug_counter = 0;
  if (++debug_counter % 50 == 0) {
    LOG_DEBUG("🥁 DRUM zone MODE ("
              << hand_name_ << ") | accel: x=" << sample->ax
              << " y=" << sample->ay << " z=" << sample->az << " | gyro: x="
              << sample->gx << " y=" << sample->gy << " z=" << sample->gz);
  }

  sample_count_++;
  add_calibration_sample(*sample);

  // Update sample rate calculation (from original)
  double current_time = get_current_time();
  if (current_time - last_rate_calc_time_ >= 1.0) {
    sample_rate_ = sample_count_;
    sample_count_ = 0;
    last_rate_calc_time_ = current_time;
  }

  // Wait for calibration
  if (!have_yaw_zero_) {
    return;
  }

  // Extract values
  float qw = sample->qw, qx = sample->qx, qy = sample->qy, qz = sample->qz;
  float gx = sample->gx, gy = sample->gy, gz = sample->gz;
  uint32_t current_time_ms = sample->ts;

  // Calculate yaw and gravity
  float yaw = get_yaw_from_quat(qw, qx, qy, qz);
  float grav_z = get_gravity_z(qw, qx, qy, qz);
  float gyro_mag = std::sqrt(gx * gx + gy * gy + gz * gz) * 180.0f / M_PI;

  // Calculate relative yaw
  float yaw_rel = wrap180(yaw - yaw0_);

  // Invert left hand zones for consistent orientation (from original)
  if (hand_name_ == "LEFT") {
    yaw_rel = -yaw_rel; // Invert for left hand
  }

  // Initialize smoothing
  if (!seeded_) {
    yaw_E_ = yaw_rel;
    gyro_mag_E_ = gyro_mag;
    grav_Z_E_ = grav_z;
    seeded_ = true;
  }

  // Smooth values with EMA (from original)
  yaw_E_ = EMA_ALPHA_SLOW * yaw_rel + (1.0f - EMA_ALPHA_SLOW) * yaw_E_;
  gyro_mag_E_ =
      EMA_ALPHA_FAST * gyro_mag + (1.0f - EMA_ALPHA_FAST) * gyro_mag_E_;
  grav_Z_E_ = EMA_ALPHA_SLOW * grav_z + (1.0f - EMA_ALPHA_SLOW) * grav_Z_E_;

  // Classify zone
  std::string zone = classify_zone(yaw_E_, grav_Z_E_, current_time_ms);

  // Detect hit
  auto result = detector_.process_sample(sample, current_time_ms);

  if (result.hit_detected) {
    hit_count_++;
    play_zone_sound(zone);

    // Format output (from original)
    std::string hand_label = (hand_name_ == "LEFT") ? "LEFT " : "RIGHT";
    LOG_INFO("🥁 " << hand_label << " HIT: " << zone << " | "
                   << result.magnitude << " m/s²");
  }

  // Print status occasionally (from original)
  double current_time_real = get_current_time() * 1000.0;
  if (current_time_real - last_print_ >= PRINT_MS) {
    last_print_ = current_time_real;

    std::string hand_label = (hand_name_ == "LEFT") ? "LEFT " : "RIGHT";
    LOG_DEBUG(hand_label << ": yaw=" << yaw_E_ << "° gravZ=" << grav_Z_E_
                         << " | ZONE: " << zone << " | Rate: " << sample_rate_
                         << " Hz");
  }

  current_zone_ = zone;
}

std::string DrumHandZones::classify_zone(float yaw_rel, float grav_z,
                                         uint32_t current_time_ms) {
  // WAIST detection (from original)
  if (grav_z < waist_gravity_thresh_) {
    if (waist_start_ms_ == 0) {
      waist_start_ms_ = current_time_ms;
    }
    if (current_time_ms - waist_start_ms_ >= WAIST_DEBOUNCE_MS) {
      return "Waist";
    }
  } else {
    waist_start_ms_ = 0;
  }

  // Zone classification by yaw with hysteresis (from original)
  // Note: Left hand yaw is already inverted, so logic remains the same for both
  // hands
  if (yaw_rel <
      (LOUT_THRESH - (current_zone_ == "LeftOuter" ? -HYST_YAW : HYST_YAW))) {
    return "LeftOuter";
  } else if (yaw_rel <
             (LIN_THRESH -
              (current_zone_ == "LeftInner" ? -HYST_YAW : HYST_YAW))) {
    return "LeftInner";
  } else if (yaw_rel >
             (ROUT_THRESH +
              (current_zone_ == "RightOuter" ? -HYST_YAW : HYST_YAW))) {
    return "RightOuter";
  } else if (yaw_rel >
             (RIN_THRESH +
              (current_zone_ == "RightInner" ? -HYST_YAW : HYST_YAW))) {
    return "RightInner";
  } else {
    if (current_zone_ == "LeftOuter" || current_zone_ == "LeftInner") {
      return "LeftInner";
    } else {
      return "RightInner";
    }
  }
}

void DrumHandZones::play_zone_sound(const std::string &zone) {
  // Map zone names to MIDI note numbers for Track 2 (Drum Zones)
  static const std::unordered_map<std::string, int> zoneToNote = {
      {"LeftOuter", 10},
      {"LeftInner", 11},
      {"RightInner", 12},
      {"RightOuter", 13},
      {"Waist", 14}};

  if (g_audioEngine) {
    auto it = zoneToNote.find(zone);
    if (it != zoneToNote.end()) {
      int midiNote = zoneToMidiNote(it->second);
      g_audioEngine->sendMIDI(2, midiNote, 127, true); // Track 2 = Drum Zones
    }
  }
}

float DrumHandZones::compute_yaw_average(int num_samples) {
  if (sample_buffer_.size() < static_cast<size_t>(num_samples)) {
    return 0.0f; // Not enough samples
  }

  float yaw_sum = 0.0f;
  int count = 0;

  // Use last num_samples
  auto start_it = sample_buffer_.end() - num_samples;
  for (auto it = start_it; it != sample_buffer_.end(); ++it) {
    float yaw = get_yaw_from_quat(it->qw, it->qx, it->qy, it->qz);
    yaw_sum += yaw;
    count++;
  }

  return (count > 0) ? (yaw_sum / count) : 0.0f;
}

float DrumHandZones::compute_waist_baseline(int num_samples) {
  if (sample_buffer_.size() < static_cast<size_t>(num_samples)) {
    return WAIST_GRAVITY_THRESH; // Return default
  }

  float gz_sum = 0.0f;
  int count = 0;

  // Use last num_samples
  auto start_it = sample_buffer_.end() - num_samples;
  for (auto it = start_it; it != sample_buffer_.end(); ++it) {
    float gz = get_gravity_z(it->qw, it->qx, it->qy, it->qz);
    gz_sum += gz;
    count++;
  }

  if (count > 0) {
    float waist_grav_z = gz_sum / count;
    return waist_grav_z - 0.5f; // From original: waist_grav_z - 0.5
  }

  return WAIST_GRAVITY_THRESH;
}

// ============================================================================
// DRUM CONTROLLER ZONES IMPLEMENTATION
// ============================================================================

DrumZonesControllerImpl::DrumZonesControllerImpl()
    : left_hand_("LEFT", 0), right_hand_("RIGHT", 1), calibrated_(false) {

  std::cout << "✓ Drum Controller (Zones): Initialized - 5 zones per hand"
            << std::endl;
  std::cout << "  Zones: LeftOuter, LeftInner, RightInner, RightOuter, Waist"
            << std::endl;
}

DrumZonesControllerImpl::~DrumZonesControllerImpl() {
  // Cleanup if needed
}

void DrumZonesControllerImpl::calibrate(
    const std::vector<SensorSample> &left_samples,
    const std::vector<SensorSample> &right_samples) {
  if (left_samples.empty() || right_samples.empty()) {
    std::cout << "❌ Drum Controller (Zones): No calibration samples provided"
              << std::endl;
    return;
  }

  // Fill hand buffers with calibration samples (like original)
  for (const auto &sample : left_samples) {
    left_hand_.add_calibration_sample(sample);
  }
  for (const auto &sample : right_samples) {
    right_hand_.add_calibration_sample(sample);
  }

  // Compute yaw baselines (like original)
  float left_yaw0 = left_hand_.compute_yaw_average(40);
  float right_yaw0 = right_hand_.compute_yaw_average(40);

  // Compute waist gravity thresholds (like original)
  float left_waist_thresh = left_hand_.compute_waist_baseline(40);
  float right_waist_thresh = right_hand_.compute_waist_baseline(40);

  // Set baselines
  left_hand_.set_baseline(left_yaw0, left_waist_thresh);
  right_hand_.set_baseline(right_yaw0, right_waist_thresh);

  calibrated_ = true;
  std::cout << "✓ Drum Controller (Zones): Calibration complete" << std::endl;
  printf("  Left: yaw0=%.2f°, waist_thresh=%.3f\n", left_yaw0,
         left_waist_thresh);
  printf("  Right: yaw0=%.2f°, waist_thresh=%.3f\n", right_yaw0,
         right_waist_thresh);
}

void DrumZonesControllerImpl::handle_samples(const SensorSample *left_sample,
                                             const SensorSample *right_sample) {
  if (!calibrated_) {
    return;
  }

  if (left_sample) {
    left_hand_.handle_sample(left_sample);
  }

  if (right_sample) {
    right_hand_.handle_sample(right_sample);
  }
}

DrumZonesControllerImpl::Stats DrumZonesControllerImpl::get_stats() const {
  Stats stats;
  stats.left_hits = left_hand_.get_hit_count();
  stats.left_samples = left_hand_.get_sample_count();
  stats.right_hits = right_hand_.get_hit_count();
  stats.right_samples = right_hand_.get_sample_count();
  return stats;
}
int zoneToMidiNote(int zone) {
  switch (zone) {
  case 10:
    return 36; // Kick
  case 11:
    return 38; // Snare
  case 12:
    return 48; // Tom 1
  case 13:
    return 50; // Tom 2
  case 14:
    return 42; // Hi-hat
  case 15:
    return 49; // Crash
  default:
    return zone; // Fallback
  }
}
