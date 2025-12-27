#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "MainComponent.h"

class GloveToneWindow : public juce::DocumentWindow {
public:
    GloveToneWindow(const juce::String& name, JuceAudioEngine* engine)
        : DocumentWindow(name,
                         juce::Desktop::getInstance().getDefaultLookAndFeel()
                                                     .findColour(juce::ResizableWindow::backgroundColourId),
                         DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar(true);
        setContentOwned(new MainComponent(engine), true);

        setResizable(true, true);
        centreWithSize(1024, 768);
        setVisible(true);
    }

    void closeButtonPressed() override {
        // Just hide, don't kill app (app is killed by console Ctrl+C)
        // Or we could request quit
        juce::JUCEApplication::getInstance()->systemRequestedQuit();
    }
};
