#include "DrumFlexController.h"
#include "../../Audio/JuceAudioEngine.h"
#include "../../core/Logger.h"
#include "../../core/SensorSample.h"
#include "../../core/main_controller.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <numeric>

extern JuceAudioEngine *g_audioEngine;

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ============================================================================
// HIT DETECTOR IMPLEMENTATION (ORIGINAL ALGORITHM)
// ============================================================================

HitDetector::HitDetector(bool is_right_hand, int threshold)
    : is_right_hand_(is_right_hand), threshold_(threshold),
      gyro_threshold_(DRUM_GYRO_THRESHOLD), was_above_(false),
      hit_triggered_(false), time_fell_below_(0),
      reset_delay_ms_(DRUM_RESET_DELAY_MS) {}

HitDetector::HitResult HitDetector::process_sample(const SensorSample *sample,
                                                   uint32_t current_time_ms) {
  // Compute magnitudes exactly like original Python
  float accel_raw =
      std::sqrt(sample->ax * sample->ax + sample->ay * sample->ay +
                sample->az * sample->az);

  // Convert gyro from rad/s to deg/s (180/π factor from Python)
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

  // Compute moving average like original
  float accel_mag =
      std::accumulate(accel_history_.begin(), accel_history_.end(), 0.0f) /
      accel_history_.size();
  float gyro_mag =
      std::accumulate(gyro_history_.begin(), gyro_history_.end(), 0.0f) /
      gyro_history_.size();

  // Both thresholds must be exceeded (ORIGINAL REQUIREMENT)
  bool is_above = (accel_mag > threshold_) && (gyro_mag > gyro_threshold_);

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

  // Debouncing: wait 150ms after falling below threshold before allowing new
  // hit
  if (!is_above && (current_time_ms - time_fell_below_) > reset_delay_ms_) {
    hit_triggered_ = false;
  }

  was_above_ = is_above;

  HitResult result;
  if (hit) {
    result.hit_detected = true;
    result.flex_mask = compute_flex_mask(sample);
    result.magnitude = accel_mag;
  } else {
    result.hit_detected = false;
    result.flex_mask = 0;
    result.magnitude = 0.0f;
  }

  return result;
}

int HitDetector::compute_flex_mask(const SensorSample *sample) {
  // BENT (low value) = bit SET (1), EXTENDED (high value) = bit CLEAR (0)
  // Exactly as in original Python
  int mask = 0;

  int t_thumb =
      is_right_hand_ ? FlexThresholdsRight::THUMB : DrumFlexThresholds::THUMB;
  int t_index =
      is_right_hand_ ? FlexThresholdsRight::INDEX : DrumFlexThresholds::INDEX;
  int t_middle =
      is_right_hand_ ? FlexThresholdsRight::MIDDLE : DrumFlexThresholds::MIDDLE;
  int t_ring =
      is_right_hand_ ? FlexThresholdsRight::RING : DrumFlexThresholds::RING;
  int t_pinky =
      is_right_hand_ ? FlexThresholdsRight::PINKY : DrumFlexThresholds::PINKY;
  if (sample->flex_thumb < t_thumb)
    mask |= (1 << 0);
  if (sample->flex_index < t_index)
    mask |= (1 << 1);
  if (sample->flex_middle < t_middle)
    mask |= (1 << 2);
  if (sample->flex_ring < t_ring)
    mask |= (1 << 3);
  if (sample->flex_pinky < t_pinky)
    mask |= (1 << 4);

  return mask;
}

// ============================================================================
// DRUM HAND FLEX IMPLEMENTATION
// ============================================================================

DrumHandFlex::DrumHandFlex(const std::string &hand_name, int channel_id)
    : hand_name_(hand_name), channel_id_(channel_id),
      detector_(hand_name == "RIGHT"), hit_count_(0), sample_count_(0),
      hit_counter_(0) {

  std::cout << "✓ Drum Hand (" << hand_name << "): Flex controller initialized"
            << std::endl;
}

