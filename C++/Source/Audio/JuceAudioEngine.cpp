#include <nlohmann/json.hpp>
#include "JuceAudioEngine.h"
#include <future>
#include <vector>

#include <iostream>
#include <fstream>



// Global pointer definition
JuceAudioEngine* g_audioEngine = nullptr;

JuceAudioEngine::JuceAudioEngine()
    : initialized_(false)
    , currentSampleRate_(44100.0)
    , currentBufferSize_(128)
{
    // Initialize components
    midiRouter_ = std::make_unique<MidiRouter>();
    loopRecorder_ = std::make_unique<LoopRecorder>();
    pauseController_ = std::make_unique<PauseController>();
    
    // Register VST formats
    vstFormatManager_.addFormat(new juce::VST3PluginFormat());
    
    
    std::cout << "✅ JUCE Audio Engine: Created" << std::endl;
}

JuceAudioEngine::~JuceAudioEngine() {
    audioDeviceManager_.closeAudioDevice();
    std::cout << "✅ JUCE Audio Engine: Destroyed" << std::endl;
}

bool JuceAudioEngine::initialize(const std::string& configPath) {
    std::cout << "\n=== JUCE Audio Engine: Initializing ===" << std::endl;
    
    if (!loadConfiguration(configPath)) {
        return false;
    }
    
    if (!setupTracks()) {
        return false;
    }
    
    initialized_ = true;
    std::cout << "✅ JUCE Audio Engine: Initialized" << std::endl;
    return true;
}

bool JuceAudioEngine::loadConfiguration(const std::string& configPath) {
    std::cout << "📄 Loading configuration from: " << configPath << std::endl;
    
    std::ifstream configFile(configPath);
    if (!configFile.is_open()) {
        std::cout << "❌ Failed to open config file: " << configPath << std::endl;
        return false;
    }
    
    try {
        nlohmann::json j;
        configFile >> j;
        
        // Parse audio settings
        if (j.contains("audio")) {
            auto audio = j["audio"];
            config_.sampleRate = audio.value("sample_rate", 44100);
            config_.bufferSize = audio.value("buffer_size", 128);
            config_.asioDevice = audio.value("asio_device", "");
        }
        
        // Parse tracks
        if (j.contains("tracks")) {
            for (const auto& trackJson : j["tracks"]) {
                TrackConfig track;
                track.id = trackJson.value("id", 0);
                track.name = trackJson.value("name", "");
                track.type = trackJson.value("type", "");
                track.vstPath = trackJson.value("vst_path", "");
                track.presetPath = trackJson.value("preset_path", "");
                track.mp3Path = trackJson.value("mp3_file", "");
                track.openGui = trackJson.value("open_gui", false);

                if (trackJson.contains("samples")) {
                    for (const auto& [key, value] : trackJson["samples"].items()) {
                        int flexMask = std::stoi(key);
                        std::string wavPath = value.get<std::string>();
                        track.drumSamples[flexMask] = wavPath;
                    }
                }
                
                config_.tracks.push_back(track);
            }
        }
        
        
        
        std::cout << "✅ Configuration loaded:" << std::endl;
        std::cout << "   Sample Rate: " << config_.sampleRate << " Hz" << std::endl;
        std::cout << "   Buffer Size: " << config_.bufferSize << " samples" << std::endl;
        std::cout << "   Tracks: " << config_.tracks.size() << std::endl;
        
        
        return true;
        
    } catch (const std::exception& e) {
        std::cout << "❌ Failed to parse config: " << e.what() << std::endl;
        return false;
    }
}

