"""
FINAL Data Collection with Corruption Detection
- Reduced sample count (300 total is enough!)
- Detects ESP32 data corruption/freezing
- Validates data quality in real-time
"""

import serial
import time
import csv
import os
from datetime import datetime
import msvcrt
import numpy as np

# ============================================================================
# CONFIGURATION
# ============================================================================
SERIAL_PORT = 'COM3'
BAUD_RATE = 921600
DATASET_PATH = r"D:\Main project\guitar\dataset"
RECORDING_DURATION = 2.0
COUNTDOWN_SECONDS = 3

# REDUCED SAMPLE COUNT (300 is enough for simple up/down!)
SAMPLES_PER_CLASS = 150  # 150 each = 300 total

# DATA CORRUPTION DETECTION
ENABLE_CORRUPTION_CHECK = True
STUCK_VALUE_THRESHOLD = 10  # Consecutive identical values = stuck
ZERO_VALUE_THRESHOLD = 20   # Too many zeros = sensor dead

os.makedirs(DATASET_PATH, exist_ok=True)

# ============================================================================
# DATA CORRUPTION DETECTOR
# ============================================================================

class DataCorruptionDetector:
    """Detects ESP32 sending garbage/stuck/zero data"""
    
    def __init__(self):
        self.recent_samples = []
        self.max_history = 30
        self.warnings = []
    
    def add_sample(self, data):
        """Add sample and check for corruption"""
        # Store relevant fields for checking
        sample = {
            'ax': data['ax'],
            'ay': data['ay'],
            'az': data['az'],
            'gx': data['gx'],
            'gy': data['gy'],
            'gz': data['gz']
        }
        
        self.recent_samples.append(sample)
        
        # Keep only recent history
        if len(self.recent_samples) > self.max_history:
            self.recent_samples.pop(0)
        
        # Check for issues
        if len(self.recent_samples) >= 10:
            return self.check_corruption()
        
        return True, None
    
    def check_corruption(self):
        """Check for various corruption patterns"""
        issues = []
        
        # Check 1: Stuck values (same value repeated)
        for key in ['ax', 'ay', 'az', 'gx', 'gy', 'gz']:
            values = [s[key] for s in self.recent_samples[-STUCK_VALUE_THRESHOLD:]]
            if len(set(values)) == 1:  # All same value
                issues.append(f"{key} stuck at {values[0]:.2f}")
        
        # Check 2: All zeros
        recent_10 = self.recent_samples[-10:]
        zero_count = sum(
            1 for s in recent_10 
            if abs(s['ax']) < 0.01 and abs(s['ay']) < 0.01 and 
               abs(s['gx']) < 0.01 and abs(s['gy']) < 0.01
        )
        if zero_count >= 8:  # 80% zeros
            issues.append("Too many zeros (sensor dead?)")
        
        # Check 3: Unrealistic values
        recent = self.recent_samples[-1]
        if abs(recent['ax']) > 50 or abs(recent['ay']) > 50 or abs(recent['az']) > 50:
            issues.append(f"Unrealistic acceleration (ax={recent['ax']:.1f})")
        
        if abs(recent['gx']) > 100 or abs(recent['gy']) > 100 or abs(recent['gz']) > 100:
            issues.append(f"Unrealistic gyro (gz={recent['gz']:.1f})")
        
        # Check 4: No variance (flat signal)
        if len(self.recent_samples) >= 20:
            for key in ['ax', 'gx']:  # Check main motion axes
                values = [s[key] for s in self.recent_samples[-20:]]
                variance = np.var(values)
                if variance < 0.001:  # Almost no variance
                    issues.append(f"{key} has no variance (frozen?)")
        
        if issues:
            return False, issues
        
        return True, None
    
    def reset(self):
        """Clear history"""
        self.recent_samples = []
        self.warnings = []

# ============================================================================
# ROBUST SERIAL CONNECTION
# ============================================================================

