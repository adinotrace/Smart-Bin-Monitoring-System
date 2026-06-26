#include <SPI.h>
#include <LoRa.h>
#include <DHT.h>

// ── Pin Definitions ───────────────────────────────────────────────────────────
#define LORA_NSS  5
#define LORA_RST  14
#define LORA_DIO0 2
#define DHTPIN    25
#define DHTTYPE   DHT11
#define TOP_TRIG  26
#define TOP_ECHO  27
#define MID_TRIG  32
#define MID_ECHO  33
#define MQ5_PIN   34

// ── Constants ─────────────────────────────────────────────────────────────────
#define LORA_FREQ              433E6
#define BIN_MAX_RANGE          40.0f
#define SENSOR_COVERED_THRESH  15.0f
#define SENSOR_BLOCKED_THRESH  5.0f

#define TRUST_INC              0.005f
#define TRUST_DEC              0.01f
#define ACK_TIMEOUT_MS         7000UL
#define MISSES_FOR_DIRECT      3      // 3 misses (~15s) switches to DA
#define HITS_FOR_RELAY         2      // 2 hits in DA mode reverts to Relay

#define SENSOR_READ_INTERVAL   1000UL
#define LORA_TX_INTERVAL       5000UL

// ── Globals ───────────────────────────────────────────────────────────────────
DHT dht(DHTPIN, DHTTYPE);
float         trustAB          = 1.00f;
unsigned long lastSendTime     = 0;
unsigned long lastSensorRead   = 0;
unsigned long sequenceID       = 1;

// Routing state
int           consecutiveMisses = 0;
int           consecutiveHits   = 0;
bool          bOfflineMode      = false;

// Filtered Sensor Values
float topDistFiltered = BIN_MAX_RANGE;
float midDistFiltered = BIN_MAX_RANGE;

// ── Utility Functions ─────────────────────────────────────────────────────────
uint8_t calculateCRC(const char* str) {
    uint8_t crc = 0;
    while (*str) crc ^= *str++;
    return crc;
}

// ── Sensor Reading & Filtering ────────────────────────────────────────────────
float getMedianDistance(int trigPin, int echoPin) {
  float readings[5];
  int validCount = 0;
  for (int i = 0; i < 5; i++) {
    digitalWrite(trigPin, LOW);  delayMicroseconds(2);
    digitalWrite(trigPin, HIGH); delayMicroseconds(10);
    digitalWrite(trigPin, LOW);
    long dur = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
    if (dur > 0) {
      float dist = dur * 0.0343f / 2.0f;
      if (dist >= 2.0f && dist <= 400.0f) {
        readings[validCount++] = dist;
      }
    }
    delay(5);
  }
  if (validCount == 0) return BIN_MAX_RANGE;
  
  for (int i = 0; i < validCount - 1; i++) {
    for (int j = i + 1; j < validCount; j++) {
      if (readings[i] > readings[j]) {
        float temp = readings[i];
        readings[i] = readings[j];
        readings[j] = temp;
      }
    }
  }
  return readings[validCount / 2];
}

void readAndFilterSensors() {
  float rawTop = getMedianDistance(TOP_TRIG, TOP_ECHO);
  float rawMid = getMedianDistance(MID_TRIG, MID_ECHO);
  
  // Exponential Moving Average (EMA) for smoothness
  topDistFiltered = (0.2f * rawTop) + (0.8f * topDistFiltered);
  midDistFiltered = (0.2f * rawMid) + (0.8f * midDistFiltered);
  
  topDistFiltered = constrain(topDistFiltered, 2.0f, BIN_MAX_RANGE);
  midDistFiltered = constrain(midDistFiltered, 2.0f, BIN_MAX_RANGE);
}

int calculateFill(float topDist, float midDist) {
  bool midCovered = (midDist <= SENSOR_COVERED_THRESH);
  bool topCovered = (topDist <= SENSOR_COVERED_THRESH);

  if (topCovered) {
    // 85% to 100% based on top sensor (15.0 down to 2.0)
    float ratio = constrain((SENSOR_COVERED_THRESH - topDist) / (SENSOR_COVERED_THRESH - 2.0f), 0.0f, 1.0f);
    return (int)(85.0f + (ratio * 15.0f));
  } 
  else if (midCovered) {
    // 50% to 85% based on top sensor approach (40.0 down to 15.0)
    float ratio = constrain((BIN_MAX_RANGE - topDist) / (BIN_MAX_RANGE - SENSOR_COVERED_THRESH), 0.0f, 1.0f);
    return (int)(50.0f + (ratio * 35.0f));
  } 
  else {
    // 5% to 50% based on mid sensor approach (40.0 down to 15.0)
    float ratio = constrain((BIN_MAX_RANGE - midDist) / (BIN_MAX_RANGE - SENSOR_COVERED_THRESH), 0.0f, 1.0f);
    return max(5, (int)(5.0f + (ratio * 45.0f)));
  }
}

