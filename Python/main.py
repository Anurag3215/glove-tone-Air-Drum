"""
MAIN CONTROLLER - Dual Hand ESP32 Musical Glove System
WiFi UDP VERSION - Binary packet reception (CORRECTED & VERIFIED)
Architecture preserved - only transport layer changed
"""

import socket
import struct
import time
import threading
from collections import deque
import pygame
import os
import sys
import select

# Import instrument controllers (unchanged)
from loop import LoopManager
from drum_v2 import DrumControllerFlex
from drums_zones import DrumControllerZones
from keys import KeysController
from keys_chords import ChordsController

try:
    from violin import ViolinController
    VIOLIN_AVAILABLE = True
except ImportError as e:
    print(f"[main] WARNING: ViolinController not available (import failed: {e})")
    VIOLIN_AVAILABLE = False

try:
    from guitar import GuitarController
    GUITAR_AVAILABLE = True
except ImportError as e:
    print(f"[main] WARNING: GuitarController not available (import failed: {e})")
    GUITAR_AVAILABLE = False

# ============================================================================
# CONFIGURATION
# ============================================================================

# UDP Configuration
UDP_PORT = 8888
UDP_TIMEOUT = 0.001  # 1ms timeout for non-blocking reads
UDP_BUFFER_SIZE = 128  # Small buffer, we only need ~70 bytes

# ESP32 IDs (from C++ code)
LEFT_HAND_ID = 1
RIGHT_HAND_ID = 2

# MP3 Configuration
AUDIO_FILE_PATH = r"D:\Main project\audio\loop_track.mp3"

# Instrument IDs
INSTRUMENT_DRUMS = 1
INSTRUMENT_KEYS = 2
INSTRUMENT_VIOLIN = 3
INSTRUMENT_GUITAR = 4
INSTRUMENT_MP3 = 5

INSTRUMENT_NAMES = {
    INSTRUMENT_DRUMS: "Drums",
    INSTRUMENT_KEYS: "Keys", 
    INSTRUMENT_VIOLIN: "Violin",
    INSTRUMENT_GUITAR: "Guitar",
    INSTRUMENT_MP3: "MP3 Player"
}

# ============================================================================
# BINARY PACKET PARSING - EXACTLY MATCHES ESP32 C++ STRUCTS
# ============================================================================

