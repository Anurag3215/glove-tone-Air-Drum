#pragma once

#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_core/juce_core.h>
#include "AudioConfig.h"
#include "MidiRouter.h"
#include "LoopRecorder.h"
#include "PauseController.h"
#include "AudioTrack.h"
#include <memory>
#include <array>
#include <fstream>

// Forward declaration for JSON parsing


/**
 * @file JuceAudioEngine.h
 * @brief Main JUCE audio engine
 * 
 * Coordinates all tracks, MIDI routing, loop recording, and audio output
 */

class JuceAudioEngine : public juce::AudioIODeviceCallback {
public:
    JuceAudioEngine();
    ~JuceAudioEngine();
    
    /**
     * Initialize from config.json
     * @param configPath Path to config.json
     * @return true if initialized successfully
     */
    bool initialize(const std::string& configPath);
    
    /**
     * Start audio device
     * @return true if started successfully
     */
    bool startAudio();
    
    // ========== Called from controllers (UDP thread) ==========
    
    /**
     * Send MIDI message
     * @param trackId Target track (1-7)
     * @param note MIDI note number
     * @param velocity MIDI velocity
     * @param isNoteOn true for note-on, false for note-off
     */
    void sendMIDI(int trackId, int note, int velocity, bool isNoteOn);
    
    // ========== Called from loop manager (UDP thread) ==========
    
    void armLoopStart();
    void armLoopEnd();
    void clearLoops();
    
    // ========== Called from loop manager (UDP thread) ==========
    
    void setPaused(bool paused);
    bool isPaused() const;
    void setTrackMute(int trackId, bool muted);
    void toggleVstEditor(int trackId);

    LoopRecorder* getLoopRecorder() const {
        return loopRecorder_.get();
    }
    
    // ========== JUCE audio callback (audio thread) ==========
    
    void audioDeviceAboutToStart(juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;
    void audioDeviceIOCallbackWithContext(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples,
        const juce::AudioIODeviceCallbackContext& context) override;

private:
    AudioConfig config_;
    std::array<std::unique_ptr<AudioTrack>, 7> tracks_;
    
    std::unique_ptr<MidiRouter> midiRouter_;
    std::unique_ptr<LoopRecorder> loopRecorder_;
    std::unique_ptr<PauseController> pauseController_;
    
    juce::AudioDeviceManager audioDeviceManager_;
    juce::AudioPluginFormatManager vstFormatManager_;
    
    bool initialized_;
    double currentSampleRate_;
    int currentBufferSize_;
    
    // Helper methods
    bool loadConfiguration(const std::string& configPath);
    bool setupTracks();
    bool setupAudioDevice();
    void openVSTEditors();
};

// Global pointer for controllers to access
extern JuceAudioEngine* g_audioEngine;