void DrumHandFlex::handle_sample(const SensorSample *sample) {
  if (!sample)
    return;

  // Debug sensor data (only when debug mode is ON)
  static int debug_counter = 0;
  if (++debug_counter % 50 == 0) {
    LOG_DEBUG("🥁 DRUM FLEX MODE ("
              << hand_name_ << ") | accel: x=" << sample->ax
              << " y=" << sample->ay << " z=" << sample->az << " | gyro: x="
              << sample->gx << " y=" << sample->gy << " z=" << sample->gz);
  }

  sample_count_++;
  uint32_t current_time = sample->ts;

  // Detect hit using original algorithm
  auto result = detector_.process_sample(sample, current_time);

  if (result.hit_detected) {
    hit_count_++;
    hit_counter_++;

    auto drum_name_it = DRUM_NAMES.find(result.flex_mask);
    std::string drum_name =
        (drum_name_it != DRUM_NAMES.end()) ? drum_name_it->second : "UNKNOWN";

    if (g_audioEngine) {
      // Debug: detailed hit information (only when debug mode is ON)
      LOG_DEBUG("🥁 HIT DETECTED! Flex Mask=" << result.flex_mask << " ("
                                              << drum_name << ")");
      // Play sound (stubbed for now - will need audio library)
      if (g_audioEngine) {
        int midiNote = flexMaskToMidiNote(result.flex_mask);
        g_audioEngine->sendMIDI(1, midiNote, 127, true);
      }

      // Show every flex hit
      std::string hand_label = (hand_name_ == "LEFT") ? "LEFT " : "RIGHT";

      LOG_INFO("🥁 " << hand_label << " HIT: " << drum_name << " | "
                     << result.magnitude << " m/s²");
    }
  }
}

void DrumHandFlex::play_drum_sound(int flex_mask) {
  if (g_audioEngine) {
    g_audioEngine->sendMIDI(1, flex_mask, 127, true); // Track 1 = Drum Flex
  }
}

// ============================================================================
// DRUM CONTROLLER FLEX IMPLEMENTATION
// ============================================================================

DrumFlexControllerImpl::DrumFlexControllerImpl()
    : left_hand_("LEFT", 0), right_hand_("RIGHT", 1) {

  std::cout << "✓ Drum Controller (Flex): Initialized" << std::endl;
  std::cout << "  Finger combinations determine drum sounds:" << std::endl;
  std::cout << "  0b11111 = KICK, 0b11110 = SNARE, 0b11100 = TOM1" << std::endl;
  std::cout << "  0b11000 = CLAP, 0b10000 = SHAKER, 0b00000 = CRASH"
            << std::endl;
}

DrumFlexControllerImpl::~DrumFlexControllerImpl() {
  // Cleanup if needed
}

void DrumFlexControllerImpl::calibrate(
    const std::vector<SensorSample> &left_baseline,
    const std::vector<SensorSample> &right_baseline) {
  // Original didn't use dynamic calibration, so this is a no-op
  std::cout << "✓ Drum Controller (Flex): Calibration received (using fixed "
               "flex thresholds)"
            << std::endl;
}

void DrumFlexControllerImpl::handle_samples(const SensorSample *left_sample,
                                            const SensorSample *right_sample) {
  if (left_sample) {
    left_hand_.handle_sample(left_sample);
  }

  if (right_sample) {
    right_hand_.handle_sample(right_sample);
  }
}

DrumFlexControllerImpl::Stats DrumFlexControllerImpl::get_stats() const {
  Stats stats;
  stats.left_hits = left_hand_.get_hit_count();
  stats.left_samples = left_hand_.get_sample_count();
  stats.right_hits = right_hand_.get_hit_count();
  stats.right_samples = right_hand_.get_sample_count();
  return stats;
}
int flexMaskToMidiNote(int flexMask) {
  // Map flex combinations to standard MIDI drum notes
  switch (flexMask) {
  case 31:
    return 36; // All fingers (11111) → Kick (C1)
  case 30:
    return 38; // 4 fingers (11110) → Snare (D1)
  case 28:
    return 48; // 3 fingers (11100) → Tom 1 (C2)
  case 24:
    return 50; // 2 fingers (11000) → Tom 2 (D2)
  case 16:
    return 42; // 1 finger  (10000) → Hi-hat (F#1)
  case 0:
    return 49; // No fingers (00000) → Crash (C#2)
  default:
    return 36; // Default to kick
  }
}