bool JuceAudioEngine::setupTracks() {
    std::cout << "\n🎵 Setting up tracks..." << std::endl;
    
    // Remove std::async and loadingTasks vector
    // Load tracks sequentially to ensure VSTs load on the main thread
    
    for (const auto& trackConfig : config_.tracks) {
        int trackIndex = trackConfig.id - 1;  // Convert to 0-based
        
        if (trackIndex < 0 || trackIndex >= 7) {
            std::cout << "⚠️ Invalid track ID: " << trackConfig.id << std::endl;
            continue;
        }
        
        // Determine track type
        TrackType type;
        if (trackConfig.type == "vst") {
            type = TrackType::VST;
        } else if (trackConfig.type == "samples") {
            type = TrackType::SAMPLES;
        } else if (trackConfig.type == "mp3") {
            type = TrackType::MP3;
        } else {
            std::cout << "⚠️ Unknown track type: " << trackConfig.type << std::endl;
            continue;
        }
        
        auto newTrack = std::make_unique<AudioTrack>(trackConfig.id, trackConfig.name, type);
        
        // Load track-specific content
        bool success = true;
        
        if (type == TrackType::VST) {
            // VSTs MUST be loaded on the main thread
            if (!newTrack->loadVST(trackConfig.vstPath, vstFormatManager_)) {
                std::cout << "❌ Failed to load VST for track " << trackConfig.id << std::endl;
                success = false; 
                // You can decide to return false here if you want to stop on error
                // return false; 
            }
            
            if (success && !trackConfig.presetPath.empty()) {
                newTrack->loadPreset(trackConfig.presetPath);
            }
            
        } else if (type == TrackType::SAMPLES) {
            newTrack->loadDrumSamples(trackConfig.drumSamples);
            
        } else if (type == TrackType::MP3) {
            if (!trackConfig.mp3Path.empty()) {
                newTrack->loadMP3(trackConfig.mp3Path);
            }
        }
        
        if (success) {
            tracks_[trackIndex] = std::move(newTrack);
        }
    }
    
    std::cout << "✅ All tracks set up" << std::endl;
    return true;
}

bool JuceAudioEngine::startAudio() {
    std::cout << "\n🔊 Starting audio device..." << std::endl;
    
    if (!setupAudioDevice()) {
        return false;
    }
    
    // Set this as the audio callback
    audioDeviceManager_.addAudioCallback(this);
    
    // Open VST editor windows
    //openVSTEditors();
    
    std::cout << "✅ Audio device started" << std::endl;
    std::cout << "=== JUCE Audio Engine: READY ===\n" << std::endl;
    
    return true;
}

bool JuceAudioEngine::setupAudioDevice() {
    // Try to use ASIO device
    auto* asioType = audioDeviceManager_.getAvailableDeviceTypes()[0];  // ASIO is usually first
    
    if (asioType) {
        audioDeviceManager_.setCurrentAudioDeviceType(asioType->getTypeName(), true);
        
        // Get available devices
        auto deviceNames = asioType->getDeviceNames();
        
        if (!deviceNames.isEmpty()) {
            juce::String deviceToUse;
            
            if (!config_.asioDevice.empty()) {
                // Use specified device
                deviceToUse = config_.asioDevice;
            } else {
                // Use first available device
                deviceToUse = deviceNames[0];
            }
            
            juce::AudioDeviceManager::AudioDeviceSetup setup;
            setup.outputDeviceName = deviceToUse;
            setup.sampleRate = config_.sampleRate;
            setup.bufferSize = config_.bufferSize;
            setup.outputChannels.setRange(0, 2, true);  // Stereo output
            
            juce::String error = audioDeviceManager_.initialise(
                0,      // No input channels
                2,      // 2 output channels (stereo)
                nullptr,
                true,
                deviceToUse,
                &setup
            );
            
            if (error.isEmpty()) {
                std::cout << "✅ ASIO Device: " << deviceToUse << std::endl;
                std::cout << "   Sample Rate: " << config_.sampleRate << " Hz" << std::endl;
                std::cout << "   Buffer Size: " << config_.bufferSize << " samples" << std::endl;
                return true;
            } else {
                std::cout << "❌ Failed to initialize ASIO: " << error << std::endl;
            }
        }
    }
    
    // Fallback to default device
    std::cout << "⚠️ ASIO not available, using default device" << std::endl;
    juce::String error = audioDeviceManager_.initialiseWithDefaultDevices(0, 2);
    
    if (error.isEmpty()) {
        std::cout << "✅ Default audio device initialized" << std::endl;
        return true;
    } else {
        std::cout << "❌ Failed to initialize audio: " << error << std::endl;
        return false;
    }
}

void JuceAudioEngine::openVSTEditors() {
    std::cout << "\n🎛️ Opening VST editor windows..." << std::endl;
    
    for (const auto& trackConfig : config_.tracks) {
        if (trackConfig.openGui && trackConfig.type == "vst") {
            int trackIndex = trackConfig.id - 1;
            if (tracks_[trackIndex]) {
                tracks_[trackIndex]->openPluginEditor();
            }
        }
    }
}

// ========== Public API (called from UDP thread) ==========

void JuceAudioEngine::sendMIDI(int trackId, int note, int velocity, bool isNoteOn) {
    if (!initialized_) return;
    
    midiRouter_->postMIDI(trackId, note, velocity, isNoteOn);
}

void JuceAudioEngine::armLoopStart() {
    if (loopRecorder_) {
        loopRecorder_->armLoopStart();
    }
}

