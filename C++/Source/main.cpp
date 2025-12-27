#include "core/main_controller.h"
#include "core/Logger.h"  // ADD THIS
#include <memory>
#include <vector>
#include <thread>
#include <mutex>
#include <iomanip>

#include <iostream>
#include <cstring>
#include "core/SensorSample.h"

// Global debug flag - set to false to reduce console output
bool g_debug_mode = false;  // ADD THIS - default OFF
#include "Looping/loop.h"
#include "Audio/JuceAudioEngine.h"
#include "UI/GloveToneWindow.h"
#include <juce_events/juce_events.h>
#include <juce_gui_basics/juce_gui_basics.h>
#ifdef _WIN32
#include <conio.h>
#include <windows.h>  // For SetConsoleOutputCP
#endif
// Instrument Headers
#include "Instruments/Violin/ViolinController.h"
#include "Instruments/Guitar/GuitarController.h"
#include "Instruments/Keys/KeysController.h"
#include "Instruments/Drums/DrumFlexController.h"
#include "Instruments/Drums/DrumZonesController.h"
#include "Instruments/Keys/ChordsController.h"



// PacketParser implementation
std::unique_ptr<SensorSample> PacketParser::parse_left_hand(const uint8_t* data, size_t length) {
    if (length != LEFT_HAND_SIZE && length != LEFT_HAND_SIZE - 1) {
        return nullptr;}
    
    try {
        size_t offset = 0;
        uint8_t esp_id = data[offset]; offset += 1;
        
        if (esp_id != LEFT_HAND_ID) {
            return nullptr;
        }
        
        uint32_t timestamp;
        memcpy(&timestamp, data + offset, 4); offset += 4;
        
        auto sample = std::make_unique<SensorSample>();
        sample->ts = timestamp / 1000;
        
        memcpy(&sample->qw, data + offset, 4); offset += 4;
        memcpy(&sample->qx, data + offset, 4); offset += 4;
        memcpy(&sample->qy, data + offset, 4); offset += 4;
        memcpy(&sample->qz, data + offset, 4); offset += 4;
        
        memcpy(&sample->ax, data + offset, 4); offset += 4;
        memcpy(&sample->ay, data + offset, 4); offset += 4;
        memcpy(&sample->az, data + offset, 4); offset += 4;
        
        memcpy(&sample->gx, data + offset, 4); offset += 4;
        memcpy(&sample->gy, data + offset, 4); offset += 4;
        memcpy(&sample->gz, data + offset, 4); offset += 4;
        
        memcpy(&sample->flex_thumb, data + offset, 2); offset += 2;
        memcpy(&sample->flex_index, data + offset, 2); offset += 2;
        memcpy(&sample->flex_middle, data + offset, 2); offset += 2;
        memcpy(&sample->flex_ring, data + offset, 2); offset += 2;
        memcpy(&sample->flex_pinky, data + offset, 2); offset += 2;
        
        sample->fsr = 0;
        
        return sample;
        
    } catch (...) {
        return nullptr;
    }
}

std::unique_ptr<SensorSample> PacketParser::parse_right_hand(const uint8_t* data, size_t length) {
    if (length != RIGHT_HAND_SIZE) {
        return nullptr;
    }
    
    try {
        size_t offset = 0;
        uint8_t esp_id = data[offset]; offset += 1;
        
        if (esp_id != RIGHT_HAND_ID) {
            return nullptr;
        }
        
        uint32_t timestamp;
        memcpy(&timestamp, data + offset, 4); offset += 4;
        
        auto sample = std::make_unique<SensorSample>();
        sample->ts = timestamp / 1000;
        
        memcpy(&sample->qw, data + offset, 4); offset += 4;
        memcpy(&sample->qx, data + offset, 4); offset += 4;
        memcpy(&sample->qy, data + offset, 4); offset += 4;
        memcpy(&sample->qz, data + offset, 4); offset += 4;
        
        memcpy(&sample->ax, data + offset, 4); offset += 4;
        memcpy(&sample->ay, data + offset, 4); offset += 4;
        memcpy(&sample->az, data + offset, 4); offset += 4;
        
        memcpy(&sample->gx, data + offset, 4); offset += 4;
        memcpy(&sample->gy, data + offset, 4); offset += 4;
        memcpy(&sample->gz, data + offset, 4); offset += 4;
        
        memcpy(&sample->flex_thumb, data + offset, 2); offset += 2;
        memcpy(&sample->flex_index, data + offset, 2); offset += 2;
        memcpy(&sample->flex_middle, data + offset, 2); offset += 2;
        memcpy(&sample->flex_ring, data + offset, 2); offset += 2;
        memcpy(&sample->flex_pinky, data + offset, 2); offset += 2;
        
        memcpy(&sample->fsr, data + offset, 2); offset += 2;
        
        return sample;
        
    } catch (...) {
        return nullptr;
    }
}

// UDPReceiver implementation
UDPReceiver::UDPReceiver(int port) : port_(port), 
    left_packets_(0), right_packets_(0),
    left_error_count_(0), right_error_count_(0), unknown_id_count_(0),
    last_left_time_(0), last_right_time_(0), last_stats_print_(0) {
    
    #ifdef _WIN32
    sock_ = INVALID_SOCKET;
    #else
    sock_ = -1;
    #endif
    running_ = false;
}

