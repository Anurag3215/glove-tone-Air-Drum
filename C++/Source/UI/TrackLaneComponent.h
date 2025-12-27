#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Audio/JuceAudioEngine.h"

// Custom LookAndFeel for FL Studio style buttons
class FLLookAndFeel : public juce::LookAndFeel_V4 {
public:
    FLLookAndFeel() {
        setColour(juce::TextButton::buttonColourId, juce::Colour(0xFF383838));
        setColour(juce::TextButton::buttonOnColourId, juce::Colour(0xFF505050));
        setColour(juce::TextButton::textColourOffId, juce::Colours::lightgrey);
        setColour(juce::TextButton::textColourOnId, juce::Colours::white);
    }

    void drawButtonBackground(juce::Graphics& g, juce::Button& button, 
                            const juce::Colour& backgroundColour,
                            bool shouldDrawButtonAsHighlighted, bool shouldDrawButtonAsDown) override {
        auto bounds = button.getLocalBounds().toFloat();
        auto cornerSize = 4.0f;

        auto baseColour = backgroundColour;
        if (shouldDrawButtonAsDown || shouldDrawButtonAsHighlighted)
            baseColour = baseColour.brighter(0.1f);

        g.setColour(baseColour);
        g.fillRoundedRectangle(bounds, cornerSize);
        
        g.setColour(juce::Colours::black.withAlpha(0.3f));
        g.drawRoundedRectangle(bounds, cornerSize, 1.0f);
    }
};

class TrackLaneComponent : public juce::Component, public juce::Button::Listener {
public:
    TrackLaneComponent(int trackId, const std::string& trackName, JuceAudioEngine* engine)
        : trackId_(trackId), name_(trackName), engine_(engine)
    {
        setLookAndFeel(&lookAndFeel_);

        // Mute Button
        muteButton_.setButtonText("M");
        muteButton_.setTooltip("Mute");
        muteButton_.setClickingTogglesState(true);
        muteButton_.setColour(juce::TextButton::buttonColourId, juce::Colour(0xFF2D2D2D));
        muteButton_.setColour(juce::TextButton::buttonOnColourId, juce::Colour(0xFFFF6C00));
        muteButton_.addListener(this);
        addAndMakeVisible(muteButton_);

        // Solo Button
        soloButton_.setButtonText("S");
        soloButton_.setTooltip("Solo");
        soloButton_.setClickingTogglesState(true);
        soloButton_.setColour(juce::TextButton::buttonColourId, juce::Colour(0xFF2D2D2D));
        soloButton_.setColour(juce::TextButton::buttonOnColourId, juce::Colour(0xFF00CCFF));
        soloButton_.addListener(this);
        addAndMakeVisible(soloButton_);
        
        // VST Button (Only for non-drum tracks usually, but we'll add to all for simplicity)
        vstButton_.setButtonText("V");
        vstButton_.setTooltip("Open VST Editor");
        vstButton_.setColour(juce::TextButton::buttonColourId, juce::Colour(0xFF2D2D2D));
        vstButton_.setColour(juce::TextButton::buttonOnColourId, juce::Colour(0xFFFFFFFF)); // White when open
        vstButton_.addListener(this);
        addAndMakeVisible(vstButton_);

        // Clear Button
        clearButton_.setButtonText("X");
        clearButton_.setTooltip("Clear Pattern");
        clearButton_.setColour(juce::TextButton::buttonColourId, juce::Colour(0xFF2D2D2D));
        clearButton_.addListener(this);
        addAndMakeVisible(clearButton_);

        // Label
        nameLabel_.setText(name_, juce::dontSendNotification);
        nameLabel_.setJustificationType(juce::Justification::centredLeft);
        nameLabel_.setColour(juce::Label::textColourId, juce::Colours::white);
        nameLabel_.setFont(juce::Font(14.0f, juce::Font::bold));
        addAndMakeVisible(nameLabel_);
    }

    ~TrackLaneComponent() {
        setLookAndFeel(nullptr);
    }

