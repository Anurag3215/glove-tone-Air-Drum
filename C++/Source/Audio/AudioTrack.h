#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_core/juce_core.h>
#include "AudioConfig.h"
#include "SamplePlayer.h"
#include <memory>
#include <string>

/**
 * @file AudioTrack.h
 * @brief Individual track (VST, Samples, or MP3)
 */

enum class TrackType {
    VST,
    SAMPLES,
    MP3
};

class VstWindow : public juce::DocumentWindow {
public:
    VstWindow(const juce::String& name, juce::Colour bg, int buttons)
        : DocumentWindow(name, bg, buttons) {}
    
    void closeButtonPressed() override {
        delete this; // This makes the window delete itself!
    }
};

class AudioTrack {
public:
    AudioTrack(int trackId, const std::string& name, TrackType type)
        : id_(trackId)
        , name_(name)
        , type_(type)
        , volume_(1.0f)
        , muted_(false)
    {
        if (type == TrackType::SAMPLES) {
            samplePlayer_ = std::make_unique<SamplePlayer>();
        }
    }
    
    ~AudioTrack() {
        if (vstPlugin_) {
            vstPlugin_->releaseResources();
        }
    }
    
    /**
     * Load VST plugin
     * @param vstPath Path to VST DLL/VST3
     * @param formatManager VST format manager
     * @return true if loaded successfully
     */
    bool loadVST(const std::string& vstPath, juce::AudioPluginFormatManager& formatManager) {
        if (type_ != TrackType::VST) {
            return false;
        }
        
        juce::File vstFile(vstPath);
        if (!vstFile.existsAsFile()) {
            std::cout << "❌ VST not found: " << vstPath << std::endl;
            return false;
        }
        
        juce::OwnedArray<juce::PluginDescription> descriptions;
        juce::KnownPluginList pluginList;
        
        // Scan VST
        for (int i = 0; i < formatManager.getNumFormats(); ++i) {
            auto* format = formatManager.getFormat(i);
            pluginList.scanAndAddFile(vstFile.getFullPathName(), false, descriptions, *format);
        }
        
        if (descriptions.isEmpty()) {
            std::cout << "❌ No VST found in: " << vstPath << std::endl;
            return false;
        }
        
        // Load plugin
        juce::String errorMessage;
        vstPlugin_ = formatManager.createPluginInstance(*descriptions[0], 44100.0, 512, errorMessage);
        
        if (vstPlugin_ == nullptr) {
            std::cout << "❌ Failed to load VST: " << errorMessage << std::endl;
            return false;
        }
        
        std::cout << "✅ Loaded VST: " << vstPlugin_->getName() << " (Track " << id_ << ")" << std::endl;
        return true;
    }
    
    /**
     * Load VST preset
     * @param presetPath Path to preset file
     * @return true if loaded successfully
     */
    bool loadPreset(const std::string& presetPath) {
        if (!vstPlugin_ || presetPath.empty()) {
            return false;
        }
        
        juce::File presetFile(presetPath);
        if (!presetFile.existsAsFile()) {
            std::cout << "⚠️ Preset not found: " << presetPath << std::endl;
            return false;
        }
        
        juce::MemoryBlock presetData;
        if (!presetFile.loadFileAsData(presetData)) {
            std::cout << "⚠️ Failed to read preset: " << presetPath << std::endl;
            return false;
        }
        
        vstPlugin_->setStateInformation(presetData.getData(), static_cast<int>(presetData.getSize()));
        
        std::cout << "✅ Loaded preset: " << presetFile.getFileName() << " (Track " << id_ << ")" << std::endl;
        return true;
    }
    
    /**
     * Load drum samples
     * @param drumSamples Map of flexMask → WAV path
     * @return true if loaded successfully
     */
    bool loadDrumSamples(const std::map<int, std::string>& drumSamples) {
        if (type_ != TrackType::SAMPLES || !samplePlayer_) {
            return false;
        }
        
        for (const auto& [flexMask, wavPath] : drumSamples) {
            samplePlayer_->loadSample(flexMask, wavPath);
        }
        
        return true;
    }
    
    /**
     * Load MP3 file
     * @param mp3Path Path to MP3/audio file
     * @return true if loaded successfully
     */
    bool loadMP3(const std::string& mp3Path) {
        if (type_ != TrackType::MP3) {
            return false;
        }
        
        juce::File audioFile(mp3Path);
        if (!audioFile.existsAsFile()) {
            std::cout << "❌ MP3 not found: " << mp3Path << std::endl;
            return false;
        }
        
        formatManager_.registerBasicFormats();
        auto* reader = formatManager_.createReaderFor(audioFile);
        
        if (reader == nullptr) {
            std::cout << "❌ Failed to read MP3: " << mp3Path << std::endl;
            return false;
        }
        
        mp3Reader_.reset(new juce::AudioFormatReaderSource(reader, true));
        mp3Reader_->setLooping(false);  // We handle looping manually (FL Studio style)
        mp3Reader_->setNextReadPosition(0); // Reset to start
        muted_ = true;
        std::cout << "✅ Loaded MP3: " << audioFile.getFileName() << " (Track " << id_ << ")" << std::endl;
        return true;
    }
    