def connect_esp32(port, baud_rate, timeout=30):
    """Connect to ESP32 with validation"""
    print("\n" + "="*60)
    print("CONNECTING TO ESP32")
    print("="*60)
    
    print(f"\nOpening serial port {port} at {baud_rate} baud...")
    
    ser = serial.Serial(
        port=port,
        baudrate=baud_rate,
        timeout=0.2,
        rtscts=False,
        dsrdtr=False,
        xonxoff=False
    )
    
    try:
        ser.setDTR(False)
        ser.setRTS(False)
    except:
        pass
    
    print("✓ Serial port opened")
    
    time.sleep(0.5)
    ser.reset_input_buffer()
    
    print("\nWaiting for data stream from ESP32...")
    print("(If nothing appears, press EN button on ESP32)")
    print()
    
    start_time = time.time()
    valid_lines = 0
    
    while True:
        elapsed = time.time() - start_time
        
        if elapsed > timeout:
            print("\n❌ TIMEOUT: No data received!")
            ser.close()
            return None
        
        try:
            raw = ser.readline()
            if not raw:
                continue
            
            line = raw.decode("utf-8", errors="ignore").strip()
            if not line:
                continue
            
            parts = line.split(",")
            
            if len(parts) == 12 and parts[0].isdigit():
                valid_lines += 1
                print(f"  ✓ Valid data: {line[:60]}...")
                
                if valid_lines >= 3:
                    print("\n" + "="*60)
                    print("✓ ESP32 CONNECTED & STREAMING!")
                    print("="*60)
                    return ser
            
            elif "READY" in line:
                print(f"  ✓ ESP32 ready: {line}")
                valid_lines += 1
            
            else:
                if len(line) > 0:
                    print(f"  ⚠ Junk: {line[:40]}")
        
        except Exception as e:
            continue

# ============================================================================
# DATA COLLECTOR WITH CORRUPTION DETECTION
# ============================================================================