UDPReceiver::~UDPReceiver() {
    stop();
}

bool UDPReceiver::init_socket() {
    #ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        return false;
    }
    
    sock_ = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock_ == INVALID_SOCKET) {
        WSACleanup();
        return false;
    }
    
    u_long mode = 1;
    ioctlsocket(sock_, FIONBIO, &mode);
    #else
    sock_ = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_ < 0) {
        return false;
    }
    
    int flags = fcntl(sock_, F_GETFL, 0);
    fcntl(sock_, F_SETFL, flags | O_NONBLOCK);
    #endif
    
    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(port_);
    
    if (bind(sock_, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        cleanup_socket();
        return false;
    }
    
    return true;
}

void UDPReceiver::cleanup_socket() {
    #ifdef _WIN32
    if (sock_ != INVALID_SOCKET) {
        closesocket(sock_);
        sock_ = INVALID_SOCKET;
        WSACleanup();
    }
    #else
    if (sock_ >= 0) {
        close(sock_);
        sock_ = -1;
    }
    #endif
}

bool UDPReceiver::start() {
    if (!init_socket()) {
        std::cout << "❌ UDP Receiver: Failed to start - socket error" << std::endl;
        return false;
    }
    
    LOG_INFO("✅ UDP Receiver: Listening on 0.0.0.0:" << port_);
    LOG_DEBUG("   Left hand expected: " << PacketParser::LEFT_HAND_SIZE << " bytes");
    LOG_DEBUG("   Right hand expected: " << PacketParser::RIGHT_HAND_SIZE << " bytes");
    
    running_ = true;
    receiver_thread_ = std::thread(&UDPReceiver::receive_loop, this);
    
    return true;
}

void UDPReceiver::receive_loop() {
    uint8_t buffer[UDP_BUFFER_SIZE];
    
    while (running_) {
        #ifdef _WIN32
        struct sockaddr_in client_addr;
        int client_len = sizeof(client_addr);
        int bytes_received = recvfrom(sock_, (char*)buffer, UDP_BUFFER_SIZE, 0, 
                                    (struct sockaddr*)&client_addr, &client_len);
        #else
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        
        struct pollfd pfd;
        pfd.fd = sock_;
        pfd.events = POLLIN;
        pfd.revents = 0;
        
        int poll_result = poll(&pfd, 1, 1);
        
        if (poll_result <= 0) {
            continue;
        }
        
        int bytes_received = recvfrom(sock_, (char*)buffer, UDP_BUFFER_SIZE, 0,
                                     (struct sockaddr*)&client_addr, &client_len);
        #endif  // ✅ ADD THIS - closes the #ifdef _WIN32
        
        // ✅ ADD THESE - variable declarations
        if (bytes_received <= 0) {
            continue;
        }
        
        uint8_t esp_id = buffer[0];  // ✅ Extract ESP ID from first byte
        std::unique_ptr<SensorSample> sample;  // ✅ Declare sample pointer
        
        // Now the existing code works:
        if (esp_id == LEFT_HAND_ID) {
            sample = PacketParser::parse_left_hand(buffer, bytes_received);
            if (sample) {
                std::lock_guard<std::mutex> lock(sample_mutex_);
                left_sample_ = std::move(sample);
                left_packets_++;
                last_left_time_ = get_current_time();
            } else {
                left_error_count_++;
            }
        } else if (esp_id == RIGHT_HAND_ID) {
            sample = PacketParser::parse_right_hand(buffer, bytes_received);
            if (sample) {
                std::lock_guard<std::mutex> lock(sample_mutex_);
                right_sample_ = std::move(sample);
                right_packets_++;
                last_right_time_ = get_current_time();
            } else {
                right_error_count_++;
            }
        } else {
            unknown_id_count_++;
            if (unknown_id_count_ < 5) {
                LOG_DEBUG("⚠️ Unknown ESP ID: " << (int)esp_id << ", packet size: " << bytes_received << " bytes");
            }
        }
        
        print_stats_if_needed();
    }
}

void UDPReceiver::print_stats_if_needed() {
    double current_time = get_current_time();
    if (current_time - last_stats_print_ >= 10.0) {
        Stats stats = get_stats();
        LOG_DEBUG("\n📊 UDP Stats:");
        LOG_DEBUG("   Left:  " << stats.left_packets << " packets, " << stats.left_errors << " errors, " << std::fixed << std::setprecision(1) << stats.left_rate << " Hz");
        LOG_DEBUG("   Right: " << stats.right_packets << " packets, " << stats.right_errors << " errors, " << stats.right_rate << " Hz");
        if (unknown_id_count_ > 0) {
            LOG_DEBUG("   Unknown IDs: " << unknown_id_count_);
        }
        last_stats_print_ = current_time;
    }
}

void UDPReceiver::stop() {
    running_ = false;
    if (receiver_thread_.joinable()) {
        receiver_thread_.join();
    }
    cleanup_socket();
}

std::pair<bool, bool> UDPReceiver::check_streaming() {
    double current_time = get_current_time();
    bool left_alive = (last_left_time_ > 0) && ((current_time - last_left_time_) < 1.0);
    bool right_alive = (last_right_time_ > 0) && ((current_time - last_right_time_) < 1.0);
    return {left_alive, right_alive};
}