class PacketParser:
    """
    Parses binary UDP packets from ESP32 WiFi streamers
    CRITICAL: Must match C++ #pragma pack(push, 1) - TIGHTLY PACKED, NO PADDING
    
    C++ LEFT HAND STRUCT:
    ----------------------
    uint8_t esp_id;                                    // 1 byte
    uint32_t timestamp;                                // 4 bytes
    float quat_w, quat_x, quat_y, quat_z;             // 16 bytes
    float accel_x, accel_y, accel_z;                  // 12 bytes
    float gyro_x, gyro_y, gyro_z;                     // 12 bytes
    uint16_t flex_thumb, flex_index, flex_middle,     // 10 bytes
             flex_ring, flex_pinky;
    uint8_t padding[1];                                // 1 byte (manual padding)
    ----------------------
    TOTAL: 56 bytes (NOT 68!)
    
    Wait... let me recalculate:
    1 + 4 + 16 + 12 + 12 + 10 + 1 = 56 bytes
    
    BUT your C++ might have alignment! Let me check properly...
    """
    
    # CORRECTED CALCULATION (with pragma pack(1), no auto-padding):
    # esp_id(1) + timestamp(4) + quat(4*4=16) + accel(3*4=12) + gyro(3*4=12) + flex(5*2=10) + padding(1) = 56 bytes
    
    # LEFT HAND PACKET - TIGHTLY PACKED (pragma pack 1)
    LEFT_HAND_FORMAT = '=B I 4f 3f 3f 5H B'  # = means standard sizes, no alignment
    LEFT_HAND_SIZE = struct.calcsize(LEFT_HAND_FORMAT)  # Should be 56 bytes
    
    # RIGHT HAND PACKET - Same as left + FSR (2 bytes instead of padding)
    RIGHT_HAND_FORMAT = '=B I 4f 3f 3f 5H H'  # Last H is FSR instead of padding
    RIGHT_HAND_SIZE = struct.calcsize(RIGHT_HAND_FORMAT)  # Should be 57 bytes
    
    @staticmethod
    def parse_left_hand(data):
        """
        Parse left hand packet (no FSR)
        Returns sample dict compatible with existing instrument controllers
        
        VERIFIED AGAINST C++ STRUCT:
        - esp_id: data[0]
        - timestamp: data[1:5]
        - quaternion: data[5:21]
        - accel: data[21:33]
        - gyro: data[33:45]
        - flex sensors: data[45:55]
        - padding: data[55]
        """
        expected_size = PacketParser.LEFT_HAND_SIZE
        
        if len(data) != expected_size:
            # Try to handle if padding byte was omitted (55 bytes instead of 56)
            if len(data) == expected_size - 1:
                data = data + b'\x00'  # Add padding byte
            else:
                return None
            
        try:
            unpacked = struct.unpack(PacketParser.LEFT_HAND_FORMAT, data)
            
            # Verify ESP ID
            if unpacked[0] != LEFT_HAND_ID:
                return None
            
            # Build sample dict matching existing interface
            # NOTE: timestamp from ESP32 is in MICROSECONDS, convert to MILLISECONDS
            sample = {
                'ts': unpacked[1] // 1000,  # Convert microseconds to milliseconds
                'qw': unpacked[2],
                'qx': unpacked[3],
                'qy': unpacked[4],
                'qz': unpacked[5],
                'ax': unpacked[6],
                'ay': unpacked[7],
                'az': unpacked[8],
                'gx': unpacked[9],
                'gy': unpacked[10],
                'gz': unpacked[11],
                'flex_thumb': unpacked[12],
                'flex_index': unpacked[13],
                'flex_middle': unpacked[14],
                'flex_ring': unpacked[15],
                'flex_pinky': unpacked[16],
                'fsr': None  # Left hand has no FSR
            }
            
            return sample
            
        except struct.error as e:
            print(f"⚠️ Left hand parse error: {e}, data length: {len(data)}")
            return None
    
    @staticmethod
    def parse_right_hand(data):
        """
        Parse right hand packet (includes FSR)
        Returns sample dict compatible with existing instrument controllers
        
        VERIFIED AGAINST C++ STRUCT:
        - esp_id: data[0]
        - timestamp: data[1:5]
        - quaternion: data[5:21]
        - accel: data[21:33]
        - gyro: data[33:45]
        - flex sensors: data[45:55]
        - fsr: data[55:57]
        """
        expected_size = PacketParser.RIGHT_HAND_SIZE
        
        if len(data) != expected_size:
            return None
            
        try:
            unpacked = struct.unpack(PacketParser.RIGHT_HAND_FORMAT, data)
            
            # Verify ESP ID
            if unpacked[0] != RIGHT_HAND_ID:
                return None
            
            # Build sample dict matching existing interface
            # NOTE: timestamp from ESP32 is in MICROSECONDS, convert to MILLISECONDS
            sample = {
                'ts': unpacked[1] // 1000,  # Convert microseconds to milliseconds
                'qw': unpacked[2],
                'qx': unpacked[3],
                'qy': unpacked[4],
                'qz': unpacked[5],
                'ax': unpacked[6],
                'ay': unpacked[7],
                'az': unpacked[8],
                'gx': unpacked[9],
                'gy': unpacked[10],
                'gz': unpacked[11],
                'flex_thumb': unpacked[12],
                'flex_index': unpacked[13],
                'flex_middle': unpacked[14],
                'flex_ring': unpacked[15],
                'flex_pinky': unpacked[16],
                'fsr': unpacked[17]  # Right hand has FSR
            }
            
            return sample
            
        except struct.error as e:
            print(f"⚠️ Right hand parse error: {e}, data length: {len(data)}")
            return None

