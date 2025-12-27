// Upload this to LEFT hand ESP32
// Open Serial Monitor at 115200 baud
// Hold pose, press button to capture

#include <Wire.h>
#include <SPI.h>
#include <Adafruit_BNO08x.h>

// IMU HARDWARE PINS (SPI MODE)
#define BNO08X_CS_PIN 5      // Chip Select
#define BNO08X_INT_PIN 4     // Required by library API
#define BNO08X_RST_PIN 13    // Hardware reset
#define BUTTON_PIN 0         // Boot button

Adafruit_BNO08x bno08x(BNO08X_RST_PIN);
sh2_SensorValue_t sensorValue;

// Quaternion values
float qw = 1.0f, qx = 0.0f, qy = 0.0f, qz = 0.0f;

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BNO08X_RST_PIN, OUTPUT);
  pinMode(BNO08X_CS_PIN, OUTPUT);
  pinMode(BNO08X_INT_PIN, INPUT_PULLUP);
  digitalWrite(BNO08X_CS_PIN, HIGH);
  
  delay(1000);
  Serial.println("\n\n=================================");
  Serial.println("ESP32 POSE CAPTURE - BNO085");
  Serial.println("=================================");
  
  // Hardware reset
  digitalWrite(BNO08X_RST_PIN, LOW);
  delay(100);
  digitalWrite(BNO08X_RST_PIN, HIGH);
  delay(500);
  
  // Initialize SPI
  SPI.begin();
  
  // Initialize BNO085
  if (!bno08x.begin_SPI(BNO08X_CS_PIN, BNO08X_INT_PIN)) {
    Serial.println("Failed to find BNO085!");
    while (1) delay(10);
  }
  
  Serial.println("BNO085 Found!");
  
  // Enable rotation vector (quaternion)
  bno08x.enableReport(SH2_ROTATION_VECTOR, 5000); // 200 Hz
  
  Serial.println("\nHold your hand in a pose, then press BOOT button to capture");
  Serial.println("Format: {qw, qx, qy, qz}");
  Serial.println("=================================\n");
  
  delay(500);
}

void loop() {
  // Read BNO085 sensor data
  if (bno08x.getSensorEvent(&sensorValue)) {
    if (sensorValue.sensorId == SH2_ROTATION_VECTOR) {
      qw = sensorValue.un.rotationVector.real;
      qx = sensorValue.un.rotationVector.i;
      qy = sensorValue.un.rotationVector.j;
      qz = sensorValue.un.rotationVector.k;
    }
  }
  
  // Show current values every 500ms
  static unsigned long lastPrint = 0;
  unsigned long now = millis();
  if (now - lastPrint >= 500) {
    Serial.print("Current: ");
    Serial.print("w="); Serial.print(qw, 3);
    Serial.print(" x="); Serial.print(qx, 3);
    Serial.print(" y="); Serial.print(qy, 3);
    Serial.print(" z="); Serial.println(qz, 3);
    lastPrint = now;
  }
  
  // Check button press
  static bool lastButton = HIGH;
  bool button = digitalRead(BUTTON_PIN);
  
  if (button == LOW && lastButton == HIGH) {
    delay(50); // Debounce
    
    Serial.println("\n*** POSE CAPTURED! ***");
    Serial.print("{");
    Serial.print(qw, 6); Serial.print("f, ");
    Serial.print(qx, 6); Serial.print("f, ");
    Serial.print(qy, 6); Serial.print("f, ");
    Serial.print(qz, 6); Serial.print("f");
    Serial.println("}");
    Serial.println("Copy this to loop.h!");
    Serial.println();
    
    delay(1000); // Prevent multiple captures
  }
  
  lastButton = button;
  
  delay(10);
}