void UDPReceiver::get_samples(std::shared_ptr<const SensorSample>& left, std::shared_ptr<const SensorSample>& right) {
    std::lock_guard<std::mutex> lock(sample_mutex_);
    left = left_sample_;
    right = right_sample_;
}

UDPReceiver::Stats UDPReceiver::get_stats() {
    double current_time = get_current_time();
    double left_duration = (last_left_time_ > 0) ? (current_time - last_left_time_) : 1.0;
    double right_duration = (last_right_time_ > 0) ? (current_time - last_right_time_) : 1.0;
    
    return {
        left_packets_,
        right_packets_,
        left_error_count_,
        right_error_count_,
        unknown_id_count_,
        left_packets_ / std::max(1.0, left_duration),
        right_packets_ / std::max(1.0, right_duration)
    };
}

// MP3PlayerController implementation
MP3PlayerController::MP3PlayerController(const std::string& audio_file_path) : 
    audio_file_path_(audio_file_path), fsr_active_(false), 
    audio_playing_(false), audio_loaded_(true) {
    std::cout << "✅ MP3 Player: Controller initialized" << std::endl;
}

void MP3PlayerController::handle_samples(const SensorSample* left, const SensorSample* right) {
    if (!right || !audio_loaded_) return;
    
    uint16_t fsr_value = right->fsr;
    uint16_t fsr_threshold = 1000;
    
    if (fsr_value > fsr_threshold && !fsr_active_) {
        fsr_active_ = true;
        if (audio_playing_) {
            std::cout << "🎶 MP3: Playback stopped" << std::endl;
            audio_playing_ = false;
            if (g_audioEngine) g_audioEngine->sendMIDI(7, 60, 0, false);
        } else {
            std::cout << "🎶 MP3: Playback started" << std::endl;
            audio_playing_ = true;
            if (g_audioEngine) g_audioEngine->sendMIDI(7, 60, 127, true);
        }
    } 
    // ADD THIS BLOCK TO RESET THE SWITCH:
    else if (fsr_value < (fsr_threshold - 200) && fsr_active_) {
        fsr_active_ = false; // Reset so you can press again!
    }

}

void MP3PlayerController::calibrate(const std::vector<SensorSample>& left_baseline, 
                                   const std::vector<SensorSample>& right_baseline) {
}

// InstrumentManager implementation
void InstrumentManager::initialize_instruments() {
    instruments_[INSTRUMENT_DRUMS][1] = std::make_unique<DrumControllerFlex>();
    instruments_[INSTRUMENT_DRUMS][2] = std::make_unique<DrumControllerZones>();
    instruments_[INSTRUMENT_KEYS][1] = std::make_unique<KeysController>();
    instruments_[INSTRUMENT_KEYS][2] = std::make_unique<ChordsController>();
    instruments_[INSTRUMENT_VIOLIN][1] = std::make_unique<ViolinController>();
    instruments_[INSTRUMENT_GUITAR][1] = std::make_unique<GuitarController>();
    instruments_[INSTRUMENT_MP3][1] = std::make_unique<MP3PlayerController>("D:\\Main project\\55.mp3");
    
    std::cout << "✅ Instrument Manager: All controllers initialized" << std::endl;
}

InstrumentManager::InstrumentManager() : current_instrument_(INSTRUMENT_DRUMS), 
    current_mode_(1), paused_(false) {
    initialize_instruments();
}

void InstrumentManager::set_instrument(int instrument_id) {
    if (instrument_id != current_instrument_) {
        current_instrument_ = instrument_id;
        current_mode_ = 1;
        
        static std::unordered_map<int, std::string> instrument_names = {
            {INSTRUMENT_DRUMS, "Drums"},
            {INSTRUMENT_KEYS, "Keys"},
            {INSTRUMENT_VIOLIN, "Violin"},
            {INSTRUMENT_GUITAR, "Guitar"},
            {INSTRUMENT_MP3, "MP3 Player"}
        };
        
        std::cout << "🎵 SWITCHED TO: " << instrument_names[instrument_id] << std::endl;
    }
}

void InstrumentManager::set_mode(int mode) {
    if (mode != current_mode_) {
        current_mode_ = mode;
        static std::unordered_map<int, std::string> mode_names = {{1, "A"}, {2, "B"}};
        std::cout << "🔀 MODE: " << mode_names[mode] << std::endl;
    }
}

void InstrumentManager::handle_samples(const SensorSample* left, const SensorSample* right, bool paused) {
    if (paused) return;
    
    auto instrument_it = instruments_.find(current_instrument_);
    if (instrument_it != instruments_.end()) {
        auto mode_it = instrument_it->second.find(current_mode_);
        if (mode_it != instrument_it->second.end() && mode_it->second) {
            mode_it->second->handle_samples(left, right);
        }
    }
}

