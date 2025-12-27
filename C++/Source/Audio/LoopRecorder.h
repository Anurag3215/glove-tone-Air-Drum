#pragma once

#include <algorithm>
#include <array>
#include <atomic>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>
#include <vector>


/**
 * @file LoopRecorder.h
 * @brief FL Studio-style loop recorder
 *
 * All tracks restart together when the LONGEST track finishes
 */

enum class LoopState {
  IDLE = 0,
  ARMED_START = 1,
  RECORDING = 2,
  ARMED_END = 3,
  PLAYING = 4
};

struct LoopedMidiMessage {
  juce::MidiMessage message;
  int64_t sampleOffset; // Offset from loop start

  LoopedMidiMessage() : sampleOffset(0) {}
  LoopedMidiMessage(const juce::MidiMessage &msg, int64_t offset)
      : message(msg), sampleOffset(offset) {}
};

class LoopRecorder {
public:
  LoopRecorder()

      : state_(LoopState::IDLE), globalLoopLength_(0), recordingStartSample_(0),
        currentLoopSample_(0), globalSampleCounter_(0) {
    for (auto &loop : trackLoops_) {
      loop.messages.reserve(10000);
      loop.messages.clear();
      loop.trackLength = 0;
    }
  }

  // ========== Called from UDP thread ==========

  void armLoopStart() {
    if (state_.load() == LoopState::IDLE ||
        state_.load() == LoopState::PLAYING) {
      auto previousState = state_.load();

      state_.store(LoopState::ARMED_START);

      // ONLY reset loop length if starting fresh (IDLE)
      // PRESERVE loop length when overdubbing (PLAYING)
      if (previousState == LoopState::IDLE) {
        recordingStartSample_ = 0;
        globalLoopLength_ = 0;
        std::cout << "🔴 Loop: ARMED_START (new recording)" << std::endl;
      } else {
        // Overdubbing - sync to current loop position
        recordingStartSample_ = globalSampleCounter_ - currentLoopSample_;
        std::cout
            << "🔴 Loop: ARMED_START (overdubbing - loop continues playing)"
            << std::endl;
      }
    }
  }

  void armLoopEnd() {
    if (state_.load() == LoopState::RECORDING) {
      state_.store(LoopState::ARMED_END);
      std::cout << "⏹️ Loop: ARMED_END - will stop after last MIDI" << std::endl;
    }
  }

  void clearAllLoops() {
    for (auto &loop : trackLoops_) {
      loop.messages.clear();
      loop.trackLength = 0;
    }
    state_.store(LoopState::IDLE);
    currentLoopSample_ = 0;
    globalLoopLength_ = 0;
    std::cout << "🗑️ Loop: All loops cleared" << std::endl;
  }
  void clearTrack(int trackId) {
    int index = trackId - 1;
    if (index >= 0 && index < 7) {
      trackLoops_[index].messages.clear();
      trackLoops_[index].trackLength = 0;

      // Re-calculate global length (if this was the longest track, loop might
      // shrink)
      calculateGlobalLoopLength();
      std::cout << "🗑️ Cleared Track " << trackId << std::endl;
    }
  }
  int getLoopState() const { return static_cast<int>(state_.load()); }

  // ========== Called from audio thread ==========

