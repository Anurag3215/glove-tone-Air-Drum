#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <deque>
#include <vector>
#include <memory>
#include <thread>
#include <mutex>
#include "SensorSample.h"
#ifdef _WIN32
#include <ws2tcpip.h>
#include <windows.h>
#include <juce_events/juce_events.h>

#pragma comment(lib, "ws2_32.lib")
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <poll.h>
#include <sys/select.h>
#include <termios.h>
#include <time.h>
#endif


// Configuration constants
constexpr int UDP_PORT = 8888;
constexpr double UDP_TIMEOUT = 0.001;  // 1ms timeout
constexpr int UDP_BUFFER_SIZE = 128;

// ESP32 IDs
constexpr uint8_t LEFT_HAND_ID = 1;
constexpr uint8_t RIGHT_HAND_ID = 2;

// Instrument IDs
constexpr int INSTRUMENT_DRUMS = 1;
constexpr int INSTRUMENT_KEYS = 2;
constexpr int INSTRUMENT_VIOLIN = 3;
constexpr int INSTRUMENT_GUITAR = 4;
constexpr int INSTRUMENT_MP3 = 5;

struct FlexThresholdsRight {
    static constexpr int THUMB = 760;
    static constexpr int INDEX = 550;
    static constexpr int MIDDLE = 650;
    static constexpr int RING = 560;
    static constexpr int PINKY = 560;
};

// Forward declarations for instrument controllers
class LoopManager;
class DrumControllerFlex;
class DrumControllerZones;
class KeysController;
class ChordsController;
class MP3PlayerController;
class JuceAudioEngine;
class PacketParser {
public:
    static const size_t LEFT_HAND_SIZE = 56;  // Adjust size as needed
    static const size_t RIGHT_HAND_SIZE = 57; // Adjust size as needed
    
    static std::unique_ptr<SensorSample> parse_left_hand(const uint8_t* data, size_t length);
    static std::unique_ptr<SensorSample> parse_right_hand(const uint8_t* data, size_t length);
};
class UDPReceiver {
private:
    #ifdef _WIN32
    SOCKET sock_;
    #else
    int sock_;
    #endif
    struct sockaddr_in server_addr_;
    struct sockaddr_in client_addr_;
    bool running_;
    int port_;
    std::mutex sample_mutex_;
    std::shared_ptr<SensorSample> left_sample_;
    std::shared_ptr<SensorSample> right_sample_;
    // Statistics
    uint32_t left_packets_;
    uint32_t right_packets_;
    uint32_t left_error_count_;
    uint32_t right_error_count_;
    uint32_t unknown_id_count_;
    double last_left_time_;
    double last_right_time_;
    
    double last_stats_print_;
    const double stats_interval_ = 5.0;
    
    std::thread receiver_thread_;
    
    void receive_loop();
    void print_stats_if_needed();
    bool init_socket();
    void cleanup_socket();

public:
    UDPReceiver(int port = UDP_PORT);
    ~UDPReceiver();
    
    bool start();
    void stop();
    void get_samples(std::shared_ptr<const SensorSample>& left, std::shared_ptr<const SensorSample>& right);
    std::pair<bool, bool> check_streaming();
    
    struct Stats {
        uint32_t left_packets;
        uint32_t right_packets;
        uint32_t left_errors;
        uint32_t right_errors;
        uint32_t unknown_ids;
        double left_rate;
        double right_rate;
    };
    
    Stats get_stats();
};

// Base class for all instrument controllers
class InstrumentController {
public:
    virtual ~InstrumentController() = default;
    virtual void handle_samples(const SensorSample* left, const SensorSample* right) = 0;
    virtual void calibrate(const std::vector<SensorSample>& left_baseline, 
                          const std::vector<SensorSample>& right_baseline) = 0;
};

class MP3PlayerController : public InstrumentController {
private:
    std::string audio_file_path_;
    bool fsr_active_;
    bool audio_playing_;
    bool audio_loaded_;

public:
    MP3PlayerController(const std::string& audio_file_path = "");
    void handle_samples(const SensorSample* left, const SensorSample* right) override;
    void calibrate(const std::vector<SensorSample>& left_baseline, 
                   const std::vector<SensorSample>& right_baseline) override;
};

class InstrumentManager {
private:
    int current_instrument_;
    int current_mode_;
    bool paused_;
    
    std::unordered_map<int, std::unordered_map<int, std::unique_ptr<InstrumentController>>> instruments_;
    
    void initialize_instruments();

public:
    InstrumentManager();
    void set_instrument(int instrument_id);
    void set_mode(int mode);
    void handle_samples(const SensorSample* left, const SensorSample* right, bool paused = false);
    void calibrate_all(const std::vector<SensorSample>& left_samples, 
                       const std::vector<SensorSample>& right_samples);
    
    // Getters for accessing private members
    int get_current_instrument() const { return current_instrument_; }
    int get_current_mode() const { return current_mode_; }
};