float calculateRisk(int fill, int gas, float temp) {
  return (fill * 0.1f) + ((gas / 1000.0f) * 1.5f) + (temp * 0.2f);
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  while (!Serial);
  Serial.println("\n[NODE BOOT] === NODE A INITIALIZING ===");
  pinMode(TOP_TRIG, OUTPUT); pinMode(TOP_ECHO, INPUT);
  pinMode(MID_TRIG, OUTPUT); pinMode(MID_ECHO, INPUT);
  pinMode(MQ5_PIN,  INPUT);
  dht.begin();
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) { Serial.println("[ERROR] LoRa FAILED!"); while (1); }
  Serial.println("[INFO] LoRa OK");

  // Immediate HELLO announcement
  char helloPkt[16];
  snprintf(helloPkt, sizeof(helloPkt), "HELLO,A");
  LoRa.beginPacket(); LoRa.print(helloPkt); LoRa.endPacket();
  LoRa.receive();
  Serial.println("[HELLO SENT] HELLO,A -> Instant Gateway Recognition");
  Serial.println("==========================================");
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();
  
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;
    readAndFilterSensors();
  }
  
  if (now - lastSendTime < LORA_TX_INTERVAL) return;
  lastSendTime = now;
  
  int   fill = calculateFill(topDistFiltered, midDistFiltered);
  int   gas  = analogRead(MQ5_PIN);
  float temp = dht.readTemperature();
  if (isnan(temp)) temp = 25.0f;
  float risk = calculateRisk(fill, gas, temp);

  // Build Packet Format: TYPE,SEQ,Fill,Gas,Temp,Risk,Trust
  char payload[64];
  const char* typeStr = bOfflineMode ? "DA" : "A";
  snprintf(payload, sizeof(payload), "%s,%lu,%d,%d,%.1f,%.1f,%.3f", 
           typeStr, sequenceID, fill, gas, temp, risk, trustAB);
           
  // Append CRC Checksum
  uint8_t crc = calculateCRC(payload);
  char txPacket[80];
  snprintf(txPacket, sizeof(txPacket), "%s,%02X", payload, crc);
  
  Serial.println("\n==========================================");
  Serial.print("[TRACE] Node A TX SEQ "); Serial.println(sequenceID);
  Serial.println("==========================================");
  Serial.print("[TX] Mode:   "); Serial.println(bOfflineMode ? "DIRECT (A->C)" : "RELAY (A->B->C)");
  Serial.print("[TX] Packet: "); Serial.println(txPacket);
  
  LoRa.beginPacket();
  LoRa.print(txPacket);
  LoRa.endPacket();
  LoRa.receive(); // Put radio into continuous receive mode!
  
  // Wait for ACK
  unsigned long t0 = millis();
  bool ackReceived = false;
  bool relayedAck  = false;
  
  char expectedAckA[32];
  char expectedAckDA[32];
  snprintf(expectedAckA, sizeof(expectedAckA), "ACK,A,%lu", sequenceID);
  snprintf(expectedAckDA, sizeof(expectedAckDA), "ACK,DA,%lu", sequenceID);
  
  while (millis() - t0 < ACK_TIMEOUT_MS) {
    int ps = LoRa.parsePacket();
    if (ps) {
      char rxBuf[64] = {0};
      int len = 0;
      while (LoRa.available() && len < 63) {
        char c = (char)LoRa.read();
        if (c != '\r' && c != '\n') rxBuf[len++] = c;
      }
      rxBuf[len] = '\0';
      
      if (strncmp(rxBuf, expectedAckA, strlen(expectedAckA)) == 0) {
        ackReceived = true; relayedAck = true; break;
      }
      if (strncmp(rxBuf, expectedAckDA, strlen(expectedAckDA)) == 0) {
        ackReceived = true; relayedAck = false; break;
      }
    }
    delay(10);
  }
  
  unsigned long ackDelay = millis() - t0;
  
  if (ackReceived) {
    consecutiveMisses = 0;
    
    // Routing Logic Recovery
    if (bOfflineMode) {
      if (relayedAck) {
        bOfflineMode = false;
        consecutiveHits = 0;
        Serial.println("[ROUTING] Node B recovered -> RELAY MODE");
      } else {
        consecutiveHits++;
        if (consecutiveHits >= HITS_FOR_RELAY) {
          bOfflineMode = false;
          consecutiveHits = 0;
          Serial.println("[ROUTING] Direct mode stable, probing RELAY MODE");
        }
      }
    } else {
      consecutiveHits = 0;
    }
  } else {
    consecutiveHits = 0;
    consecutiveMisses++;
    Serial.println("\n[TRUST DECREASE] Reason: ACK timeout (7000ms)");

    if (!bOfflineMode && consecutiveMisses >= MISSES_FOR_DIRECT) {
      bOfflineMode = true;
      consecutiveMisses = 0;
      Serial.println("[ROUTING] Node B failed -> DIRECT MODE");
    }
  }

  float oldTrust = trustAB;
  // Smooth Moving Average Trust (approx 50 packets)
  trustAB = (0.02f * (ackReceived ? 1.0f : 0.0f)) + (0.98f * trustAB);
  trustAB = constrain(trustAB, 0.00f, 1.00f);

  Serial.println("\n## Node A");
  Serial.print("Packet Sent: "); Serial.println(txPacket);
  Serial.print("Sequence: "); Serial.println(sequenceID);
  Serial.print("ACK Received: "); Serial.println(ackReceived ? "YES" : "NO");
  if (ackReceived) {
    Serial.print("ACK Delay: "); Serial.print(ackDelay); Serial.println(" ms");
  }
  Serial.print("Trust Before: "); Serial.println(oldTrust, 3);
  Serial.print("Trust After: "); Serial.println(trustAB, 3);
  
  sequenceID++;
}
