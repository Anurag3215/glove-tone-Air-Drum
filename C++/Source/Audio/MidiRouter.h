#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>
#include <atomic>
#include <array>

/**
 * @file MidiRouter.h
 * @brief Lock-free MIDI message queue for thread-safe communication
 * 
 * Producer: UDP receiver thread (controllers)
 * Consumer: JUCE audio thread
 */

struct TimestampedMidiMessage {
    juce::MidiMessage message;
    int trackId;           // 1-7
    int sampleOffset;      // Offset within audio buffer
    
    TimestampedMidiMessage() : trackId(0), sampleOffset(0) {}
    
    TimestampedMidiMessage(const juce::MidiMessage& msg, int track, int offset = 0)
        : message(msg), trackId(track), sampleOffset(offset) {}
};

/**
 * Lock-free SPSC (Single Producer Single Consumer) ring buffer
 */
class MidiRouter {
public:
    static constexpr int QUEUE_SIZE = 8192;  // Must be power of 2
    
    MidiRouter() : writeIndex_(0), readIndex_(0) {}
    
    /**
     * Post MIDI message (called from UDP thread)
     * @param trackId Target track (1-7)
     * @param note MIDI note number
     * @param velocity MIDI velocity
     * @param isNoteOn true for note-on, false for note-off
     * @param sampleOffset Sample offset within buffer
     * @return true if posted successfully
     */
    bool postMIDI(int trackId, int note, int velocity, bool isNoteOn, int sampleOffset = 0) {
        const auto currentWrite = writeIndex_.load(std::memory_order_relaxed);
        const auto nextWrite = (currentWrite + 1) % QUEUE_SIZE;
        
        // Check if queue is full
        if (nextWrite == readIndex_.load(std::memory_order_acquire)) {
            return false;  // Queue full - drop message
        }
        
        // Create MIDI message
        juce::MidiMessage msg;
        if (isNoteOn) {
            msg = juce::MidiMessage::noteOn(1, note, (juce::uint8)velocity);
        } else {
            msg = juce::MidiMessage::noteOff(1, note);
        }
        
        // Write to queue
        queue_[currentWrite] = TimestampedMidiMessage(msg, trackId, sampleOffset);
        
        // Publish write
        writeIndex_.store(nextWrite, std::memory_order_release);
        return true;
    }
    
    /**
     * Read all MIDI messages (called from audio thread)
     * @param trackBuffers Array of 7 MIDI buffers (one per track)
     */
    void readAllMIDI(std::array<juce::MidiBuffer, 7>& trackBuffers) {
        const auto currentRead = readIndex_.load(std::memory_order_relaxed);
        const auto currentWrite = writeIndex_.load(std::memory_order_acquire);
        
        // Read all available messages
        auto read = currentRead;
        while (read != currentWrite) {
            const auto& item = queue_[read];
            
            // Route to appropriate track buffer (trackId is 1-based, array is 0-based)
            if (item.trackId >= 1 && item.trackId <= 7) {
                trackBuffers[item.trackId - 1].addEvent(item.message, item.sampleOffset);
            }
            
            read = (read + 1) % QUEUE_SIZE;
        }
        
        // Publish read
        readIndex_.store(read, std::memory_order_release);
    }
    
    /**
     * Get number of pending messages (for diagnostics)
     */
    int getNumPending() const {
        const auto currentRead = readIndex_.load(std::memory_order_relaxed);
        const auto currentWrite = writeIndex_.load(std::memory_order_relaxed);
        
        if (currentWrite >= currentRead) {
            return currentWrite - currentRead;
        } else {
            return QUEUE_SIZE - currentRead + currentWrite;
        }
    }

private:
    std::array<TimestampedMidiMessage, QUEUE_SIZE> queue_;
    std::atomic<int> writeIndex_;  // Producer writes here
    std::atomic<int> readIndex_;   // Consumer reads from here
};