class CalibrationManager {
private:
    bool calibrated_;
    std::deque<std::pair<SensorSample, SensorSample>> calibration_samples_;

    enum class PoseCalibrationPhase {
        NEUTRAL_POSE,
        LEFT_WAKANDA_POSE,
        RIGHT_WAKANDA_POSE,
        COMPLETE
    };
    
    PoseCalibrationPhase pose_phase_;
    std::array<float, 4> neutral_captured_;
    std::array<float, 4> left_wakanda_captured_;
    std::array<float, 4> right_wakanda_captured_;

    bool is_pose_calibration_mode_;  // true = pose calib (W), false = flex calib (C)


public:
    CalibrationManager();
    bool start_calibration();
   bool collect_calibration_data(const SensorSample* left, const SensorSample* right);
    void get_calibration_samples(std::vector<SensorSample>& left_samples, 
                                std::vector<SensorSample>& right_samples);

    bool is_pose_calibration_active() const;
    bool is_in_pose_mode() const;
    PoseCalibrationPhase get_current_phase() const;
    void get_captured_poses(std::array<float, 4>& neutral,
                           std::array<float, 4>& left_wakanda,
                           std::array<float, 4>& right_wakanda) const;
    bool start_pose_calibration();
};

class MainController : public juce::Timer {
private:
    std::unique_ptr<LoopManager> loop_manager_;
    std::unique_ptr<InstrumentManager> instrument_manager_;
    std::unique_ptr<CalibrationManager> calibration_manager_;
    std::unique_ptr<UDPReceiver> udp_receiver_;

    // JUCE Audio Engine
    std::unique_ptr<JuceAudioEngine> audio_engine_;
    
    bool running_;
    bool calibrating_;
    
    // FSR mode switching state
    bool fsr_pressed_;
    double fsr_press_time_;
    double fsr_cooldown_;
    const uint16_t FSR_PRESS_THRESHOLD = 1500;
    const uint16_t FSR_RELEASE_THRESHOLD = 800;
    uint32_t fsr_debug_counter_;
    uint32_t fsr_debug_interval_;
    double last_fsr_switch_;
    
    void handle_fsr_mode_switch(const SensorSample* right_sample);
    void toggle_current_mode();
    char check_keyboard_input();
    void initialize_audio();
    void cleanup_audio();

public:
    MainController();
    ~MainController();
    
    bool connect_udp();
    bool trigger_calibration();
    bool trigger_pose_calibration();
    void run();
    void timerCallback() override;
    void cleanup();
};

// Utility functions
double get_current_time();
void cross_platform_sleep(double seconds);
bool init_network();
void cleanup_network();

// Stub implementations for instrument controllers (to be fully implemented later)
class DrumFlexControllerImpl;
class DrumControllerFlex : public InstrumentController {
private:
    std::unique_ptr<DrumFlexControllerImpl> impl_;
public:
    DrumControllerFlex();
    ~DrumControllerFlex() override;
    
    void handle_samples(const SensorSample* left, const SensorSample* right) override;
    void calibrate(const std::vector<SensorSample>& left_baseline, 
                  const std::vector<SensorSample>& right_baseline) override;
};

class DrumZonesControllerImpl;
class DrumControllerZones : public InstrumentController {
private:
    std::unique_ptr<DrumZonesControllerImpl> impl_;
public:
    DrumControllerZones();
    ~DrumControllerZones() override;
    
    void handle_samples(const SensorSample* left, const SensorSample* right) override;
    void calibrate(const std::vector<SensorSample>& left_baseline, 
                  const std::vector<SensorSample>& right_baseline) override;
};

// Forward declaration for the real implementation
class KeysControllerImpl;

class KeysController : public InstrumentController {
private:
    std::unique_ptr<KeysControllerImpl> impl_;

public:
    KeysController();
    ~KeysController() override;
    
    void handle_samples(const SensorSample* left, const SensorSample* right) override;
    void calibrate(const std::vector<SensorSample>& left_baseline, 
                  const std::vector<SensorSample>& right_baseline) override;
    
    class CalibrationHelper {
    public:
        static std::unordered_map<std::string, float> compute_orientation_baseline(
            const std::vector<SensorSample>& samples, int count);
    };
};

class ChordsControllerImpl;
class ChordsController : public InstrumentController {
private:
    std::unique_ptr<ChordsControllerImpl> impl_;
public:
    ChordsController();
    ~ChordsController() override;
    
    void handle_samples(const SensorSample* left, const SensorSample* right) override;
    void calibrate(const std::vector<SensorSample>& left_baseline, 
                  const std::vector<SensorSample>& right_baseline) override;
    
    class CalibrationHelper {
    public:
        static std::unordered_map<std::string, float> compute_orientation_baseline(
            const std::vector<SensorSample>& samples, int count);
    };
};