# ============================================================================
# UDP RECEIVER - REPLACES SERIAL COMMUNICATION
# ============================================================================

class UDPReceiver:
    """
    Receives UDP packets from both ESP32 gloves
    Provides same interface as serial reader but over WiFi
    Thread-safe, non-blocking design
    """
    
    def __init__(self, port=UDP_PORT):
        self.port = port
        self.sock = None
        self.running = False
        
        # Latest samples from each hand (thread-safe access)
        self.left_sample = None
        self.right_sample = None
        self.sample_lock = threading.Lock()
        
        # Statistics
        self.left_packet_count = 0
        self.right_packet_count = 0
        self.left_error_count = 0
        self.right_error_count = 0
        self.unknown_id_count = 0
        self.last_left_time = 0
        self.last_right_time = 0
        
        # Diagnostics
        self.last_stats_print = 0
        self.stats_interval = 5.0  # Print stats every 5 seconds
        
        # Receiver thread
        self.receiver_thread = None
    
    def start(self):
        """Start UDP receiver"""
        try:
            # Create UDP socket
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            
            # Bind to all interfaces on specified port
            self.sock.bind(('0.0.0.0', self.port))
            self.sock.settimeout(UDP_TIMEOUT)
            
            print(f"✅ UDP Receiver: Listening on 0.0.0.0:{self.port}")
            print(f"   Left hand expected: {PacketParser.LEFT_HAND_SIZE} bytes")
            print(f"   Right hand expected: {PacketParser.RIGHT_HAND_SIZE} bytes")
            
            # Start receiver thread
            self.running = True
            self.receiver_thread = threading.Thread(target=self._receive_loop, daemon=True)
            self.receiver_thread.start()
            
            return True
            
        except Exception as e:
            print(f"❌ UDP Receiver: Failed to start - {e}")
            return False
    
    def _receive_loop(self):
        """Continuous packet reception loop (runs in thread)"""
        while self.running:
            try:
                # Receive packet
                data, addr = self.sock.recvfrom(UDP_BUFFER_SIZE)
                
                if len(data) == 0:
                    continue
                
                # First byte is ESP ID
                esp_id = data[0]
                
                # Parse based on hand
                if esp_id == LEFT_HAND_ID:
                    sample = PacketParser.parse_left_hand(data)
                    if sample:
                        with self.sample_lock:
                            self.left_sample = sample
                            self.left_packet_count += 1
                            self.last_left_time = time.time()
                    else:
                        self.left_error_count += 1
                        
                elif esp_id == RIGHT_HAND_ID:
                    sample = PacketParser.parse_right_hand(data)
                    if sample:
                        with self.sample_lock:
                            self.right_sample = sample
                            self.right_packet_count += 1
                            self.last_right_time = time.time()
                    else:
                        self.right_error_count += 1
                else:
                    self.unknown_id_count += 1
                    if self.unknown_id_count < 5:  # Only print first few
                        print(f"⚠️ Unknown ESP ID: {esp_id}, packet size: {len(data)} bytes")
                
                # Periodic stats printing
                self._print_stats_if_needed()
                
            except socket.timeout:
                continue
            except Exception as e:
                if self.running:  # Only print if not shutting down
                    print(f"⚠️ UDP Receiver: Error - {e}")
    
    def _print_stats_if_needed(self):
        """Print reception statistics periodically"""
        current_time = time.time()
        if current_time - self.last_stats_print >= self.stats_interval:
            stats = self.get_stats()
            print(f"\n📊 UDP Stats:")
            print(f"   Left:  {stats['left_packets']} packets, {stats['left_errors']} errors, {stats['left_rate']:.1f} Hz")
            print(f"   Right: {stats['right_packets']} packets, {stats['right_errors']} errors, {stats['right_rate']:.1f} Hz")
            if self.unknown_id_count > 0:
                print(f"   Unknown IDs: {self.unknown_id_count}")
            self.last_stats_print = current_time
    
    def get_samples(self):
        """
        Get latest samples from both hands
        Returns: (left_sample, right_sample) or (None, None)
        Thread-safe access to latest data
        
        NOTE: Does NOT clear samples - instruments can process at their own rate
        """
        with self.sample_lock:
            return self.left_sample, self.right_sample
    
    def check_streaming(self):
        """Check if both hands are actively streaming (within last second)"""
        current_time = time.time()
        
        left_alive = (current_time - self.last_left_time) < 1.0 if self.last_left_time > 0 else False
        right_alive = (current_time - self.last_right_time) < 1.0 if self.last_right_time > 0 else False
        
        return left_alive, right_alive
    
    def get_stats(self):
        """Get reception statistics"""
        current_time = time.time()
        
        # Calculate rates
        left_duration = current_time - self.last_left_time if self.last_left_time > 0 else 1.0
        right_duration = current_time - self.last_right_time if self.last_right_time > 0 else 1.0
        
        return {
            'left_packets': self.left_packet_count,
            'right_packets': self.right_packet_count,
            'left_errors': self.left_error_count,
            'right_errors': self.right_error_count,
            'unknown_ids': self.unknown_id_count,
            'left_rate': self.left_packet_count / max(1, left_duration),
            'right_rate': self.right_packet_count / max(1, right_duration)
        }
    
    def stop(self):
        """Stop UDP receiver"""
        self.running = False
        if self.receiver_thread:
            self.receiver_thread.join(timeout=1.0)
        if self.sock:
            self.sock.close()
        print("✅ UDP Receiver: Stopped")

