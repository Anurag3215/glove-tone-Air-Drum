"""
Left Hand Serial Tester (COM3)
No external dependencies - uses built-in pyserial
"""
import serial
import time
LEFT_PORT = "COM3"
BAUD_RATE = 921600
print("="*70)
print("🟥 LEFT HAND SERIAL TESTER (COM3)")
print("="*70)
try:
    ser = serial.Serial(LEFT_PORT, BAUD_RATE, timeout=1)
    print(f"✅ Connected to {LEFT_PORT} at {BAUD_RATE} baud")
    print("Reading data...\n")
    
    count = 0
    while True:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        
        if line and ',' in line:
            parts = line.split(',')
            if len(parts) == 16:  # Left hand: 16 values (no FSR)
                count += 1
                
                # Extract data
                timestamp = parts[0]
                quat = parts[1:5]
                accel = parts[5:8]
                gyro = parts[8:11]
                flex = parts[11:16]
                
                # Print every 10 packets
                if count % 10 == 0:
                    print(f"Packet #{count}")
                    print(f"  Quat: w={quat[0]} x={quat[1]} y={quat[2]} z={quat[3]}")
                    print(f"  Flex: thumb={flex[0]} index={flex[1]} middle={flex[2]} ring={flex[3]} pinky={flex[4]}")
                    print()
        
        elif line and not line.startswith("I2C"):
            # Print non-data lines (status messages)
            print(f"[STATUS] {line}")
            
except serial.SerialException as e:
    print(f"❌ Serial error: {e}")
    print(f"\nTroubleshooting:")
    print(f"1. Check if {LEFT_PORT} is the correct port")
    print(f"2. Make sure ESP32 is connected via USB")
    print(f"3. Close Arduino IDE Serial Monitor if open")
    
except KeyboardInterrupt:
    print("\n\n👋 Stopped by user")
    
finally:
    try:
        ser.close()
    except:
        pass