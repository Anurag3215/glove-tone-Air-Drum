#pragma once

#include <atomic>

/**
 * @file PauseController.h
 * @brief Global pause/resume controller
 * 
 * Thread-safe pause state using atomic operations
 */

class PauseController {
public:
    PauseController() : paused_(false) {}
    
    /**
     * Set pause state (called from UDP thread)
     * @param paused true to pause, false to resume
     */
    void setPaused(bool paused) {
        paused_.store(paused, std::memory_order_release);
    }
    
    /**
     * Get pause state (called from audio thread)
     * @return true if paused
     */
    bool isPaused() const {
        return paused_.load(std::memory_order_relaxed);
    }

private:
    std::atomic<bool> paused_;
};
