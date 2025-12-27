#pragma once

#include <iostream>
#include <string>

// Global debug flag - set to false to hide debug messages
extern bool g_debug_mode;

// Logging macros
#define LOG_INFO(msg) std::cout << msg << std::endl
#define LOG_DEBUG(msg) if (g_debug_mode) { std::cout << "[DEBUG] " << msg << std::endl; }

// Helper for easy toggling
inline void set_debug_mode(bool enabled) {
    g_debug_mode = enabled;
    if (enabled) {
        std::cout << "🔧 DEBUG MODE: ON" << std::endl;
    } else {
        std::cout << "🔧 DEBUG MODE: OFF" << std::endl;
    }
}