void InstrumentManager::calibrate_all(const std::vector<SensorSample>& left_samples, 
                                     const std::vector<SensorSample>& right_samples) {
    std::cout << "🔧 Broadcasting calibration to all instruments..." << std::endl;
    
    auto left_baseline_dict = KeysController::CalibrationHelper::compute_orientation_baseline(left_samples, 50);
    auto right_baseline_dict = KeysController::CalibrationHelper::compute_orientation_baseline(right_samples, 50);
    
    if (left_baseline_dict.empty() || right_baseline_dict.empty()) {
        std::cout << "⚠️ Warning: Could not compute orientation baselines for keys" << std::endl;
    }
    
    for (auto& instrument_pair : instruments_) {
        for (auto& mode_pair : instrument_pair.second) {
            if (mode_pair.second) {
                if (instrument_pair.first == INSTRUMENT_KEYS) {
                    std::vector<SensorSample> left_baseline_vec, right_baseline_vec;
                    mode_pair.second->calibrate(left_baseline_vec, right_baseline_vec);
                } else {
                    mode_pair.second->calibrate(left_samples, right_samples);
                }
            }
        }
    }
    
    std::cout << "✅ Calibration broadcast complete" << std::endl;
}

// CalibrationManager implementation
CalibrationManager::CalibrationManager() : calibrated_(false), 
    pose_phase_(PoseCalibrationPhase::NEUTRAL_POSE),
    is_pose_calibration_mode_(false) {
    // Initialize with default hardcoded values as fallback
    neutral_captured_ = {1.0f, 0.0f, 0.0f, 0.0f};
    left_wakanda_captured_ = LEFT_WAKANDA_CAPTURED;
    right_wakanda_captured_ = RIGHT_WAKANDA_CAPTURED;
}
bool CalibrationManager::start_calibration() {
    calibration_samples_.clear();
    calibrated_ = false;
    is_pose_calibration_mode_ = false;  // Default: flex calibration
    
    std::cout << "\n🎯 FLEX SENSOR CALIBRATION STARTING..." << std::endl;
    for (int i = 3; i > 0; --i) {
        std::cout << i << "..." << std::endl;
        cross_platform_sleep(1.0);
    }
    std::cout << "CALIBRATING NOW! Hold hands in neutral position..." << std::endl;
    return true;
}

bool CalibrationManager::start_pose_calibration() {
    calibration_samples_.clear();
    calibrated_ = false;
    is_pose_calibration_mode_ = true;  // Pose calibration mode
    pose_phase_ = PoseCalibrationPhase::NEUTRAL_POSE;
    
    std::cout << "\n🎯 POSE CALIBRATION STARTING..." << std::endl;
    std::cout << "You will calibrate 3 poses: Neutral, Left Wakanda, Right Wakanda" << std::endl;
    for (int i = 3; i > 0; --i) {
        std::cout << i << "..." << std::endl;
        cross_platform_sleep(1.0);
    }
    return true;
}

bool CalibrationManager::collect_calibration_data(const SensorSample* left, const SensorSample* right) {
    if (!left || !right) return false;
    
    // MODE 1: Original flex sensor calibration (C key)
    if (!is_pose_calibration_mode_) {
        if (calibration_samples_.size() < 50) {
            calibration_samples_.push_back({*left, *right});
            double progress = (calibration_samples_.size() / 50.0) * 100.0;
            std::cout << "📊 Calibrating... " << static_cast<int>(progress) << "%" << std::flush << "\r";
            return false;
        } else {
            std::cout << std::endl;
            return true;  // Flex calibration complete
        }
    }
    
    // MODE 2: Pose calibration (W key)
    // Phase 1: Neutral pose
    if (pose_phase_ == PoseCalibrationPhase::NEUTRAL_POSE) {
        neutral_captured_ = {left->qw, left->qx, left->qy, left->qz};
        std::cout << "\n✅ Neutral pose captured!" << std::endl;
        
        std::cout << "\n🦸 Next pose: LEFT WAKANDA (LEFT hand, arms crossed)" << std::endl;
        std::cout << "   Transitioning in..." << std::endl;
        for (int i = 5; i > 0; --i) {
            std::cout << "   " << i << "..." << std::endl;
            cross_platform_sleep(1.0);
        }
        pose_phase_ = PoseCalibrationPhase::LEFT_WAKANDA_POSE;
        return false;
    }
    
    // Phase 2: Left Wakanda pose
    if (pose_phase_ == PoseCalibrationPhase::LEFT_WAKANDA_POSE) {
        left_wakanda_captured_ = {left->qw, left->qx, left->qy, left->qz};
        std::cout << "\n✅ Left Wakanda pose captured!" << std::endl;
        
        std::cout << "\n🦸 Next pose: RIGHT WAKANDA (RIGHT hand, arms crossed)" << std::endl;
        std::cout << "   Transitioning in..." << std::endl;
        for (int i = 5; i > 0; --i) {
            std::cout << "   " << i << "..." << std::endl;
            cross_platform_sleep(1.0);
        }
        pose_phase_ = PoseCalibrationPhase::RIGHT_WAKANDA_POSE;
        return false;
    }
    
    // Phase 3: Right Wakanda pose (final)
    if (pose_phase_ == PoseCalibrationPhase::RIGHT_WAKANDA_POSE) {
        right_wakanda_captured_ = {right->qw, right->qx, right->qy, right->qz};
        std::cout << "\n✅ Right Wakanda pose captured!" << std::endl;
        
        pose_phase_ = PoseCalibrationPhase::COMPLETE;
        std::cout << "\n🎉 POSE CALIBRATION COMPLETE!" << std::endl;
        return true;
    }

    
    return false;
}