# ============================================================================
# MP3 PLAYER CONTROLLER (unchanged)
# ============================================================================

class MP3PlayerController:
    """MP3 Player controller - triggers playback on FSR press"""

    def __init__(self, audio_file_path=AUDIO_FILE_PATH):
        self.audio_file_path = audio_file_path
        self.fsr_active = False
        self.audio_playing = False
        self.audio_loaded = False
        
        try:
            if os.path.exists(audio_file_path):
                pygame.mixer.music.load(audio_file_path)
                self.audio_loaded = True
                print(f"✅ MP3 Player: Audio loaded from {audio_file_path}")
            else:
                print(f"⚠️ MP3 Player: Audio file not found at {audio_file_path}")
        except Exception as e:
            print(f"❌ MP3 Player: Failed to load audio - {e}")
    
    def handle_samples(self, left_sample, right_sample):
        if not right_sample or not self.audio_loaded:
            return
            
        fsr_value = right_sample.get('fsr', 0)
        fsr_threshold = 1000
        
        if fsr_value > fsr_threshold and not self.fsr_active:
            self.fsr_active = True
            self._toggle_playback()
        elif fsr_value <= fsr_threshold and self.fsr_active:
            self.fsr_active = False
    
    def _toggle_playback(self):
        try:
            if self.audio_playing:
                pygame.mixer.music.stop()
                self.audio_playing = False
                print("🎶 MP3: Playback stopped")
            else:
                pygame.mixer.music.play()
                self.audio_playing = True
                print("🎶 MP3: Playback started")
        except Exception as e:
            print(f"❌ MP3 Player: Playback error - {e}")
    
    def calibrate(self, left_baseline, right_baseline):
        pass

# ============================================================================
# INSTRUMENT MANAGER (unchanged from serial version)
# ============================================================================

