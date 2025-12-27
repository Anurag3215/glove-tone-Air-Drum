#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>
#include <map>
#include <string>

/**
 * @file SamplePlayer.h
 * @brief Polyphonic drum sample playback
 */

class SamplePlayer {
public:
    static constexpr int MAX_VOICES = 32;  // Maximum simultaneous samples
    
    SamplePlayer() {
        formatManager_.registerBasicFormats();
        
        // Add polyphonic voices
        for (int i = 0; i < MAX_VOICES; ++i) {
            synth_.addVoice(new juce::SamplerVoice());
        }
    }
    
    /**
     * Load a drum sample
     * @param flexMask Flex sensor combination (0-31)
     * @param wavPath Path to WAV file
     * @return true if loaded successfully
     */
    bool loadSample(int flexMask, const std::string& wavPath) {
        juce::File sampleFile(wavPath);
        int midiNote = flexMaskToStandardNote(flexMask);
        if (!sampleFile.existsAsFile()) {
            std::cout << "⚠️ Sample not found: " << wavPath << std::endl;
            return false;
        }
        
        std::unique_ptr<juce::AudioFormatReader> reader(formatManager_.createReaderFor(sampleFile));
        
        if (reader == nullptr) {
            std::cout << "⚠️ Failed to read sample: " << wavPath << std::endl;
            return false;
        }
        
        // Create sampler sound
        juce::BigInteger allNotes;
        allNotes.setBit(midiNote, true);  // Trigger on all MIDI notes
        
        auto* sound = new juce::SamplerSound(
            juce::String(flexMask),  // Name
            *reader,                 // Audio data
            allNotes,                // MIDI notes that trigger this
            midiNote,                // Root note (use flexMask as note number)
            0.01,                    // Attack time
            0.1,                     // Release time
            10.0                     // Max sample length (seconds)
        );
        
        synth_.addSound(sound);
        sampleMap_[flexMask] = sound;
        
        std::cout << "✅ Loaded sample: flexMask=" << flexMask << " → " << wavPath << std::endl;
        return true;
    }
    
    /**
     * Prepare for playback
     * @param sampleRate Sample rate
     * @param blockSize Maximum block size
     */
    void prepareToPlay(double sampleRate, int blockSize) {
        synth_.setCurrentPlaybackSampleRate(sampleRate);
    }
    
    /**
     * Process audio block
     * @param buffer Audio buffer to render into
     * @param midiMessages MIDI messages (note = flexMask)
     */
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) {
        synth_.renderNextBlock(buffer, midiMessages, 0, buffer.getNumSamples());
    }
    
    /**
     * Stop all playing samples
     */
    void allNotesOff() {
        synth_.allNotesOff(1, true);
    }

private:
    juce::AudioFormatManager formatManager_;
    juce::Synthesiser synth_;
    std::map<int, juce::SamplerSound*> sampleMap_;

    int flexMaskToStandardNote(int flexMask) {
        switch (flexMask) {
            case 31:  return 36;  // Kick
            case 30:  return 38;  // Snare
            case 28:  return 48;  // Tom 1
            case 24:  return 50;  // Tom 2
            case 16:  return 42;  // Hi-hat
            case 0:   return 49;  // Crash
            default:  return flexMask;  // Fallback
        }
    }
};
