#include <SPI.h>
#include <LoRa.h>
#include <DHT.h>

// ── Pin Definitions ───────────────────────────────────────────────────────────
#define LORA_NSS  5
#define LORA_RST  14
#define LORA_DIO0 2
#define DHTPIN    25
#define DHTTYPE   DHT22
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
#define NODE_A_OFFLINE_MS      30000UL // 6 missed heartbeats (5s each) = Offline

// ── Globals ───────────────────────────────────────────────────────────────────
DHT dht(DHTPIN, DHTTYPE);
float         trustBC                = 1.00f;
unsigned long lastSensorReadTime     = 0;
unsigned long lastNodeARecvTime      = 0;   
unsigned long lastStandaloneSendTime = 0;
unsigned long systemBootTime         = 0;
bool          nodeAOnline            = false;
unsigned long sequenceID             = 1;

// Filtered Sensor Values
float ownTopDistFiltered = BIN_MAX_RANGE;
float ownMidDistFiltered = BIN_MAX_RANGE;
int   ownFill = 5, ownGas = 0;
float ownTemp = 25.0f, ownRisk = 0.0f;

// ── Utility Functions ─────────────────────────────────────────────────────────
uint8_t calculateCRC(const char* str) {
    uint8_t crc = 0;
    while (*str) crc ^= *str++;
    return crc;
}

// Validates CRC of incoming packet format: Payload,CRC
// Returns true if valid, and modifies payload string by terminating before the CRC.
bool validateAndStripCRC(char* packet) {
  char* lastComma = strrchr(packet, ',');
  if (!lastComma) return false;
  
  *lastComma = '\0'; // Split payload and CRC
  uint8_t calculatedCrc = calculateCRC(packet);
  
  // Read hex CRC
  uint8_t receivedCrc = (uint8_t)strtol(lastComma + 1, NULL, 16);
  if (calculatedCrc != receivedCrc) {
    *lastComma = ','; // Restore just in case
    return false;
  }
  return true;
}