    void resized() override {
        auto area = getLocalBounds();
        
        // Controls area (Left side - Darker)
        // Increased width to fit 'V' button
        auto controls = area.removeFromLeft(190); 
        
        // Layout: [Name 70px] [M 24] [S 24] [V 24] [X 24]
        nameLabel_.setBounds(controls.removeFromLeft(70).reduced(5));
        
        int btnSize = 24;
        int gap = 4;
        int y = controls.getCentreY() - btnSize/2;
        int x = controls.getX() + 5;
        
        muteButton_.setBounds(x, y, btnSize, btnSize);
        x += btnSize + gap;
        
        soloButton_.setBounds(x, y, btnSize, btnSize);
        x += btnSize + gap;
        
        vstButton_.setBounds(x, y, btnSize, btnSize);
        x += btnSize + gap;
        
        clearButton_.setBounds(x, y, btnSize, btnSize);
    }

    void paint(juce::Graphics& g) override {
        auto area = getLocalBounds();
        auto controls = area.removeFromLeft(190); // Match resized()
        
        // 1. Draw Controls Background
        g.setColour(juce::Colour(0xFF262626));
        g.fillRect(controls);
        g.setColour(juce::Colour(0xFF111111));
        g.drawRect(controls.removeFromRight(1), 1);

        // 2. Draw Timeline Background
        g.setColour(juce::Colour(0xFF181818));
        g.fillRect(area);

        // 3. Draw Grid Lines
        g.setColour(juce::Colour(0xFF2D2D2D));
        for (int i = 1; i < 16; ++i) {
            float x = area.getX() + (area.getWidth() * (i / 16.0f));
            g.drawVerticalLine((int)x, (float)area.getY(), (float)area.getBottom());
        }

        if (engine_ && engine_->getLoopRecorder()) {
            auto* recorder = engine_->getLoopRecorder();
            const auto& messages = recorder->getTrackMessages(trackId_);
            int64_t globalLength = recorder->getGlobalLoopLength();

            // If recording first loop, assume 8 seconds (approx 4 bars at 120bpm) for visualization
            if (globalLength == 0) {
                globalLength = (int64_t)(44100 * 8); 
            }

            if (globalLength > 0 && !messages.empty()) {
                juce::Colour noteColor = getTrackColour(trackId_);
                
                float width = (float)area.getWidth();
                float height = (float)area.getHeight() - 4.0f;
                
                for (const auto& msg : messages) {
                    if (msg.message.isNoteOn()) {
                        float xPos = (float)msg.sampleOffset / (float)globalLength * width;
                        
                        // Wrap if it goes off screen (visual only)
                        while (xPos > width) xPos -= width;

                        juce::Rectangle<float> noteRect(area.getX() + xPos, area.getY() + 2, 6.0f, height);
                        
                        g.setColour(noteColor.withAlpha(0.6f));
                        g.fillRect(noteRect);
                        g.setColour(noteColor);
                        g.drawRect(noteRect, 1.0f);
                        g.setColour(juce::Colours::white.withAlpha(0.4f));
                        g.drawLine(noteRect.getX(), noteRect.getY(), noteRect.getRight(), noteRect.getY());
                    }
                }
            }
        }
        
        g.setColour(juce::Colour(0xFF111111));
        g.drawHorizontalLine(getHeight() - 1, 0.0f, (float)getWidth());
    }

    void buttonClicked(juce::Button* button) override {
        if (button == &muteButton_) {
            engine_->setTrackMute(trackId_, muteButton_.getToggleState());
        }
        else if (button == &clearButton_) {
            if (engine_->getLoopRecorder()) {
                engine_->getLoopRecorder()->clearTrack(trackId_);
                repaint();
            }
        }
        else if (button == &vstButton_) {
            engine_->toggleVstEditor(trackId_);
        }
    }

private:
    int trackId_;
    std::string name_;
    JuceAudioEngine* engine_;
    FLLookAndFeel lookAndFeel_;

    juce::TextButton muteButton_;
    juce::TextButton soloButton_;
    juce::TextButton vstButton_; // New button
    juce::TextButton clearButton_;
    juce::Label nameLabel_;

    juce::Colour getTrackColour(int id) {
        switch (id) {
            case 1: return juce::Colour(0xFFFF6C00); 
            case 2: return juce::Colour(0xFFFF6C00); 
            case 3: return juce::Colour(0xFF00CCFF); 
            case 4: return juce::Colour(0xFF9900FF); 
            case 5: return juce::Colour(0xFFFF0055); 
            case 6: return juce::Colour(0xFF00FF00); 
            case 7: return juce::Colour(0xFFFFFF00); 
            default: return juce::Colours::white;
        }
    }
};
