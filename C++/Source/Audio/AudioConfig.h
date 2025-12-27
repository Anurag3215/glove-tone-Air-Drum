#pragma once

#include <string>
#include <vector>
#include <map>

/**
 * @file AudioConfig.h
 * @brief Configuration structures for JUCE audio system
 */

struct TrackConfig {
    int id;                     // Track ID (1-7)
    std::string name;           // Track name
    std::string type;           // "vst", "samples", "mp3"
    std::string vstPath;        // Path to VST plugin
    std::string presetPath;     // Path to VST preset
    std::string mp3Path;        // Path to MP3 file
    bool openGui;
    std::map<int, std::string> drumSamples;  // Per-track drum samples (flexMask → WAV path)              
    
    TrackConfig() : id(0), openGui(false) {}
};

struct AudioConfig {
    int sampleRate;             // Sample rate (44100)
    int bufferSize;             // Buffer size (128)
    std::string asioDevice;     // ASIO device name (empty = auto)
    
    std::vector<TrackConfig> tracks;
      
    
    AudioConfig() : sampleRate(44100), bufferSize(128) {}
};
