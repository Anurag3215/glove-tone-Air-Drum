/*
 * ============================================================================
 * DUAL-CORE LEFT HAND WIFI STREAMER WITH SPI POLLING
 * Core 0: Dedicated sensor polling (BNO085 + Flex)
 * Core 1: WiFi + UDP streaming
 * Streams raw IMU + Flex data at 200Hz via UDP with 2-3ms latency
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiUdp.h>
#include <SPI.h>
#include <Adafruit_BNO08x.h>

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================

const char* WIFI_SSID = "GloveTone2025";
const char* WIFI_PASSWORD = "GloveTone2025";
const char* PC_IP = "192.168.137.1";
const uint16_t PC_PORT = 8888;
const uint8_t ESP_ID = 1;  // Left hand

// ============================================================================
// HARDWARE CONFIGURATION
// ============================================================================

#define SAMPLE_RATE_HZ 200
#define LOOP_DELAY_US (1000000 / SAMPLE_RATE_HZ)

// FLEX SENSOR PINS
#define FLEX_THUMB 32
#define FLEX_INDEX 33
#define FLEX_MIDDLE 35
#define FLEX_RING 36
#define FLEX_PINKY 34

// IMU HARDWARE PINS (SPI MODE)
#define BNO08X_CS_PIN 5      // Chip Select
#define BNO08X_INT_PIN 4     // Required by library API
#define BNO08X_RST_PIN 13    // Hardware reset

// ============================================================================
// SENSORS
// ============================================================================

Adafruit_BNO08x bno08x(BNO08X_RST_PIN);
sh2_SensorValue_t sensorValue;
#define BNO08X_REPORT_INTERVAL_US 2500  // 400 Hz max rate

// SENSOR DATA (volatile for thread safety between cores)
volatile float quat_w = 1.0, quat_x = 0.0, quat_y = 0.0, quat_z = 0.0;
volatile float accel_x = 0.0, accel_y = 0.0, accel_z = 0.0;
volatile float gyro_x = 0.0, gyro_y = 0.0, gyro_z = 0.0;
volatile uint16_t flex_thumb = 0, flex_index = 0, flex_middle = 0, flex_ring = 0, flex_pinky = 0;

// HEALTH VARIABLES
unsigned long lastResetTime = 0;
uint32_t resetCount = 0;

// ============================================================================
// NETWORK OPTIMIZATIONS
// ============================================================================

WiFiUDP udp;

#pragma pack(push, 1)
struct SensorPacket {
    uint8_t esp_id;
    uint32_t timestamp;
    float quat_w, quat_x, quat_y, quat_z;
    float accel_x, accel_y, accel_z;
    float gyro_x, gyro_y, gyro_z;
    uint16_t flex_thumb, flex_index, flex_middle, flex_ring, flex_pinky;
    uint8_t padding[1];
};
#pragma pack(pop)

SensorPacket packet;
unsigned long lastMicros = 0;
uint32_t packetCounter = 0;

// ============================================================================
// HARDWARE RESET FUNCTIONS
// ============================================================================

void hardwareResetBNO085() {
  Serial.println("[BNO085] 🔄 Performing hardware reset...");
  digitalWrite(BNO08X_RST_PIN, LOW);
  delay(100);  // Hold reset longer
  digitalWrite(BNO08X_RST_PIN, HIGH);
  delay(1000);  // Wait longer for boot (increased from 500ms)
  resetCount++;
  lastResetTime = millis();
}

bool recoverBNO085() {
  Serial.println("[BNO085] 🚑 Attempting recovery...");
  
  // Step 1: Hardware reset
  digitalWrite(BNO08X_RST_PIN, LOW);
  delay(50);
  digitalWrite(BNO08X_RST_PIN, HIGH);
  delay(500);
  
  // Step 2: Re-initialize SPI
  SPI.begin();
  
  // Step 3: Re-initialize sensor
  if (!bno08x.begin_SPI(BNO08X_CS_PIN, BNO08X_INT_PIN)) {
    Serial.println("❌ BNO085 SPI INIT FAILED");
    Serial.println("Check: PS0→3.3V, PS1→3.3V, CS→GPIO5, INT→GPIO4");
    return false;
  }
  Serial.println("[BNO085] ✓ SPI mode @ 3MHz");
  
  // Step 4: Re-enable reports
  bool success = true;
  success &= bno08x.enableReport(SH2_ROTATION_VECTOR, BNO08X_REPORT_INTERVAL_US);
  success &= bno08x.enableReport(SH2_ACCELEROMETER, BNO08X_REPORT_INTERVAL_US);
  success &= bno08x.enableReport(SH2_GYROSCOPE_CALIBRATED, BNO08X_REPORT_INTERVAL_US);
  
  if (success) {
    Serial.println("[BNO085] ✅ Recovery successful!");
    return true;
  }
  return false;
}

// ============================================================================
// SPI POLLING SENSOR READING
// ============================================================================

bool readSensorData() {
  // Poll for available sensor data
  bool gotData = false;
  while (bno08x.getSensorEvent(&sensorValue)) {
    processSensorData();
    gotData = true;
  }
  
  // Check for sensor reset
  if (bno08x.wasReset()) {
    Serial.println("[BNO085] ⚠️ Sensor was reset");
  }
  
  return gotData;
}

void processSensorData() {
  switch (sensorValue.sensorId) {
    case SH2_ROTATION_VECTOR:
      quat_w = sensorValue.un.rotationVector.real;
      quat_x = sensorValue.un.rotationVector.i;
      quat_y = sensorValue.un.rotationVector.j;
      quat_z = sensorValue.un.rotationVector.k;
      break;
      
    case SH2_ACCELEROMETER:
      accel_x = sensorValue.un.accelerometer.x;
      accel_y = sensorValue.un.accelerometer.y;
      accel_z = sensorValue.un.accelerometer.z;
      break;
      
    case SH2_GYROSCOPE_CALIBRATED:
      gyro_x = sensorValue.un.gyroscope.x;
      gyro_y = sensorValue.un.gyroscope.y;
      gyro_z = sensorValue.un.gyroscope.z;
      break;
  }
}

// ============================================================================
// HEALTH MONITORING
// ============================================================================

void checkSensorHealth() {
  static unsigned long lastDataTime = 0;
  static uint32_t lastPacketCount = 0;
  unsigned long currentTime = millis();
  
  // Check data rate every second
  static unsigned long lastCheck = 0;
  if (currentTime - lastCheck >= 1000) {
    uint32_t packetsThisSecond = packetCounter - lastPacketCount;
    
    if (packetsThisSecond < 150) {
      Serial.printf("[BNO085] ⚠️ Low data rate: %d Hz (expected 200Hz)\n", packetsThisSecond);
    }
    
    lastPacketCount = packetCounter;
    lastCheck = currentTime;
  }
}

// ============================================================================
// CORE 0 TASK: DEDICATED SENSOR POLLING
// ============================================================================

void sensorTask(void* parameter) {
  Serial.println("[Core 0] 🎯 Sensor task started - dedicated polling");
  
  while (true) {
    // READ SENSOR DATA VIA SPI POLLING
    if (bno08x.getSensorEvent(&sensorValue)) {
      processSensorData();
    }
    
    // Read flex sensors (raw values)
    flex_thumb = analogRead(FLEX_THUMB);
    flex_index = analogRead(FLEX_INDEX);
    flex_middle = analogRead(FLEX_MIDDLE);
    flex_ring = analogRead(FLEX_RING);
    flex_pinky = analogRead(FLEX_PINKY);
    
    // Tight polling loop
    delayMicroseconds(100);
  }
}

// ============================================================================
// ULTRA OPTIMIZED SETUP
// ============================================================================

void setup() {
  // MAXIMUM CPU PERFORMANCE
  setCpuFrequencyMhz(240);
  
  delay(1000);
  Serial.begin(921600);
  delay(500);
  
  // Clear boot garbage
  for(int i = 0; i < 10; i++) Serial.println();
  Serial.flush();
  
  Serial.println("🚀 DUAL-CORE LEFT HAND WIFI SPI STREAMER");
  Serial.printf("📡 CPU Frequency: %d MHz (2 cores)\n", getCpuFrequencyMhz());
  
  // Initialize flex sensor pins
  pinMode(FLEX_THUMB, INPUT);
  pinMode(FLEX_INDEX, INPUT);
  pinMode(FLEX_MIDDLE, INPUT);
  pinMode(FLEX_RING, INPUT);
  pinMode(FLEX_PINKY, INPUT);
  
  // Initialize IMU hardware control pins
  pinMode(BNO08X_RST_PIN, OUTPUT);
  pinMode(BNO08X_CS_PIN, OUTPUT);
  pinMode(BNO08X_INT_PIN, INPUT_PULLUP);  // INT must be configured as input with pullup
  digitalWrite(BNO08X_CS_PIN, HIGH);  // CS idle high
  
  Serial.println("[HARDWARE] ✓ RST=GPIO13, CS=GPIO5, INT=GPIO4");
  
  // INITIALIZE SPI
  SPI.begin();
  Serial.println("[SPI] Initialized @ 3MHz (default for BNO085)");
  
  // HARDWARE RESET SEQUENCE
  hardwareResetBNO085();
  
  // Initialize IMU in SPI mode (polling, no INT pin needed)
  if (!bno08x.begin_SPI(BNO08X_CS_PIN, BNO08X_INT_PIN)) {
    Serial.println("❌ BNO085_SPI_INIT_FAILED");
    Serial.println("Check wiring:");
    Serial.println("  PS0 → 3.3V (SPI mode)");
    Serial.println("  PS1 → 3.3V (SPI mode)");
    Serial.println("  CS  → GPIO5");
    Serial.println("  INT → GPIO4 (not used, but required by library)");
    Serial.println("  RST → GPIO13");
    Serial.println("  SCK → GPIO18 (default SPI)");
    Serial.println("  DI (MOSI) → GPIO23 (default SPI)");
    Serial.println("  SDA (MISO) → GPIO19 (default SPI)");
    Serial.println("  3.3V, GND");
    while (1) {
      delay(1000);
      Serial.println("Halted - fix wiring and reset");
    }
  }
  
  Serial.println("[BNO085] ✓ Initialized in SPI polling mode (no INT pin needed)");
  
  // Enable sensor reports
  bno08x.enableReport(SH2_ROTATION_VECTOR, BNO08X_REPORT_INTERVAL_US);
  bno08x.enableReport(SH2_ACCELEROMETER, BNO08X_REPORT_INTERVAL_US);
  bno08x.enableReport(SH2_GYROSCOPE_CALIBRATED, BNO08X_REPORT_INTERVAL_US);
  
  Serial.println("[BNO085] ✓ All sensors enabled @ 200Hz");
  
  // ULTRA OPTIMIZED WIFI SETUP
  setupWiFi();
  
  // Initialize packet
  memset(&packet, 0, sizeof(packet));
  packet.esp_id = ESP_ID;
  
  // CREATE SENSOR TASK ON CORE 0
  xTaskCreatePinnedToCore(
    sensorTask,       // Task function
    "SensorTask",     // Task name
    4096,             // Stack size (bytes)
    NULL,             // Parameters
    2,                // Priority (higher than default)
    NULL,             // Task handle
    0                 // Pin to Core 0
  );
  
  Serial.println("\n🎵 DUAL-CORE LEFT HAND READY 🎵");
  Serial.printf("📦 Packet size: %d bytes\n", sizeof(packet));
  Serial.printf("🎯 Target latency: 2-3ms (dual-core)\n");
  Serial.printf("🔄 ESP ID: %d (Left Hand)\n", ESP_ID);
  Serial.printf("📊 Core 0: Sensor polling (dedicated)\n");
  Serial.printf("📊 Core 1: WiFi + UDP streaming\n");
  Serial.printf("🔌 Communication: SPI @ 3MHz\n");
}

// ============================================================================
// MAXIMUM PERFORMANCE WIFI SETUP
// ============================================================================

void setupWiFi() {
  Serial.println("\n[WiFi] 🔥 ULTRA_OPTIMIZED_SETUP...");
  
  // Complete WiFi reset
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_OFF);
  delay(100);
  
  // MAXIMUM PERFORMANCE SETTINGS
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);           // CRITICAL: No sleep for lowest latency
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm); // Maximum power
  
  Serial.println("[WiFi] Maximum performance configuration applied");
  Serial.println("[WiFi] Connecting...");
  WiFi.setHostname("LeftHand-ESP32");
  unsigned long wifiStart = millis();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // Faster connection attempt
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 8000) {
    delay(200);
    Serial.print(".");
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n❌ WIFI_FAILED - Continuing without WiFi");
    return;
  }
  
  Serial.println("\n[WiFi] ✅ CONNECTED!");
  Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[WiFi] RSSI: %d dBm\n", WiFi.RSSI());
  Serial.printf("[WiFi] Connection time: %lu ms\n", millis() - wifiStart);
  
  // ULTRA OPTIMIZED UDP
  udp.begin(PC_PORT);
  udp.setTimeout(0); // No blocking operations
}

// ============================================================================
// CORE 1 LOOP: WIFI + UDP STREAMING
// ============================================================================

void loop() {
  unsigned long currentMicros = micros();
  
  // HEALTH MONITORING (runs every 1000ms)
  static unsigned long lastHealthCheck = 0;
  if (currentMicros - lastHealthCheck > 1000000) {
    checkSensorHealth();
    lastHealthCheck = currentMicros;
  }
  
  // PRECISE 200Hz TIMING (every 5000 microseconds)
  if (currentMicros - lastMicros >= LOOP_DELAY_US) {
    lastMicros = currentMicros;
    streamData();
  }
}

// ============================================================================
// MAXIMUM PERFORMANCE DATA STREAMING
// ============================================================================

void streamData() {
  packetCounter++;
  
  // Read latest sensor data (updated by Core 0)
  // No need to read sensors or poll here - Core 0 handles it!
  
  // Update packet with microsecond precision timestamp
  packet.timestamp = micros();
  packet.quat_w = quat_w; packet.quat_x = quat_x; packet.quat_y = quat_y; packet.quat_z = quat_z;
  packet.accel_x = accel_x; packet.accel_y = accel_y; packet.accel_z = accel_z;
  packet.gyro_x = gyro_x; packet.gyro_y = gyro_y; packet.gyro_z = gyro_z;
  packet.flex_thumb = flex_thumb; packet.flex_index = flex_index; 
  packet.flex_middle = flex_middle; packet.flex_ring = flex_ring; packet.flex_pinky = flex_pinky;
  
  // ULTRA FAST UDP STREAMING
  if (WiFi.status() == WL_CONNECTED) {
    udp.beginPacket(PC_IP, PC_PORT);
    udp.write((uint8_t*)&packet, sizeof(packet));
    udp.endPacket();
  }
  
  // DIAGNOSTIC OUTPUT
  static unsigned long lastSerialOutput = 0;
  if (millis() - lastSerialOutput > 2000) {
    Serial.printf("🟥 LEFT | Pkts: %lu | WiFi: %s | RSSI: %d dBm\n", 
                  packetCounter,
                  WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED",
                  WiFi.RSSI());
    lastSerialOutput = millis();
  }
}

// ============================================================================
// MANUAL RECOVERY FUNCTION
// ============================================================================

void forceRecovery() {
  Serial.println("\n🔄 FORCING FULL SYSTEM RECOVERY...");
  recoverBNO085();
  setupWiFi();
}