class SmartDataCollector:
    def __init__(self, serial_connection):
        self.ser = serial_connection
        self.current_data = []
        self.corruption_detector = DataCorruptionDetector()
    
    def read_imu_data(self):
        """Read and validate IMU sample"""
        try:
            raw = self.ser.readline()
            if not raw:
                return None
            
            line = raw.decode("utf-8", errors="ignore").strip()
            if not line:
                return None
            
            parts = line.split(",")
            
            if len(parts) != 12 or not parts[0].isdigit():
                return None
            
            data = {
                'timestamp': int(parts[0]),
                'ax': float(parts[1]),
                'ay': float(parts[2]),
                'az': float(parts[3]),
                'gx': float(parts[4]),
                'gy': float(parts[5]),
                'gz': float(parts[6]),
                'qw': float(parts[7]),
                'qx': float(parts[8]),
                'qy': float(parts[9]),
                'qz': float(parts[10]),
                'fsr': int(parts[11])
            }
            
            # Check for corruption
            if ENABLE_CORRUPTION_CHECK:
                is_valid, issues = self.corruption_detector.add_sample(data)
                if not is_valid:
                    print(f"\n⚠️  DATA CORRUPTION DETECTED!")
                    for issue in issues:
                        print(f"    • {issue}")
                    print("    → ESP32 may need restart (press EN button)")
                    return None
            
            return data
        
        except (ValueError, IndexError):
            return None
        except Exception as e:
            return None
    
    def countdown(self, seconds):
        """Visual countdown"""
        print(f"\n{'='*60}")
        print("GET READY...")
        print(f"{'='*60}")
        
        for i in range(seconds, 0, -1):
            print(f"\n   >>> {i} <<<   ", end='', flush=True)
            time.sleep(1)
        
        print("\n\n   🔴 RECORDING NOW! PERFORM STROKE!")
        print(f"{'='*60}\n")
    
    def record_with_countdown(self, label, sample_num):
        """Record with countdown and corruption checking"""
        self.current_data = []
        self.corruption_detector.reset()  # Fresh check for each recording
        
        print(f"\n{'='*60}")
        print(f"   Recording {label.upper()}STROKE #{sample_num}")
        print(f"{'='*60}")
        
        # Countdown
        self.countdown(COUNTDOWN_SECONDS)
        
        # Record
        start_time = time.time()
        samples_recorded = 0
        corruption_warnings = 0
        
        while True:
            elapsed = time.time() - start_time
            
            if elapsed >= RECORDING_DURATION:
                break
            
            data = self.read_imu_data()
            if data:
                self.current_data.append({
                    'timestamp': data['timestamp'],
                    'ax': data['ax'],
                    'ay': data['ay'],
                    'az': data['az'],
                    'gx': data['gx'],
                    'gy': data['gy'],
                    'gz': data['gz'],
                    'qw': data['qw'],
                    'qx': data['qx'],
                    'qy': data['qy'],
                    'qz': data['qz'],
                    'label': label
                })
                samples_recorded += 1
            else:
                corruption_warnings += 1
        
        print(f"\n✓ Recording complete!")
        print(f"  Duration: {RECORDING_DURATION}s")
        print(f"  Samples: {samples_recorded}")
        print(f"  Sample rate: {samples_recorded/RECORDING_DURATION:.1f} Hz")
        
        # Quality check
        if samples_recorded < 100:
            print(f"  ⚠️  WARNING: Very few samples ({samples_recorded})")
            print(f"     Expected ~400 samples at 200Hz")
            choice = input("\n  Save anyway? (y/n): ")
            if choice.lower() != 'y':
                return False
        
        if corruption_warnings > 10:
            print(f"  ⚠️  WARNING: {corruption_warnings} corrupted samples detected")
            choice = input("\n  Save anyway? (y/n): ")
            if choice.lower() != 'y':
                return False
        
        if len(self.current_data) > 0:
            self.save_session(label, sample_num)
            return True
        else:
            print("  ❌ No data recorded!")
            return False
    
    def record_manual(self, label, sample_num):
        """Manual spacebar control with corruption checking"""
        self.current_data = []
        self.corruption_detector.reset()
        
        print(f"\n{'='*60}")
        print(f"   Recording {label.upper()}STROKE #{sample_num}")
        print(f"{'='*60}")
        print("\n   Press SPACE to START recording...")
        
        while True:
            if msvcrt.kbhit():
                key = msvcrt.getch()
                if key == b' ':
                    break
        
        print("\n   🔴 RECORDING! Perform stroke...")
        print("   Press SPACE to STOP")
        
        start_time = time.time()
        samples_recorded = 0
        corruption_warnings = 0
        
        while True:
            if msvcrt.kbhit():
                key = msvcrt.getch()
                if key == b' ':
                    break
            
            data = self.read_imu_data()
            if data:
                self.current_data.append({
                    'timestamp': data['timestamp'],
                    'ax': data['ax'],
                    'ay': data['ay'],
                    'az': data['az'],
                    'gx': data['gx'],
                    'gy': data['gy'],
                    'gz': data['gz'],
                    'qw': data['qw'],
                    'qx': data['qx'],
                    'qy': data['qy'],
                    'qz': data['qz'],
                    'label': label
                })
                samples_recorded += 1
            else:
                corruption_warnings += 1
        
        duration = time.time() - start_time
        print(f"\n✓ Recording complete!")
        print(f"  Duration: {duration:.2f}s")
        print(f"  Samples: {samples_recorded}")
        
        # Quality check
        if samples_recorded < 100:
            print(f"  ⚠️  WARNING: Very few samples")
            choice = input("\n  Save anyway? (y/n): ")
            if choice.lower() != 'y':
                return False
        
        if corruption_warnings > 10:
            print(f"  ⚠️  WARNING: {corruption_warnings} corrupted samples")
            choice = input("\n  Save anyway? (y/n): ")
            if choice.lower() != 'y':
                return False
        
        if len(self.current_data) > 0:
            self.save_session(label, sample_num)
            return True
        else:
            print("  ❌ No data recorded!")
            return False
    
    def save_session(self, label, sample_num):
        """Save to CSV"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{label}_stroke_{sample_num:04d}_{timestamp}.csv"
        filepath = os.path.join(DATASET_PATH, filename)
        
        with open(filepath, 'w', newline='') as f:
            fieldnames = ['timestamp', 'ax', 'ay', 'az', 'gx', 'gy', 'gz', 
                         'qw', 'qx', 'qy', 'qz', 'label']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(self.current_data)
        
        print(f"  💾 Saved: {filename}\n")
    
    def collect_dataset_countdown(self):
        """Countdown mode - 300 samples total"""
        print("\n" + "="*60)
        print("   COUNTDOWN MODE")
        print("="*60)
        print(f"Target: {SAMPLES_PER_CLASS} samples per class")
        print(f"Total: {SAMPLES_PER_CLASS * 2} samples")
        print()
        print("📊 Sample Size Analysis:")
        print("   • Each stroke: ~400-500 IMU samples")
        print("   • 150 strokes: ~60,000 raw samples")
        print("   • After windowing: ~6,000 training windows")
        print("   • Up/Down are clearly separable")
        print("   → 300 total samples is SUFFICIENT! ✅")
        print("="*60)
        
        down_count = 0
        up_count = 0
        
        try:
            while down_count < SAMPLES_PER_CLASS or up_count < SAMPLES_PER_CLASS:
                if down_count < SAMPLES_PER_CLASS:
                    input(f"\nPress ENTER for DOWNSTROKE [{down_count+1}/{SAMPLES_PER_CLASS}]...")
                    if self.record_with_countdown('down', down_count + 1):
                        down_count += 1
                
                if up_count < SAMPLES_PER_CLASS:
                    input(f"\nPress ENTER for UPSTROKE [{up_count+1}/{SAMPLES_PER_CLASS}]...")
                    if self.record_with_countdown('up', up_count + 1):
                        up_count += 1
                
                total = down_count + up_count
                target = SAMPLES_PER_CLASS * 2
                print(f"\n📊 Progress: {total}/{target} ({100*total/target:.1f}%)")
                print(f"   Down: {down_count}, Up: {up_count}")
        
        except KeyboardInterrupt:
            print("\n\n⚠ Collection interrupted")
        
        finally:
            print("\n" + "="*60)
            print("   COLLECTION COMPLETE")
            print("="*60)
            print(f"Total: {down_count + up_count}")
            print(f"Down: {down_count}, Up: {up_count}")
            print(f"\nEstimated training windows: ~{(down_count + up_count) * 20}")
            print("This is sufficient for high accuracy! ✅")
            print("="*60)
            self.ser.close()
    
    def collect_dataset_manual(self):
        """Manual mode - 300 samples total"""
        print("\n" + "="*60)
        print("   MANUAL MODE")
        print("="*60)
        print(f"Target: {SAMPLES_PER_CLASS} per class = {SAMPLES_PER_CLASS * 2} total")
        print("="*60)
        
        down_count = 0
        up_count = 0
        
        try:
            while down_count < SAMPLES_PER_CLASS or up_count < SAMPLES_PER_CLASS:
                if down_count < SAMPLES_PER_CLASS:
                    print(f"\n{'>'*60}")
                    print(f">>> DOWNSTROKE [{down_count+1}/{SAMPLES_PER_CLASS}]")
                    print(f"{'>'*60}")
                    if self.record_manual('down', down_count + 1):
                        down_count += 1
                    time.sleep(0.5)
                
                if up_count < SAMPLES_PER_CLASS:
                    print(f"\n{'>'*60}")
                    print(f">>> UPSTROKE [{up_count+1}/{SAMPLES_PER_CLASS}]")
                    print(f"{'>'*60}")
                    if self.record_manual('up', up_count + 1):
                        up_count += 1
                    time.sleep(0.5)
                
                total = down_count + up_count
                target = SAMPLES_PER_CLASS * 2
                print(f"\n📊 Progress: {total}/{target} ({100*total/target:.1f}%)")
                print(f"   Down: {down_count}, Up: {up_count}")
        
        except KeyboardInterrupt:
            print("\n\n⚠ Collection interrupted")
        
        finally:
            print("\n" + "="*60)
            print("   COLLECTION COMPLETE")
            print("="*60)
            print(f"Total: {down_count + up_count}")
            print(f"Down: {down_count}, Up: {up_count}")
            print("="*60)
            self.ser.close()

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("\n" + "="*60)
    print("   SMART DATA COLLECTOR v2.0")
    print("="*60)
    print("\n✨ IMPROVEMENTS:")
    print("   • Reduced to 300 samples (150 each)")
    print("   • Real-time corruption detection")
    print("   • Quality validation before saving")
    print("   • Detects stuck/frozen ESP32 data")
    print("="*60)
    
    # Connect
    ser = connect_esp32(SERIAL_PORT, BAUD_RATE, timeout=30)
    
    if ser is None:
        print("\n❌ Failed to connect")
        input("\nPress ENTER to exit...")
        exit(1)
    
    # Choose mode
    print("\nChoose collection mode:\n")
    print("  1. COUNTDOWN MODE")
    print("  2. MANUAL MODE")
    print()
    
    while True:
        choice = input("Enter choice (1 or 2): ").strip()
        if choice in ['1', '2']:
            break
        print("Invalid. Enter 1 or 2.")
    
    # Collect
    collector = SmartDataCollector(ser)
    
    if choice == '1':
        print("\n✓ COUNTDOWN MODE selected")
        time.sleep(1)
        collector.collect_dataset_countdown()
    else:
        print("\n✓ MANUAL MODE selected")
        time.sleep(1)
        collector.collect_dataset_manual()