void CalibrationManager::get_calibration_samples(std::vector<SensorSample>& left_samples, 
                                               std::vector<SensorSample>& right_samples) {
    left_samples.clear();
    right_samples.clear();
    
    for (const auto& sample_pair : calibration_samples_) {
        left_samples.push_back(sample_pair.first);
        right_samples.push_back(sample_pair.second);
    }
}

bool CalibrationManager::is_pose_calibration_active() const {
    return pose_phase_ != PoseCalibrationPhase::COMPLETE;
}

bool CalibrationManager::is_in_pose_mode() const {
    return is_pose_calibration_mode_;
}

bool MainController::trigger_pose_calibration() {
    if (!calibrating_) {
        calibrating_ = true;
        return calibration_manager_->start_pose_calibration();
    }
    return false;
}

CalibrationManager::PoseCalibrationPhase CalibrationManager::get_current_phase() const {
    return pose_phase_;
}

void CalibrationManager::get_captured_poses(std::array<float, 4>& neutral,
                                            std::array<float, 4>& left_wakanda,
                                            std::array<float, 4>& right_wakanda) const {
    neutral = neutral_captured_;
    left_wakanda = left_wakanda_captured_;
    right_wakanda = right_wakanda_captured_;
}
// MainController implementation
MainController::MainController() : running_(false), calibrating_(false),
    fsr_pressed_(false), fsr_press_time_(0), fsr_cooldown_(0.5),
    fsr_debug_counter_(0), fsr_debug_interval_(100), last_fsr_switch_(0) {
    
    // Enable UTF-8 console output on Windows for emoji support
    #ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
    #endif
    
    std::cout << "\n" << std::string(70, '=') << std::endl;
    std::cout << "🎵 DUAL HAND ESP32 MUSICAL GLOVE SYSTEM - WiFi UDP Version" << std::endl;
    std::cout << std::string(70, '=') << std::endl;
    
    loop_manager_ = std::make_unique<LoopManager>();
    instrument_manager_ = std::make_unique<InstrumentManager>();
    calibration_manager_ = std::make_unique<CalibrationManager>();
    udp_receiver_ = std::make_unique<UDPReceiver>();
    
    // Initialize JUCE audio engine
    audio_engine_ = std::make_unique<JuceAudioEngine>();
    if (!audio_engine_->initialize("config.json")) {
        std::cout << "❌ Failed to initialize JUCE audio engine" << std::endl;
        throw std::runtime_error("Audio initialization failed");
    }
    
    // Set global pointer for controllers
    g_audioEngine = audio_engine_.get();
    
    if (!audio_engine_->startAudio()) {
        std::cout << "❌ Failed to start audio device" << std::endl;
        throw std::runtime_error("Audio device failed");
    }
    
    std::cout << "✅ JUCE audio engine initialized and running" << std::endl;
    std::cout << "✅ Main Controller initialized" << std::endl;
}

MainController::~MainController() {
    cleanup();
}

void MainController::initialize_audio() {
    std::cout << "✅ Audio system initialized" << std::endl;
}

void MainController::cleanup_audio() {
}

bool MainController::connect_udp() {
    std::cout << "\n🔌 Starting UDP receiver..." << std::endl;
    
    if (!udp_receiver_->start()) {
        std::cout << "❌ Failed to start UDP receiver" << std::endl;
        return false;
    }
    
    std::cout << "⏳ Waiting for both gloves to connect..." << std::endl;
    std::cout << "   Make sure ESP32s are powered on and connected to WiFi 'GloveTone2025'" << std::endl;
    
    double timeout = 30.0;
    double start_time = get_current_time();
    
    while (get_current_time() - start_time < timeout) {
        auto [left_alive, right_alive] = udp_receiver_->check_streaming();
        
        if (left_alive && !right_alive) {
            std::cout << "   ✅ Left hand detected, waiting for right hand..." << std::endl;
        } else if (right_alive && !left_alive) {
            std::cout << "   ✅ Right hand detected, waiting for left hand..." << std::endl;
        } else if (left_alive && right_alive) {
            std::cout << "✅ Both hands detected and streaming!" << std::endl;
            auto stats = udp_receiver_->get_stats();
            std::cout << "   Left: " << stats.left_packets << " packets, " 
                     << stats.left_rate << " Hz" << std::endl;
            std::cout << "   Right: " << stats.right_packets << " packets, " 
                     << stats.right_rate << " Hz" << std::endl;
            return true;
        }
        
        cross_platform_sleep(0.5);
    }
    
    std::cout << "❌ Timeout: Could not detect both hands" << std::endl;
    std::cout << "   Troubleshooting:" << std::endl;
    std::cout << "   1. Check ESP32 power and WiFi connection" << std::endl;
    std::cout << "   2. Verify PC is connected to 'GloveTone2025' network" << std::endl;
    std::cout << "   3. Check PC IP is 192.168.137.1" << std::endl;
    std::cout << "   4. Verify UDP port 8888 is not blocked by firewall" << std::endl;
    return false;
}