// ── Sensor Reading & Filtering ────────────────────────────────────────────────
float getMedianDistance(int trigPin, int echoPin) {
  float readings[5];
  int validCount = 0;
  for (int i = 0; i < 5; i++) {
    digitalWrite(trigPin, LOW); delayMicroseconds(2);
    digitalWrite(trigPin, HIGH); delayMicroseconds(10);
    digitalWrite(trigPin, LOW);
    long dur = pulseIn(echoPin, HIGH, 30000);
    if (dur > 0) {
      float dist = dur * 0.0343f / 2.0f;
      if (dist >= 2.0f && dist <= 400.0f) readings[validCount++] = dist;
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
  ownTopDistFiltered = (0.2f * rawTop) + (0.8f * ownTopDistFiltered);
  ownMidDistFiltered = (0.2f * rawMid) + (0.8f * ownMidDistFiltered);
  ownTopDistFiltered = constrain(ownTopDistFiltered, 2.0f, BIN_MAX_RANGE);
  ownMidDistFiltered = constrain(ownMidDistFiltered, 2.0f, BIN_MAX_RANGE);
  
  bool topCovered = (ownTopDistFiltered <= SENSOR_COVERED_THRESH);
  bool midCovered = (ownMidDistFiltered <= SENSOR_COVERED_THRESH);
  
  if (topCovered) {
    float ratio = constrain((SENSOR_COVERED_THRESH - ownTopDistFiltered) / (SENSOR_COVERED_THRESH - 2.0f), 0.0f, 1.0f);
    ownFill = (int)(85.0f + (ratio * 15.0f));
  } 
  else if (midCovered) {
    float ratio = constrain((BIN_MAX_RANGE - ownTopDistFiltered) / (BIN_MAX_RANGE - SENSOR_COVERED_THRESH), 0.0f, 1.0f);
    ownFill = (int)(50.0f + (ratio * 35.0f));
  } 
  else {
    float ratio = constrain((BIN_MAX_RANGE - ownMidDistFiltered) / (BIN_MAX_RANGE - SENSOR_COVERED_THRESH), 0.0f, 1.0f);
    ownFill = max(5, (int)(5.0f + (ratio * 45.0f)));
  }
  
  ownGas = analogRead(MQ5_PIN);
  float t = dht.readTemperature();
  if (!isnan(t)) ownTemp = t;
  ownRisk = (ownFill * 0.1f) + ((ownGas / 1000.0f) * 1.5f) + (ownTemp * 0.2f);
}

bool waitForACK(const char* targetPrefix) {
  unsigned long t0 = millis();
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
      if (strncmp(rxBuf, targetPrefix, strlen(targetPrefix)) == 0) return true;
    }
    delay(10);
  }
  return false;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  while (!Serial);
  Serial.println("\n[NODE BOOT] === NODE B INITIALIZING ===");
  pinMode(TOP_TRIG, OUTPUT); pinMode(TOP_ECHO, INPUT);
  pinMode(MID_TRIG, OUTPUT); pinMode(MID_ECHO, INPUT);
  pinMode(MQ5_PIN,  INPUT);
  dht.begin();
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) { Serial.println("[ERROR] LoRa FAILED!"); while (1); }
  Serial.println("[INFO] LoRa OK");
  systemBootTime       = millis();
  lastNodeARecvTime    = 0;         
  lastStandaloneSendTime = millis(); 

  // Immediate HELLO announcement
  char helloPkt[16];
  snprintf(helloPkt, sizeof(helloPkt), "HELLO,B");
  LoRa.beginPacket(); LoRa.print(helloPkt); LoRa.endPacket();
  LoRa.receive();
  Serial.println("[HELLO SENT] HELLO,B -> Instant Gateway Recognition");
  Serial.println("==========================================");
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();
  
  if (now - lastSensorReadTime >= 1000) {
    lastSensorReadTime = now;
    readAndFilterSensors();
  }
  
  // Track Node A Heartbeat Online Status
  if (lastNodeARecvTime == 0) {
    nodeAOnline = false;
  } else if (now - lastNodeARecvTime > NODE_A_OFFLINE_MS) {
    if (nodeAOnline) {
      nodeAOnline = false;
      Serial.println("\n[NODE OFFLINE] Node A went silent for 30s.");
    }
  } else {
    nodeAOnline = true;
  }
  
  // Standalone Mode (If Node A is completely unplugged/dead)
  bool bootWaitDone      = (now - systemBootTime > NODE_A_OFFLINE_MS);
  bool aConfirmedOffline = (!nodeAOnline && lastNodeARecvTime != 0);   
  bool aNeverHeard       = (!nodeAOnline && lastNodeARecvTime == 0 && bootWaitDone);
  
  if ((aConfirmedOffline || aNeverHeard) && (now - lastStandaloneSendTime >= 5000)) {
    lastStandaloneSendTime = now;
    char payload[64];
    snprintf(payload, sizeof(payload), "B,%lu,%d,%d,%.1f,%.1f,%.3f", 
             sequenceID, ownFill, ownGas, ownTemp, ownRisk, trustBC);
    uint8_t crc = calculateCRC(payload);
    char txPacket[80];
    snprintf(txPacket, sizeof(txPacket), "%s,%02X", payload, crc);

    Serial.println("\n==========================================");
    Serial.print("[TRACE] Node B TX SEQ "); Serial.println(sequenceID);
    Serial.println("==========================================");
    Serial.print("[STANDALONE MODE] TX: "); Serial.println(txPacket);
    
    LoRa.beginPacket(); LoRa.print(txPacket); LoRa.endPacket();
    LoRa.receive();

    // Check for explicit "ACK,B,SEQ"
    char expectedAck[32];
    snprintf(expectedAck, sizeof(expectedAck), "ACK,B,%lu", sequenceID);
    
    unsigned long ackStart = millis();
    bool ack = waitForACK(expectedAck);
    unsigned long ackDelay = millis() - ackStart;
    
    float oldTrust = trustBC;
    // Smooth Moving Average Trust (approx 50 packets)
    trustBC = (0.02f * (ack ? 1.0f : 0.0f)) + (0.98f * trustBC);
    trustBC = constrain(trustBC, 0.00f, 1.00f);

    if (!ack) {
      Serial.println("\n[TRUST DECREASE] Reason: ACK timeout from Gateway");
    }

    Serial.println("\n## Node B");
    Serial.print("Packet Sent: "); Serial.println(txPacket);
    Serial.print("Sequence: "); Serial.println(sequenceID);
    Serial.print("ACK Received: "); Serial.println(ack ? "YES" : "NO");
    if (ack) {
      Serial.print("ACK Delay: "); Serial.print(ackDelay); Serial.println(" ms");
    }
    Serial.print("Trust Before: "); Serial.println(oldTrust, 3);
    Serial.print("Trust After: "); Serial.println(trustBC, 3);
    sequenceID++;
  }

  // 4. Listen for LoRa Packets (Node A Relays & HELLO)
  int ps = LoRa.parsePacket();
  if (ps) {
    char rxBuf[128] = {0};
    int len = 0;
    while (LoRa.available() && len < 127) {
      char c = (char)LoRa.read();
      if (c != '\r' && c != '\n') rxBuf[len++] = c;
    }
    rxBuf[len] = '\0';

    if (strncmp(rxBuf, "HELLO,A", 7) == 0) {
      lastNodeARecvTime = now;
      nodeAOnline = true;
      Serial.println("\n[PACKET RECEIVED] HELLO,A -> Node A is alive.");
      return;
    }

    // Is it an A packet that hasn't been appended yet?
    if ((strncmp(rxBuf, "A,", 2) == 0 || strncmp(rxBuf, "DA,", 3) == 0) && strstr(rxBuf, ",B,") == NULL) {
      
      // Validate CRC
      if (!validateAndStripCRC(rxBuf)) {
        Serial.println("\n[ERROR] Invalid CRC from Node A. Packet rejected.");
        return;
      }

      lastNodeARecvTime = now;
      nodeAOnline       = true;

      // Only forward standard Relay packets, ignore Direct packets to avoid collision with Gateway's ACK
      if (strncmp(rxBuf, "DA,", 3) == 0) {
        Serial.println("\n[IGNORED] Direct packet. Letting Gateway ACK it directly.");
        
        // Wait for Gateway's ACK to finish over the air to prevent collision
        delay(500); 

        // Send Node B's own data as a Standalone packet so Node C knows Node B is alive!
        char bPayload[64];
        snprintf(bPayload, sizeof(bPayload), "B,%lu,%d,%d,%.1f,%.1f,%.3f", 
                 sequenceID, ownFill, ownGas, ownTemp, ownRisk, trustBC);
        uint8_t crc = calculateCRC(bPayload);
        char bTxPacket[80];
        snprintf(bTxPacket, sizeof(bTxPacket), "%s,%02X", bPayload, crc);
        
        Serial.println("[STANDALONE FALLBACK] Sending Node B data: " + String(bTxPacket));
        LoRa.beginPacket(); LoRa.print(bTxPacket); LoRa.endPacket();
        LoRa.receive();
        
        // Wait for ACK for B
        char expectedAck[32];
        snprintf(expectedAck, sizeof(expectedAck), "ACK,B,%lu", sequenceID);
        
        unsigned long ackStart = millis();
        bool ack = waitForACK(expectedAck);
        unsigned long ackDelay = millis() - ackStart;
        
        float oldTrust = trustBC;
        trustBC = (0.02f * (ack ? 1.0f : 0.0f)) + (0.98f * trustBC);
        trustBC = constrain(trustBC, 0.00f, 1.00f);
        
        Serial.println("[TIMING] Packet Sent");
        Serial.print("[TIMING] ACK "); Serial.print(ack ? "Received: " : "Missed: "); Serial.println(expectedAck);
        if (ack) { Serial.print("[TIMING] ACK Delay: "); Serial.print(ackDelay); Serial.println(" ms"); }
        Serial.print("[TRUST] Trust Before: "); Serial.print(oldTrust, 3);
        Serial.print(" | Trust After: "); Serial.println(trustBC, 3);
        sequenceID++;

        return;
      }

      Serial.println("\n==========================================");
      // Parse aSeq from rxBuf (Format: "A,SEQ,...") BEFORE printing and waiting for ACK
      char tempBuf[128];
      strncpy(tempBuf, rxBuf, sizeof(tempBuf));
      char* token = strtok(tempBuf, ","); // "A"
      token = strtok(NULL, ",");          // "SEQ"
      unsigned long aSeq = 0;
      if (token != NULL) aSeq = strtoul(token, NULL, 10);
      
      Serial.print("[TRACE] Node B RX SEQ "); Serial.println(aSeq);
      Serial.println("==========================================");
      Serial.println("[PACKET RECEIVED] Valid Node A payload.");

      // Build Combined Payload: rxBuf (Node A data) + Node B data
      char combinedPayload[128];
      snprintf(combinedPayload, sizeof(combinedPayload), "%s,B,%lu,%d,%d,%.1f,%.1f,%.3f",
               rxBuf, sequenceID, ownFill, ownGas, ownTemp, ownRisk, trustBC);

      // Final CRC
      uint8_t finalCrc = calculateCRC(combinedPayload);
      char txPacket[150];
      snprintf(txPacket, sizeof(txPacket), "%s,%02X", combinedPayload, finalCrc);

      Serial.print("[TRACE] Node B Forward SEQ "); Serial.println(aSeq);
      Serial.print("[PACKET FORWARDED] "); Serial.println(txPacket);

      LoRa.beginPacket(); LoRa.print(txPacket); LoRa.endPacket();
      LoRa.receive();

      char expectedAck[32];
      snprintf(expectedAck, sizeof(expectedAck), "ACK,A,%lu", aSeq);

      unsigned long ackStart = millis();
      bool ack = waitForACK(expectedAck); // Wait for exact sequence-locked ACK
      unsigned long ackDelay = millis() - ackStart;
      
      float oldTrust = trustBC;
      trustBC = (0.02f * (ack ? 1.0f : 0.0f)) + (0.98f * trustBC);
      trustBC = constrain(trustBC, 0.00f, 1.00f);

      if (!ack) {
        Serial.println("\n[TRUST DECREASE] Reason: ACK timeout from Gateway");
      }

      Serial.println("\n## Node B");
      Serial.print("Packet Received SEQ: "); Serial.println(aSeq);
      Serial.print("Packet Forwarded: YES\n");
      Serial.print("ACK Forwarded: "); Serial.println(ack ? "YES" : "NO");
      if (ack) {
        Serial.print("ACK Delay: "); Serial.print(ackDelay); Serial.println(" ms");
      }
      Serial.print("Trust Before: "); Serial.println(oldTrust, 3);
      Serial.print("Trust After: "); Serial.println(trustBC, 3);
      sequenceID++;

      // FORWARD ACK TO NODE A
      if (ack) {
        delay(50); // Give Node A time to be ready

        char ackForward[32];
        snprintf(ackForward, sizeof(ackForward), "ACK,A,%lu", aSeq);
        LoRa.beginPacket(); LoRa.print(ackForward); LoRa.endPacket();
        LoRa.receive();
        Serial.print("[ACK FORWARDED TO A] "); Serial.println(ackForward);
      }
    }
  }
}
