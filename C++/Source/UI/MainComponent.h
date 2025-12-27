#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Audio/JuceAudioEngine.h"
#include "TrackLaneComponent.h"

class MainComponent : public juce::Component, public juce::Timer, public juce::Button::Listener {
public:
    MainComponent(JuceAudioEngine* engine) : engine_(engine) {
        // Create Track Lanes
        addTrack(1, "Drums");
        addTrack(2, "Drums Z");
        addTrack(3, "Keys");
        addTrack(4, "Chords");
        addTrack(5, "Violin");
        addTrack(6, "Guitar");
        addTrack(7, "MP3");

        // Transport Controls
        playPauseButton_.setButtonText("PLAY");
        playPauseButton_.setColour(juce::TextButton::buttonColourId, juce::Colour(0xFF2D2D2D));
        playPauseButton_.setColour(juce::TextButton::buttonOnColourId, juce::Colour(0xFF00FF00)); // Green when playing
        playPauseButton_.setClickingTogglesState(true);
        playPauseButton_.addListener(this);
        addAndMakeVisible(playPauseButton_);

        recordButton_.setButtonText("REC");
        recordButton_.setColour(juce::TextButton::buttonColourId, juce::Colour(0xFF2D2D2D));
        recordButton_.setColour(juce::TextButton::buttonOnColourId, juce::Colour(0xFFFF0000)); // Red when recording
        recordButton_.setClickingTogglesState(true);
        recordButton_.addListener(this);
        addAndMakeVisible(recordButton_);

        clearAllButton_.setButtonText("CLEAR ALL");
        clearAllButton_.setColour(juce::TextButton::buttonColourId, juce::Colour(0xFF2D2D2D));
        clearAllButton_.addListener(this);
        addAndMakeVisible(clearAllButton_);

        // Start UI update timer (60 FPS)
        startTimerHz(60);
    }

    void resized() override {
        auto area = getLocalBounds();
        
        // Header / Transport (Top Bar)
        auto header = area.removeFromTop(60);
        
        // Transport Bar Background
        // (Handled in paint)
        
        int btnWidth = 80;
        int btnHeight = 30;
        int gap = 10;
        int startX = 20;
        int startY = 15;

        playPauseButton_.setBounds(startX, startY, btnWidth, btnHeight);
        recordButton_.setBounds(playPauseButton_.getRight() + gap, startY, btnWidth, btnHeight);
        
        clearAllButton_.setBounds(getWidth() - btnWidth - 20, startY, btnWidth, btnHeight);

        // Tracks
        int trackHeight = area.getHeight() / 7;
        for (auto* lane : lanes_) {
            lane->setBounds(area.removeFromTop(trackHeight));
        }
    }

    void paint(juce::Graphics& g) override {
        // Main Background
        g.fillAll(juce::Colour(0xFF1E1E1E)); 

        // Header Background
        g.setColour(juce::Colour(0xFF262626));
        g.fillRect(0, 0, getWidth(), 60);
        g.setColour(juce::Colour(0xFF111111));
        g.drawHorizontalLine(59, 0.0f, (float)getWidth());

    }

    void paintOverChildren(juce::Graphics& g) override {
        // Draw Playhead (Overlay)
        // Draw Playhead (Overlay)
        if (engine_ && engine_->getLoopRecorder()) {
            auto* recorder = engine_->getLoopRecorder();
            int64_t currentSample = recorder->getCurrentLoopSample();
            int64_t totalSamples = recorder->getGlobalLoopLength();
            
            // Handle initial recording (when totalSamples is 0)
            bool isRecordingFirstLoop = (totalSamples == 0 && recorder->getLoopState() == 2); // 2 = RECORDING
            
            if (isRecordingFirstLoop) {
                // Estimate position based on time since recording started
                // We use a static start time for simplicity in this visual-only fix
                static int64_t estimatedSample = 0;
                estimatedSample += 44100 / 60; // Add samples per frame (approx)
                
                // Reset if we stop recording
                if (recorder->getLoopState() != 2) estimatedSample = 0;

                totalSamples = (int64_t)(44100 * 8); // Assume 8 seconds scale
                currentSample = estimatedSample % totalSamples;
            }

            if (totalSamples > 0) {
                float controlsWidth = 190.0f; // Matched to TrackLaneComponent resized()
                float timelineWidth = (float)getWidth() - controlsWidth;
                
                float progress = (float)currentSample / (float)totalSamples;
                float xPos = controlsWidth + (progress * timelineWidth);

                // Draw Playhead Line (Orange)
                g.setColour(juce::Colour(0xFFFF6C00));
                g.drawLine(xPos, 60.0f, xPos, (float)getHeight(), 2.0f);
                
                // Draw Playhead Triangle at top
                juce::Path triangle;
                triangle.addTriangle(xPos - 6, 60, xPos + 6, 60, xPos, 70);
                g.setColour(juce::Colour(0xFFFF6C00));
                g.fillPath(triangle);
                
                // Draw "REC" indicator if recording first loop
                if (isRecordingFirstLoop) {
                    g.setColour(juce::Colours::red);
                    g.drawText("REC (First Loop)", (int)xPos + 10, 65, 100, 20, juce::Justification::left);
                }
            }
        }
    }

    void timerCallback() override {
        // Sync button states with engine state
        if (engine_) {
            bool isPaused = engine_->isPaused();
            playPauseButton_.setToggleState(!isPaused, juce::dontSendNotification);
            
            if (engine_->getLoopRecorder()) {
                int state = engine_->getLoopRecorder()->getLoopState();
                // 2 = RECORDING, 1 = ARMED_START
                bool isRecording = (state == 2 || state == 1);
                recordButton_.setToggleState(isRecording, juce::dontSendNotification);
            }
        }
        repaint();
    }

    void buttonClicked(juce::Button* button) override {
        if (button == &playPauseButton_) {
            bool isPaused = engine_->isPaused();
            engine_->setPaused(!isPaused);
        }
        else if (button == &recordButton_) {
            if (engine_->getLoopRecorder()) {
                int state = engine_->getLoopRecorder()->getLoopState();
                if (state == 2 || state == 1) { // RECORDING or ARMED
                    engine_->armLoopEnd(); 
                } else {
                    engine_->armLoopStart(); 
                }
            }
        }
        else if (button == &clearAllButton_) {
            if (engine_->getLoopRecorder()) {
                engine_->getLoopRecorder()->clearAllLoops();
            }
        }
    }

private:
    JuceAudioEngine* engine_;
    juce::OwnedArray<TrackLaneComponent> lanes_;

    juce::TextButton playPauseButton_;
    juce::TextButton recordButton_;
    juce::TextButton clearAllButton_;

    void addTrack(int id, const std::string& name) {
        auto* lane = new TrackLaneComponent(id, name, engine_);
        lanes_.add(lane);
        addAndMakeVisible(lane);
    }
};