bool MainController::trigger_calibration() {
    if (!calibrating_) {
        calibrating_ = true;
        return calibration_manager_->start_calibration();
    }
    return false;
}

void MainController::handle_fsr_mode_switch(const SensorSample* right_sample) {
    if (!right_sample) return;
    
    uint16_t fsr_value = right_sample->fsr;
    double current_time = get_current_time();
    
    fsr_debug_counter_++;
    if (fsr_debug_counter_ >= fsr_debug_interval_) {
        fsr_debug_counter_ = 0;
    }
    
    if (fsr_value > FSR_PRESS_THRESHOLD && !fsr_pressed_) {
        fsr_pressed_ = true;
        fsr_press_time_ = current_time;
        return;
    } else if (fsr_pressed_ && fsr_value < FSR_RELEASE_THRESHOLD) {
        double press_duration = current_time - fsr_press_time_;
        fsr_pressed_ = false;
        
        if (press_duration >= 0.1 && press_duration <= 1.0 &&
            current_time - last_fsr_switch_ > fsr_cooldown_) {
            
            toggle_current_mode();
            last_fsr_switch_ = current_time;
        }
    }
}

void MainController::toggle_current_mode() {
    int current_instrument = instrument_manager_->get_current_instrument();
    int current_mode = instrument_manager_->get_current_mode();
    
    if (current_instrument == INSTRUMENT_DRUMS || current_instrument == INSTRUMENT_KEYS) {
        int new_mode = (current_mode == 1) ? 2 : 1;
        instrument_manager_->set_mode(new_mode);
        
        static std::unordered_map<int, std::string> instrument_names = {
            {INSTRUMENT_DRUMS, "Drums"}, {INSTRUMENT_KEYS, "Keys"}
        };
        std::cout << "🔀 FSR MODE SWITCH: " << instrument_names[current_instrument] 
                 << " Mode " << new_mode << std::endl;
    }
}

char MainController::check_keyboard_input() {
    #ifdef _WIN32
    if (_kbhit()) {
        char key = _getch();
        if (key == 'c' || key == 'C') return 'C';
        if (key == 'd' || key == 'D') return 'D';
    }
    #else
    struct termios oldt, newt;
    tcgetattr(STDIN_FILENO, &oldt);
    newt = oldt;
    newt.c_lflag &= ~(ICANON | ECHO);
    tcsetattr(STDIN_FILENO, TCSANOW, &newt);
    
    fd_set readfds;
    struct timeval timeout;
    timeout.tv_sec = 0;
    timeout.tv_usec = 0;
    
    FD_ZERO(&readfds);
    FD_SET(STDIN_FILENO, &readfds);
    
    if (select(STDIN_FILENO + 1, &readfds, NULL, NULL, &timeout) > 0) {
        char key = getchar();
        tcsetattr(STDIN_FILENO, TCSANOW, &oldt);
        if (key == 'c' || key == 'C') return 'C';
        if (key == 'd' || key == 'D') return 'D';
    }
    tcsetattr(STDIN_FILENO, TCSANOW, &oldt);
    #endif
    return 0;
}

