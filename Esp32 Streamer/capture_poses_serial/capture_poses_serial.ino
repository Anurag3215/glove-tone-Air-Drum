int indexPin = 34;
int middlePin = 35;
int ringPin = 32;
int littlePin = 33;

void setup() {
  Serial.begin(115200);
}

void loop() {

  int indexValue = analogRead(indexPin);
  int middleValue = analogRead(middlePin);
  int ringValue = analogRead(ringPin);
  int littleValue = analogRead(littlePin);

  Serial.print("Index: ");
  Serial.print(indexValue);

  Serial.print(" | Middle: ");
  Serial.print(middleValue);

  Serial.print(" | Ring: ");
  Serial.print(ringValue);

  Serial.print(" | Little: ");
  Serial.println(littleValue);

  delay(100);
}