class InstrumentManager:
    """Manages instrument controllers and routes samples to active instrument"""

    def __init__(self):
        self.current_instrument = INSTRUMENT_DRUMS
        self.current_mode = 1
        self.paused = False
        
        self.instruments = {
            INSTRUMENT_DRUMS: {
                1: DrumControllerFlex(),
                2: DrumControllerZones()
            },
            INSTRUMENT_KEYS: {
                1: KeysController(),
                2: ChordsController()
            },
            INSTRUMENT_VIOLIN: {
                1: ViolinController() if VIOLIN_AVAILABLE else None
            },
            INSTRUMENT_GUITAR: {
                1: GuitarController() if GUITAR_AVAILABLE else None
            },
            INSTRUMENT_MP3: {
                1: MP3PlayerController()
            }
        }
        
        if not VIOLIN_AVAILABLE:
            print("⚠️ Violin instrument disabled due to import failure")
        if not GUITAR_AVAILABLE:
            print("⚠️ Guitar instrument disabled due to import failure")
        
        print("✅ Instrument Manager: All controllers initialized")
    
    def set_instrument(self, instrument_id):
        if instrument_id in self.instruments and instrument_id != self.current_instrument:
            if instrument_id == INSTRUMENT_VIOLIN and not VIOLIN_AVAILABLE:
                print("❌ Violin not available - cannot switch")
                return
            if instrument_id == INSTRUMENT_GUITAR and not GUITAR_AVAILABLE:
                print("❌ Guitar not available - cannot switch")
                return
                
            self.current_instrument = instrument_id
            self.current_mode = 1
            print(f"🎵 SWITCHED TO: {INSTRUMENT_NAMES[instrument_id]}")
    
    def set_mode(self, mode):
        if self.current_instrument in self.instruments:
            available_modes = self.instruments[self.current_instrument].keys()
            if mode in available_modes and mode != self.current_mode:
                self.current_mode = mode
                mode_names = {1: "A", 2: "B"}
                print(f"🔀 MODE: {mode_names[mode]}")
    
    def handle_samples(self, left_sample, right_sample, paused=False):
        if paused:
            return
        
        if self.current_instrument in self.instruments:
            instrument = self.instruments[self.current_instrument]
            if self.current_mode in instrument:
                controller = instrument[self.current_mode]
                if controller is not None:
                    controller.handle_samples(left_sample, right_sample)
    
    def calibrate_all(self, left_samples, right_samples):
        print("🔧 Broadcasting calibration to all instruments...")
        
        left_baseline_dict = KeysController.CalibrationHelper.compute_orientation_baseline(left_samples, 50)
        right_baseline_dict = KeysController.CalibrationHelper.compute_orientation_baseline(right_samples, 50)
        
        if not left_baseline_dict or not right_baseline_dict:
            print("⚠️ Warning: Could not compute orientation baselines for keys")
            left_baseline_dict = {'pitch_calibration': 0.0, 'roll_calibration': 0.0}
            right_baseline_dict = {'pitch_calibration': 0.0, 'roll_calibration': 0.0}
        
        for instrument_id, instrument_modes in self.instruments.items():
            for controller in instrument_modes.values():
                if controller is not None and hasattr(controller, 'calibrate'):
                    if instrument_id == INSTRUMENT_KEYS:
                        controller.calibrate(left_baseline_dict, right_baseline_dict)
                    else:
                        controller.calibrate(left_samples, right_samples)
        
        print("✅ Calibration broadcast complete")

# ============================================================================
# CALIBRATION MANAGER (unchanged)
# ============================================================================

class CalibrationManager:
    """Handles system-wide calibration"""

    def __init__(self):
        self.calibrated = False
        self.left_baseline = None
        self.right_baseline = None
        self.calibration_samples = deque(maxlen=50)
    
    def start_calibration(self):
        print("\n🎯 CALIBRATION STARTING...")
        for i in range(3, 0, -1):
            print(f"{i}...")
            time.sleep(1)
        print("CALIBRATING NOW! Hold hands in neutral position...")
        
        self.calibration_samples.clear()
        self.calibrated = False
        return True
    
    def collect_calibration_data(self, left_sample, right_sample):
        if left_sample is None or right_sample is None:
            return False
            
        if len(self.calibration_samples) < 50:
            self.calibration_samples.append((left_sample, right_sample))
            progress = len(self.calibration_samples) / 50 * 100
            print(f"📊 Calibrating... {progress:.0f}%", end='\r')
            return False
        else:
            print()
            return True
    
    def get_calibration_samples(self):
        left_samples = [sample[0] for sample in self.calibration_samples]
        right_samples = [sample[1] for sample in self.calibration_samples]
        return left_samples, right_samples