void JuceAudioEngine::armLoopEnd() {
    if (loopRecorder_) {
        loopRecorder_->armLoopEnd();
    }
}

void JuceAudioEngine::clearLoops() {
    if (loopRecorder_) {
        loopRecorder_->clearAllLoops();
    }
}

void JuceAudioEngine::setPaused(bool paused) {
    if (pauseController_) {
        pauseController_->setPaused(paused);
    }
}

bool JuceAudioEngine::isPaused() const {
    return pauseController_ ? pauseController_->isPaused() : false;
}

void JuceAudioEngine::setTrackMute(int trackId, bool muted) {
    int trackIndex = trackId - 1;
    if (trackIndex >= 0 && trackIndex < 7 && tracks_[trackIndex]) {
        tracks_[trackIndex]->setMuted(muted);
    }
}

void JuceAudioEngine::toggleVstEditor(int trackId) {
    int trackIndex = trackId - 1;
    if (trackIndex >= 0 && trackIndex < 7 && tracks_[trackIndex]) {
        auto* track = tracks_[trackIndex].get();
        
        // We need to access the plugin instance from the track
        // This assumes AudioTrack has a method to get the plugin or show editor
        // Since AudioTrack encapsulates the plugin, we should add a method there.
        // For now, let's assume we add showEditor() to AudioTrack.
        
        track->toggleEditor();
    }
}

// ========== JUCE Audio Callback (audio thread) ==========

void JuceAudioEngine::audioDeviceAboutToStart(juce::AudioIODevice* device) {
    currentSampleRate_ = device->getCurrentSampleRate();
    currentBufferSize_ = device->getCurrentBufferSizeSamples();
    
    std::cout << "🎵 Audio callback starting:" << std::endl;
    std::cout << "   Sample Rate: " << currentSampleRate_ << " Hz" << std::endl;
    std::cout << "   Buffer Size: " << currentBufferSize_ << " samples" << std::endl;
    
    // Prepare all tracks
    for (auto& track : tracks_) {
        if (track) {
            track->prepareToPlay(currentSampleRate_, currentBufferSize_);
        }
    }
}

void JuceAudioEngine::audioDeviceStopped() {
    std::cout << "🎵 Audio callback stopped" << std::endl;
}

void JuceAudioEngine::audioDeviceIOCallbackWithContext(
    const float* const* inputChannelData,
    int numInputChannels,
    float* const* outputChannelData,
    int numOutputChannels,
    int numSamples,
    const juce::AudioIODeviceCallbackContext& context)
{
    // Check pause state (atomic read - fast!)
    if (pauseController_->isPaused()) {
        // Mute all output
        for (int ch = 0; ch < numOutputChannels; ++ch) {
            juce::FloatVectorOperations::clear(outputChannelData[ch], numSamples);
        }
        return;
    }
    
    // Read MIDI from lock-free queue
    std::array<juce::MidiBuffer, 7> trackMidiBuffers;
    midiRouter_->readAllMIDI(trackMidiBuffers);
    
    // Process loop recording/playback
    std::array<juce::MidiBuffer, 7> loopedMidiBuffers;
    for (int i = 0; i < 7; ++i) {
        if (loopRecorder_) {
            loopRecorder_->processMIDI(i + 1, trackMidiBuffers[i], loopedMidiBuffers[i], numSamples);
        } else {
            loopedMidiBuffers[i] = trackMidiBuffers[i];
        }
    }
    
    // Clear output buffer
    for (int ch = 0; ch < numOutputChannels; ++ch) {
        juce::FloatVectorOperations::clear(outputChannelData[ch], numSamples);
    }
    
    // Process each track and mix
    juce::AudioBuffer<float> trackBuffer(2, numSamples);
    
    for (int i = 0; i < 7; ++i) {
        if (tracks_[i]) {
            trackBuffer.clear();
            tracks_[i]->processBlock(trackBuffer, loopedMidiBuffers[i]);
            
            // Mix into output
            for (int ch = 0; ch < std::min(2, numOutputChannels); ++ch) {
                juce::FloatVectorOperations::add(
                    outputChannelData[ch],
                    trackBuffer.getReadPointer(ch),
                    numSamples
                );
            }
        }
    }
    if (loopRecorder_) {
        if (loopRecorder_->advanceTime(numSamples)) {
            // If loop restarted, rewind AND MUTE all MP3 tracks
            for (auto& track : tracks_) {
                if (track) {
                    track->rewind();
                    if (track->getType() == TrackType::MP3) track->setMuted(true); // Wait for trigger
                }
            }
        }
    }
}