  /**
   * Process MIDI for loop recording/playback
   * @param trackId Track ID (1-7)
   * @param inputMIDI Input MIDI from controllers
   * @param outputMIDI Output MIDI (input + loop playback)
   * @param numSamples Number of samples in this block
   */
  void processMIDI(int trackId, const juce::MidiBuffer &inputMIDI,
                   juce::MidiBuffer &outputMIDI, int numSamples) {
    auto currentState = state_.load(std::memory_order_relaxed);
    int trackIndex = trackId - 1; // Convert to 0-based

    if (trackIndex < 0 || trackIndex >= 7) {
      return;
    }

    // Copy input MIDI to output
    outputMIDI.addEvents(inputMIDI, 0, numSamples, 0);

    // Handle recording states
    if (currentState == LoopState::ARMED_START ||
        currentState == LoopState::RECORDING ||
        currentState == LoopState::ARMED_END) {

      for (const auto metadata : inputMIDI) {
        auto message = metadata.getMessage();
        auto samplePosition = metadata.samplePosition;

        // Transition ARMED_START → RECORDING on first MIDI
        if (currentState == LoopState::ARMED_START && message.isNoteOn()) {
          recordingStartSample_ = globalSampleCounter_ + samplePosition;
          state_.store(LoopState::RECORDING);
          currentState = LoopState::RECORDING;
          std::cout << "🎙️ Loop: RECORDING started" << std::endl;
        }

        // Record MIDI if we're recording
        if (currentState == LoopState::RECORDING ||
            currentState == LoopState::ARMED_END) {
          int64_t offsetFromStart =
              (globalSampleCounter_ + samplePosition) - recordingStartSample_;
          trackLoops_[trackIndex].messages.emplace_back(message,
                                                        offsetFromStart);

          // Update track length
          if (offsetFromStart > trackLoops_[trackIndex].trackLength) {
            trackLoops_[trackIndex].trackLength = offsetFromStart;
          }
        }

        if (currentState == LoopState::PLAYING && trackId == 7 &&
            message.isNoteOn()) {
          int64_t offset = currentLoopSample_ + samplePosition;
          if (offset < globalLoopLength_) {
            trackLoops_[trackIndex].messages.emplace_back(message, offset);
            std::cout << "🎤 Auto-Recorded MP3 Trigger at " << offset
                      << std::endl;
          }
        }
      }

      // Transition ARMED_END → PLAYING
      if (currentState == LoopState::ARMED_END) {
        // Calculate global loop length (FL Studio style - longest track)
        calculateGlobalLoopLength();

        if (globalLoopLength_ > 0) {
          state_.store(LoopState::PLAYING);
          currentLoopSample_ = 0;

        } else {
          state_.store(LoopState::IDLE);
          std::cout << "⚠️ Loop: No MIDI recorded, returning to IDLE"
                    << std::endl;
        }
      }
    }
    if (globalLoopLength_ > 0) {
      auto &loop = trackLoops_[trackIndex];

      if (!loop.messages.empty() && globalLoopLength_ > 0) {
        // Play MIDI messages that fall within this buffer
        for (const auto &loopedMsg : loop.messages) {
          int64_t msgOffsetInLoop = loopedMsg.sampleOffset % globalLoopLength_;
          // Check if message falls within current buffer
          if (msgOffsetInLoop >= currentLoopSample_ &&
              msgOffsetInLoop < currentLoopSample_ + numSamples) {
            int sampleOffset =
                static_cast<int>(msgOffsetInLoop - currentLoopSample_);
            outputMIDI.addEvent(loopedMsg.message, sampleOffset);
          }
        }
      }
    }
  }

  bool advanceTime(int numSamples) {
    auto currentState = state_.load(std::memory_order_relaxed);
    bool looped = false;
    // Advance counters
    globalSampleCounter_ += numSamples;

    if (globalLoopLength_ > 0) {

      currentLoopSample_ += numSamples;

      // Wrap at loop end (FL Studio style - all tracks restart together)
      if (currentLoopSample_ >= globalLoopLength_) {
        currentLoopSample_ = 0;
        looped = true;
      }
    }
    return looped;
  }

  int64_t getGlobalLoopLength() const { return globalLoopLength_; }

  int64_t getCurrentLoopSample() const { return currentLoopSample_; }

  const std::vector<LoopedMidiMessage> &getTrackMessages(int trackId) const {
    static const std::vector<LoopedMidiMessage> empty;
    int index = trackId - 1;
    if (index >= 0 && index < 7) {
      return trackLoops_[index].messages;
    }
    return empty;
  }

private:
  struct TrackLoop {
    std::vector<LoopedMidiMessage> messages;
    int64_t trackLength; // This track's MIDI length
  };

  std::atomic<LoopState> state_;
  std::array<TrackLoop, 7> trackLoops_;

  int64_t globalLoopLength_; // Longest track length (FL Studio style)
  int64_t recordingStartSample_;
  int64_t currentLoopSample_;
  int64_t globalSampleCounter_;

  /**
   * Calculate global loop length (FL Studio style)
   * Global loop = length of LONGEST track
   * Shorter tracks stay silent until loop restarts
   */
  void calculateGlobalLoopLength() {
    int64_t maxTrackLength = 0;

    for (const auto &loop : trackLoops_) {
      if (loop.trackLength > maxTrackLength) {
        maxTrackLength = loop.trackLength;
      }
    }

    // Only update if new recording is longer (allows extending loop)
    if (maxTrackLength > globalLoopLength_) {
      globalLoopLength_ = maxTrackLength;
      std::cout << "🔄 Loop extended to " << globalLoopLength_ << " samples"
                << std::endl;
    }
  }
};