void MainController::run() {
    if (!connect_udp()) {
        std::cout << "❌ Failed to establish UDP connection. Exiting." << std::endl;
        return;
    }
    
    std::cout << "\n🎵 SYSTEM READY!" << std::endl;
    std::cout << "Press 'C' for flex calibration, 'W' for pose calibration, Ctrl+C to exit" << std::endl;
    std::cout << "FSR Quick Press: Toggle between Mode 1/2 (Drums & Keys only)" << std::endl;
    std::cout << "Gesture Controls: Wakanda=Instrument, L-pose+Flick=Pause, Right L-pose=Loop" << std::endl;
    std::cout << std::string(70, '=') << "\n" << std::endl;
    
    running_ = true;

    juce::MessageManager::getInstance(); 
    auto guiWindow = std::make_unique<GloveToneWindow>("GloveTone Studio", audio_engine_.get());
    
    startTimerHz(60);
    juce::MessageManager::getInstance()->runDispatchLoop();
}
void MainController::timerCallback() {
    if (!running_) return;

    // === ADD THIS DEBUG CODE HERE ===
    static int debug_counter = 0;
    if (++debug_counter % 100 == 0) {
        std::shared_ptr<const SensorSample> left, right;
        udp_receiver_->get_samples(left, right);
        
        std::cout << "🔧 #" << debug_counter 
                  << " | Left=" << (left ? "YES" : "NO")
                  << " | Right=" << (right ? "YES" : "NO");
        
        if (left) {
            std::cout << " | LEFT Flex: T=" << left->flex_thumb 
                << " I=" << left->flex_index
                << " M=" << left->flex_middle
                << " R=" << left->flex_ring
                << " P=" << left->flex_pinky;
            std::cout << " | Quat: w=" << left->qw 
              << " x=" << left->qx 
              << " y=" << left->qy 
              << " z=" << left->qz;
        }
        if (right) {
            std::cout << " | RIGHT FSR=" << right->fsr;
        }
        std::cout << std::endl;
    }
    // ================================

    try {
        if (_kbhit()) {
            char key = _getch();
            if (key == 'c' || key == 'C') {
                trigger_calibration();  // Original flex calibration
            }
            else if (key == 'w' || key == 'W') {
                trigger_pose_calibration();  // NEW: Pose calibration
            }
            else if (key == 'd' || key == 'D') {
                g_debug_mode = !g_debug_mode;
                std::cout << "🔧 DEBUG MODE: " << (g_debug_mode ? "ON" : "OFF") << std::endl;
            }
        }
        std::shared_ptr<const SensorSample> left_sample, right_sample;
        udp_receiver_->get_samples(left_sample, right_sample);
        if (calibrating_) {
            if (left_sample && right_sample) {
                if (calibration_manager_->collect_calibration_data(left_sample.get(), right_sample.get())) {
                    // Check which calibration mode completed
                    if (calibration_manager_->is_in_pose_mode()) {
                        // POSE CALIBRATION (W key) - Update pose targets
                        std::array<float, 4> neutral, left_wakanda, right_wakanda;
                        calibration_manager_->get_captured_poses(neutral, left_wakanda, right_wakanda);
                        loop_manager_->update_pose_targets(left_wakanda, right_wakanda);
                        std::cout << "✅ Pose calibration applied to LoopManager" << std::endl;
                    } else {
                        // FLEX CALIBRATION (C key) - Calibrate instruments
                        std::vector<SensorSample> left_samples, right_samples;
                        calibration_manager_->get_calibration_samples(left_samples, right_samples);
                        instrument_manager_->calibrate_all(left_samples, right_samples);
                        loop_manager_->calibrate(left_samples, right_samples);
                        std::cout << "✅ Flex calibration complete!" << std::endl;
                    }
                    calibrating_ = false;
                }
            }
            return;
        }
        
        
        udp_receiver_->get_samples(left_sample, right_sample);
        
        if (!left_sample || !right_sample) {
            return;
        }
        
        loop_manager_->handle_samples(left_sample.get(), right_sample.get());
        
        if (loop_manager_->instrument_changed()) {
            int new_instrument = loop_manager_->get_current_instrument();
            instrument_manager_->set_instrument(new_instrument);
        }
        
        if (loop_manager_->mode_changed()) {
            int new_mode = loop_manager_->get_current_mode();
            instrument_manager_->set_mode(new_mode);
        }
        
        bool is_paused = loop_manager_->is_paused();

        // JUCE Integration: Loop state
        if (loop_manager_->loop_state_changed()) {
            if (g_audioEngine) {
                if (loop_manager_->is_loop_recording()) {
                    g_audioEngine->armLoopStart();
                } else {
                    g_audioEngine->armLoopEnd();
                }
            }
        }
        
        // JUCE Integration: Pause state
        if (loop_manager_->pause_changed()) {
            if (g_audioEngine) {
                g_audioEngine->setPaused(loop_manager_->is_paused());
            }
        }

        // ============================================================
        // FSR MODE SWITCHING LOGIC
        // ============================================================
        static bool fsr_pressed = false;
        static double fsr_press_time = 0;
        static double last_fsr_switch = 0;
        const double FSR_COOLDOWN = 0.5;
        const int FSR_PRESS_THRESHOLD = 1500;
        const int FSR_RELEASE_THRESHOLD = 800;

        if (right_sample) {
            int fsr_value = right_sample->fsr;
            double current_time = get_current_time();
            
            // Detect FSR press
            if (fsr_value > FSR_PRESS_THRESHOLD && !fsr_pressed) {
                fsr_pressed = true;
                fsr_press_time = current_time;
            }
            // Detect FSR release and toggle mode
            else if (fsr_pressed && fsr_value < FSR_RELEASE_THRESHOLD) {
                double press_duration = current_time - fsr_press_time;
                fsr_pressed = false;
                
                // Quick press (0.1s to 1.0s) = mode switch
                if (press_duration >= 0.1 && press_duration <= 1.0 &&
                    current_time - last_fsr_switch > FSR_COOLDOWN){                  
                    int current_instrument = loop_manager_->get_current_instrument();
                    int current_mode = loop_manager_->get_current_mode();
                    
                    // Only toggle for Drums (1) and Keys (2)
                    if (current_instrument == 1 || current_instrument == 2) {
                        int current_mode = instrument_manager_->get_current_mode(); // Get FRESH mode
                        int new_mode = (current_mode == 1) ? 2 : 1;
                        instrument_manager_->set_mode(new_mode);
                        std::cout << "🔀 FSR MODE SWITCH: Mode " << new_mode << std::endl;
                        last_fsr_switch = current_time;
                    }
                }
            }
        }
        // ============================================================
        
        instrument_manager_->handle_samples(left_sample.get(), right_sample.get(), is_paused);
        
    } catch (...) {
        std::cout << "\n❌ Unexpected error in main loop" << std::endl;
    }
}

void MainController::cleanup() {
    std::cout << "\n🧹 Cleaning up resources..." << std::endl;
    running_ = false;
    udp_receiver_->stop();
    cleanup_audio();
    std::cout << "✅ Resources cleaned up. Goodbye!" << std::endl;
}

double get_current_time() {
    #ifdef _WIN32
    return GetTickCount() / 1000.0;
    #else
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec + ts.tv_nsec / 1e9;
    #endif
}