    /**
     * Prepare for playback
     * @param sampleRate Sample rate
     * @param blockSize Maximum block size
     */
    void rewind() {
        if (type_ == TrackType::MP3 && mp3Reader_) {
            mp3Reader_->setNextReadPosition(0);
        }
    }
    void prepareToPlay(double sampleRate, int blockSize) {
        if (vstPlugin_) {
            vstPlugin_->prepareToPlay(sampleRate, blockSize);
            vstPlugin_->setPlayConfigDetails(0, 2, sampleRate, blockSize);
        }
        
        if (samplePlayer_) {
            samplePlayer_->prepareToPlay(sampleRate, blockSize);
        }
        
        if (mp3Reader_) {
            mp3Reader_->prepareToPlay(blockSize, sampleRate);
        }
    }
    
    /**
     * Process audio block
     * @param buffer Audio buffer (stereo)
     * @param midiMessages MIDI messages for this track
     */
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) {
        if (type_ == TrackType::MP3 && mp3Reader_) {
            for (const auto metadata : midiMessages) {
                auto msg = metadata.getMessage();
                if (msg.isNoteOn()) {
                    
                    muted_ = false;
                    mp3Reader_->setNextReadPosition(0); 
                } else if (msg.isNoteOff()) {
                    muted_ = true; 
                }
            }
        }
        
        
        if (muted_) {
            buffer.clear();
            return;
        }
        
        // Process based on track type
        if (type_ == TrackType::VST && vstPlugin_) {
            vstPlugin_->processBlock(buffer, midiMessages);
        } else if (type_ == TrackType::SAMPLES && samplePlayer_) {
            samplePlayer_->processBlock(buffer, midiMessages);
        } else if (type_ == TrackType::MP3 && mp3Reader_) {

            juce::AudioSourceChannelInfo info;
            info.buffer = &buffer;
            info.startSample = 0;
            info.numSamples = buffer.getNumSamples();
            mp3Reader_->getNextAudioBlock(info);
        }
        
        // Apply volume
        if (volume_ != 1.0f) {
            buffer.applyGain(volume_);
        }
    }
    
    /**
     * Open VST editor window
     */
    void openPluginEditor() {
        if (vstPlugin_ && vstPlugin_->hasEditor()) {
            auto* editor = vstPlugin_->createEditorIfNeeded();
            if (editor) {
                // Create window for editor
                auto* window = new juce::DocumentWindow(
                    vstPlugin_->getName(),
                    juce::Colours::black,
                    juce::DocumentWindow::closeButton
                );
                
                window->setContentNonOwned(editor, true);
                window->setVisible(true);
                window->setResizable(false, false);
                
                std::cout << "🎛️ Opened VST GUI: " << vstPlugin_->getName() << std::endl;
            }
        }
    }
    
    // Getters
    int getId() const { return id_; }
    std::string getName() const { return name_; }
    TrackType getType() const { return type_; }
    
    void setVolume(float newVolume) { volume_ = juce::jlimit(0.0f, 1.0f, newVolume); }
    float getVolume() const { return volume_; }
    
    void setMuted(bool shouldMute) { muted_ = shouldMute; }
    bool isMuted() const { return muted_; }
    void toggleEditor() {
        if (vstPlugin_) {
            auto* editor = vstPlugin_->getActiveEditor();
            if (editor) {
                // If open, close it (delete it)
                delete editor; 
            } else {
                // Create and show
                editor = vstPlugin_->createEditorIfNeeded();
                if (editor) {
                    // We need a window to hold it
                    auto* window = new VstWindow(name_, juce::Colours::black, juce::DocumentWindow::allButtons);
                    window->setContentOwned(editor, true);
                    window->setResizable(true, true);
                    window->centreWithSize(editor->getWidth(), editor->getHeight());
                    window->setVisible(true);
                    // Make window delete itself when closed
                    
                }
            }
        }
    }

private:
    int id_;
    std::string name_;
    TrackType type_;
    
    float volume_;
    bool muted_;
    
    // Type-specific components
    std::unique_ptr<juce::AudioPluginInstance> vstPlugin_;
    std::unique_ptr<SamplePlayer> samplePlayer_;
    std::unique_ptr<juce::AudioFormatReaderSource> mp3Reader_;
    juce::AudioFormatManager formatManager_;
};