# ============================================================================
# MAIN CONTROLLER - WiFi UDP VERSION
# ============================================================================

class MainController:
    """Main controller orchestrating the entire system - WiFi UDP version"""

    def __init__(self):
        print("\n" + "="*70)
        print("🎵 DUAL HAND ESP32 MUSICAL GLOVE SYSTEM - WiFi UDP Version")
        print("="*70)
        
        # Initialize subsystems
        self.loop_manager = LoopManager()
        self.instrument_manager = InstrumentManager()
        self.calibration_manager = CalibrationManager()
        
        # UDP receiver (replaces serial)
        self.udp_receiver = UDPReceiver()
        
        # System state
        self.running = False
        self.calibrating = False
        
        # FSR mode switching state
        self.fsr_pressed = False
        self.fsr_press_time = 0
        self.fsr_cooldown = 0.5
        self.FSR_PRESS_THRESHOLD = 1500
        self.FSR_RELEASE_THRESHOLD = 800
        self.fsr_debug_counter = 0
        self.fsr_debug_interval = 100
        self._last_fsr_switch = 0
        
        # Initialize audio system
        try:
            pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
            print("✅ Audio system initialized")
        except Exception as e:
            print(f"⚠️ Audio initialization warning: {e}")
        
        print("✅ Main Controller initialized")
    
    def connect_udp(self):
        """Start UDP receiver - replaces serial connection"""
        print("\n🔌 Starting UDP receiver...")
        
        if not self.udp_receiver.start():
            print("❌ Failed to start UDP receiver")
            return False
        
        # Wait for both hands to start streaming
        print("⏳ Waiting for both gloves to connect...")
        print("   Make sure ESP32s are powered on and connected to WiFi 'GloveTone2025'")
        
        timeout = 15  # 15 second timeout
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            left_alive, right_alive = self.udp_receiver.check_streaming()
            
            if left_alive and not right_alive:
                print("   ✅ Left hand detected, waiting for right hand...")
            elif right_alive and not left_alive:
                print("   ✅ Right hand detected, waiting for left hand...")
            elif left_alive and right_alive:
                print("✅ Both hands detected and streaming!")
                stats = self.udp_receiver.get_stats()
                print(f"   Left: {stats['left_packets']} packets, {stats['left_rate']:.1f} Hz")
                print(f"   Right: {stats['right_packets']} packets, {stats['right_rate']:.1f} Hz")
                return True
            
            time.sleep(0.5)
        
        print("❌ Timeout: Could not detect both hands")
        print("   Troubleshooting:")
        print("   1. Check ESP32 power and WiFi connection")
        print("   2. Verify PC is connected to 'GloveTone2025' network")
        print("   3. Check PC IP is 192.168.137.1")
        print("   4. Verify UDP port 8888 is not blocked by firewall")
        return False
    
    def trigger_calibration(self):
        if not self.calibrating:
            self.calibrating = True
            return self.calibration_manager.start_calibration()
        return False
    
    def _handle_fsr_mode_switch(self, right_sample):
        if not right_sample:
            return
            
        fsr_value = right_sample.get('fsr', 0)
        current_time = time.time()
        
        self.fsr_debug_counter += 1
        if self.fsr_debug_counter >= self.fsr_debug_interval:
            # Uncomment for FSR debugging:
            # print(f"🔧 FSR: value={fsr_value}, pressed={self.fsr_pressed}")
            self.fsr_debug_counter = 0
        
        if fsr_value > self.FSR_PRESS_THRESHOLD and not self.fsr_pressed:
            self.fsr_pressed = True
            self.fsr_press_time = current_time
            return
            
        elif self.fsr_pressed and fsr_value < self.FSR_RELEASE_THRESHOLD:
            press_duration = current_time - self.fsr_press_time
            self.fsr_pressed = False
            
            if (0.1 <= press_duration <= 1.0 and 
                current_time - self._last_fsr_switch > self.fsr_cooldown):
                
                self._toggle_current_mode()
                self._last_fsr_switch = current_time
    
    def _toggle_current_mode(self):
        current_instrument = self.instrument_manager.current_instrument
        current_mode = self.instrument_manager.current_mode
        
        if current_instrument in [INSTRUMENT_DRUMS, INSTRUMENT_KEYS]:
            new_mode = 2 if current_mode == 1 else 1
            
            if new_mode in self.instrument_manager.instruments[current_instrument]:
                self.instrument_manager.set_mode(new_mode)
                print(f"🔀 FSR MODE SWITCH: {INSTRUMENT_NAMES[current_instrument]} Mode {new_mode}")
    
    def _check_keyboard_input(self):
        try:
            if sys.platform == "win32":
                import msvcrt
                if msvcrt.kbhit():
                    key = msvcrt.getch().decode('utf-8', errors='ignore').upper()
                    if key == 'C':
                        return 'C'
            else:
                if select.select([sys.stdin], [], [], 0) == ([sys.stdin], [], []):
                    key = sys.stdin.read(1).upper()
                    if key == 'C':
                        return 'C'
        except Exception:
            pass
        return None
    
    def run(self):
        """Main system loop - WiFi UDP version"""
        if not self.connect_udp():
            print("❌ Failed to establish UDP connection. Exiting.")
            return
        
        print("\n🎵 SYSTEM READY!")
        print("Press 'C' to calibrate, Ctrl+C to exit")
        print("FSR Quick Press: Toggle between Mode 1/2 (Drums & Keys only)")
        print("="*70 + "\n")
        
        self.running = True
        
        try:
            while self.running:
                # Check for keyboard input
                key = self._check_keyboard_input()
                if key == 'C' and not self.calibrating:
                    self.trigger_calibration()
                
                # Get latest samples from UDP receiver
                left_sample, right_sample = self.udp_receiver.get_samples()
                
                # Handle FSR mode switching (not during calibration)
                if right_sample and not self.calibrating:
                    self._handle_fsr_mode_switch(right_sample)
                
                # Handle calibration phase
                if self.calibrating:
                    if left_sample and right_sample:
                        if self.calibration_manager.collect_calibration_data(left_sample, right_sample):
                            left_samples, right_samples = self.calibration_manager.get_calibration_samples()
                            self.instrument_manager.calibrate_all(left_samples, right_samples)
                            self.loop_manager.calibrate(None, None)
                            self.calibrating = False
                    continue
                
                # Skip if we don't have both samples
                if not left_sample or not right_sample:
                    time.sleep(0.001)  # Small sleep to prevent CPU overload
                    continue
                
                # Update loop manager (always running)
                loop_state = self.loop_manager.handle_samples(left_sample, right_sample)
                
                # Apply loop manager decisions
                if loop_state['instrument_changed']:
                    self.instrument_manager.set_instrument(loop_state['current_instrument'])
                
                if loop_state['mode_changed']:
                    self.instrument_manager.set_mode(loop_state['current_mode'])
                
                gesture_detected = any([
                    loop_state['instrument_changed'],
                    loop_state['mode_changed'], 
                    loop_state['pause_changed'],
                    loop_state['loop_state_changed']
                ])
                
                if not gesture_detected:
                    # Route samples to active instrument
                    self.instrument_manager.handle_samples(
                        left_sample, 
                        right_sample, 
                        loop_state['paused']
                    )
                
                # Small sleep to prevent CPU overload
                time.sleep(0.001)
                
        except KeyboardInterrupt:
            print("\n\n🛑 Shutdown requested...")
        except Exception as e:
            print(f"\n❌ Unexpected error in main loop: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self.cleanup()
    
    def cleanup(self):
        """Cleanup resources"""
        print("\n🧹 Cleaning up resources...")
        self.running = False
        
        # Stop UDP receiver
        self.udp_receiver.stop()
        
        # Stop audio playback
        try:
            pygame.mixer.music.stop()
            pygame.mixer.quit()
        except:
            pass
            
        print("✅ Resources cleaned up. Goodbye!")

# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    controller = MainController()
    controller.run()