void cross_platform_sleep(double seconds) {
    #ifdef _WIN32
    Sleep(static_cast<DWORD>(seconds * 1000));
    #else
    usleep(static_cast<useconds_t>(seconds * 1e6));
    #endif
}

bool init_network() {
    #ifdef _WIN32
    WSADATA wsaData;
    return WSAStartup(MAKEWORD(2, 2), &wsaData) == 0;
    #else
    return true;
    #endif
}

void cleanup_network() {
    #ifdef _WIN32
    WSACleanup();
    #endif
}

// ============================================================================
// KEYSCONTROLLER WRAPPER IMPLEMENTATION
// ============================================================================

KeysController::KeysController() {
    impl_ = std::make_unique<KeysControllerImpl>(nullptr);
}

KeysController::~KeysController() = default;

void KeysController::handle_samples(const SensorSample* left, const SensorSample* right) {
    impl_->handle_samples(left, right);
}

void KeysController::calibrate(const std::vector<SensorSample>& left_baseline, 
                               const std::vector<SensorSample>& right_baseline) {
    // Convert vector to baseline dicts
    auto left_dict = CalibrationHelper::compute_orientation_baseline(left_baseline, 50);
    auto right_dict = CalibrationHelper::compute_orientation_baseline(right_baseline, 50);
    impl_->calibrate(left_dict, right_dict);
}

std::unordered_map<std::string, float> KeysController::CalibrationHelper::compute_orientation_baseline(
    const std::vector<SensorSample>& samples, int count) {
    return KeysControllerImpl::CalibrationHelper::compute_orientation_baseline(samples, count);
}


// ============================================================================
// DRUMCONTROLLERFLEX WRAPPER IMPLEMENTATION
// ============================================================================
DrumControllerFlex::DrumControllerFlex() {
    impl_ = std::make_unique<DrumFlexControllerImpl>();
}
DrumControllerFlex::~DrumControllerFlex() = default;

void DrumControllerFlex::handle_samples(const SensorSample* left, const SensorSample* right) {
    impl_->handle_samples(left, right);
}
void DrumControllerFlex::calibrate(const std::vector<SensorSample>& left_baseline, 
                                   const std::vector<SensorSample>& right_baseline) {
    impl_->calibrate(left_baseline, right_baseline);
}

// ============================================================================
// DRUMCONTROLLERZONES WRAPPER IMPLEMENTATION
// ============================================================================
DrumControllerZones::DrumControllerZones() {
    impl_ = std::make_unique<DrumZonesControllerImpl>();
}
DrumControllerZones::~DrumControllerZones() = default;

void DrumControllerZones::handle_samples(const SensorSample* left, const SensorSample* right) {
    impl_->handle_samples(left, right);
}
void DrumControllerZones::calibrate(const std::vector<SensorSample>& left_baseline, 
                                    const std::vector<SensorSample>& right_baseline) {
    impl_->calibrate(left_baseline, right_baseline);
}

// ============================================================================
// CHORDSCONTROLLER WRAPPER IMPLEMENTATION
// ============================================================================
ChordsController::ChordsController() {
    impl_ = std::make_unique<ChordsControllerImpl>(nullptr);
}

ChordsController::~ChordsController() = default;

void ChordsController::handle_samples(const SensorSample* left, const SensorSample* right) {
    impl_->handle_samples(left, right);
}

void ChordsController::calibrate(const std::vector<SensorSample>& left_baseline, 
                                 const std::vector<SensorSample>& right_baseline) {
    auto left_dict = CalibrationHelper::compute_orientation_baseline(left_baseline, 50);
    auto right_dict = CalibrationHelper::compute_orientation_baseline(right_baseline, 50);
    impl_->calibrate(left_dict, right_dict);
}

std::unordered_map<std::string, float> ChordsController::CalibrationHelper::compute_orientation_baseline(
    const std::vector<SensorSample>& samples, int count) {
    
    float pitch_sum = 0.0f;
    float roll_sum = 0.0f;
    int valid_count = 0;
    
    for (const auto& s : samples) {
        float qw = s.qw, qx = s.qx, qy = s.qy, qz = s.qz;
        float sinp = 2.0f * (qw * qy - qz * qx);
        float pitch = 0.0f;
        if (std::abs(sinp) >= 1.0f)
            pitch = std::copysign(M_PI / 2.0f, sinp);
        else
            pitch = std::asin(sinp);
            
        float sinr_cosp = 2.0f * (qw * qx + qy * qz);
        float cosr_cosp = 1.0f - 2.0f * (qx * qx + qy * qy);
        float roll = std::atan2(sinr_cosp, cosr_cosp);
        
        pitch_sum += pitch;
        roll_sum += roll;
        valid_count++;
    }
    
    std::unordered_map<std::string, float> result;
    if (valid_count > 0) {
        result["pitch_calibration"] = pitch_sum / valid_count;
        result["roll_calibration"] = roll_sum / valid_count;
    }
    return result;
}

int main() {
    if (!init_network()) {
        std::cerr << "Failed to initialize network" << std::endl;
        return 1;
    }
    juce::ScopedJuceInitialiser_GUI gui_init;
    MainController controller;
    controller.run();
    
    cleanup_network();
    return 0;
}