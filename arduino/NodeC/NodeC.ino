#include <SPI.h>
#include <LoRa.h>
#include <DHT.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

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
#define GARBAGE_THRESHOLD      15.0f
#define SENSOR_COVERED_THRESH  15.0f
#define BIN_MAX_RANGE          40.0f
#define OFFLINE_TIMEOUT_MS     180000UL // 3 minutes for NodeB completely dead
#define SENSOR_READ_INTERVAL   1000UL
#define NETWORK_PUB_INTERVAL   5000UL
#define TS_RATE_LIMIT_MS       15000UL
#define HB_OFFLINE_MS          30000UL
#define HB_WARNING_MS          15000UL

// ── WiFi & API ────────────────────────────────────────────────────────────────
const char* ssid     = "PAR";
const char* password = "Coldwater*64";
const char* tsApiKey = "6YYQ2J68W9HZXJ1Y";
const char* tsUrl    = "http://api.thingspeak.com/update";
const char* mqttBroker = "broker.hivemq.com";
const int   mqttPort   = 1883;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// ── FreeRTOS Globals ──────────────────────────────────────────────────────────
TaskHandle_t ThingSpeakTask;
volatile bool triggerThingSpeak = false;

// ── Globals ───────────────────────────────────────────────────────────────────
DHT dht(DHTPIN, DHTTYPE);

unsigned long lastSensorReadTime     = 0;
unsigned long lastNetworkPublishTime = 0;
unsigned long lastThingSpeakSendTime = 0;

unsigned long lastNodeARecvTime = 0;
unsigned long lastNodeBRecvTime = 0;
unsigned long lastNodeASeq      = 0;
unsigned long lastNodeBSeq      = 0;

bool nodeAOnline    = false;
bool nodeBOnline    = false;
bool nodeCOnline    = true;
bool gatewayHasData = false;

// Node A
int aFill = 0, aGas = 0;
float aTemp = 0.0f, aRisk = 0.0f, aTrust = 1.00f;
const char* nodeAStatus = "OFFLINE";
const char* activePathA = "Unknown";
unsigned long aExpectedSeq = 0, aPacketsReceived = 0, aPacketsLost = 0;

// Node B
int bFill = 0, bGas = 0;
float bTemp = 0.0f, bRisk = 0.0f, bTrust = 1.00f;
const char* nodeBStatus = "OFFLINE";
const char* activePathB = "Unknown";
unsigned long bExpectedSeq = 0, bPacketsReceived = 0, bPacketsLost = 0;

// Node C Filtered Values
float cTopDistFiltered = BIN_MAX_RANGE;
float cMidDistFiltered = BIN_MAX_RANGE;
int cFill = 5, cGas = 0;
float cTemp = 25.0f, cRisk = 0.0f, cTrust = 1.00f;

// ── Utility Functions ─────────────────────────────────────────────────────────
uint8_t calculateCRC(const char* str) {
    uint8_t crc = 0;
    while (*str) crc ^= *str++;
    return crc;
}

bool validateAndStripCRC(char* packet) {
  char* lastComma = strrchr(packet, ',');
  if (!lastComma) return false;
  *lastComma = '\0';
  uint8_t calculated = calculateCRC(packet);
  uint8_t received = (uint8_t)strtol(lastComma + 1, NULL, 16);
  if (calculated != received) {
    *lastComma = ',';
    return false;
  }
  return true;
}

void updateStats(const char* label, unsigned long seq, unsigned long& expectedSeq, unsigned long& packetsReceived, unsigned long& packetsLost) {
  unsigned long missing = 0;
  bool isDupe = false;
  bool isOoO = false;

  if (seq <= 2 && expectedSeq > 10) {
    // Reboot detected!
    packetsReceived = 0;
    packetsLost = 0;
    expectedSeq = 0; // Will be set in the block below
    Serial.print("\n[STATS "); Serial.print(label); Serial.println("] REBOOT DETECTED. Counters Reset.");
  }

  unsigned long prevExpected = expectedSeq;

  if (expectedSeq == 0) { // First packet or reboot
    packetsReceived = 1;
    packetsLost = 0;
    expectedSeq = seq + 1;
  } else if (seq == expectedSeq) {
    packetsReceived++;
    expectedSeq++;
  } else if (seq > expectedSeq) {
    missing = seq - expectedSeq;
    packetsLost += missing;
    packetsReceived++;
    expectedSeq = seq + 1;
    Serial.print("\n[PACKET LOST +"); Serial.print(missing); 
    Serial.print("] Reason: Missing sequence gaps (Expected "); Serial.print(prevExpected);
    Serial.print(", Got "); Serial.print(seq); Serial.println(")");
  } else if (seq < expectedSeq) {
    if (seq == expectedSeq - 1) {
      isDupe = true;
      Serial.println("\n[PACKET IGNORED] Reason: Duplicate packet");
    } else {
      isOoO = true;
      Serial.println("\n[PACKET IGNORED] Reason: Out-of-order packet");
    }
  }

  float rel = (packetsReceived + packetsLost > 0) ? (packetsReceived / (float)(packetsReceived + packetsLost)) * 100.0f : 100.0f;
  
  Serial.print("[STATS "); Serial.print(label); Serial.print("] Prev: "); 
  Serial.print(prevExpected > 0 ? prevExpected - 1 : 0);
  Serial.print(" | Curr: "); Serial.print(seq);
  Serial.print(" | Missing: "); Serial.print(missing);
  Serial.print(" | Dupe: "); Serial.print(isDupe ? 1 : 0);
  Serial.print(" | OoO: "); Serial.print(isOoO ? 1 : 0);
  Serial.print(" | Recv: "); Serial.print(packetsReceived);
  Serial.print(" | Lost: "); Serial.print(packetsLost);
  Serial.print(" | Rel: "); Serial.print(rel, 1); Serial.println("%");
}

// ── Sensor Reading (AJ-SR04M Optimized) ───────────────────────────────────────
float getMedianDistance(int trigPin, int echoPin) {
  float readings[7];
  int validCount = 0;
  for (int i = 0; i < 7; i++) {
    digitalWrite(trigPin, LOW); delayMicroseconds(2);
    digitalWrite(trigPin, HIGH); delayMicroseconds(10);
    digitalWrite(trigPin, LOW);
    // AJ-SR04M has a larger blanking zone, timeout 40ms
    long dur = pulseIn(echoPin, HIGH, 40000); 
    if (dur > 0) {
      float dist = dur * 0.0343f / 2.0f;
      if (dist >= 2.0f && dist < 500.0f) readings[validCount++] = dist;
    }
    delay(10); // Wait for acoustic decay
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

void readOwnSensors() {
  float rawTop = getMedianDistance(TOP_TRIG, TOP_ECHO);
  float rawMid = getMedianDistance(MID_TRIG, MID_ECHO);

  cTopDistFiltered = (0.2f * rawTop) + (0.8f * cTopDistFiltered);
  cMidDistFiltered = (0.2f * rawMid) + (0.8f * cMidDistFiltered);
  cTopDistFiltered = constrain(cTopDistFiltered, 2.0f, BIN_MAX_RANGE);
  cMidDistFiltered = constrain(cMidDistFiltered, 2.0f, BIN_MAX_RANGE);

  bool topCovered = (cTopDistFiltered <= SENSOR_COVERED_THRESH);
  bool midCovered = (cMidDistFiltered <= SENSOR_COVERED_THRESH);

  if (topCovered) {
    float ratio = constrain((SENSOR_COVERED_THRESH - cTopDistFiltered) / (SENSOR_COVERED_THRESH - 2.0f), 0.0f, 1.0f);
    cFill = (int)(85.0f + (ratio * 15.0f));
  } else if (midCovered) {
    float ratio = constrain((BIN_MAX_RANGE - cTopDistFiltered) / (BIN_MAX_RANGE - SENSOR_COVERED_THRESH), 0.0f, 1.0f);
    cFill = (int)(50.0f + (ratio * 35.0f));
  } else {
    float ratio = constrain((BIN_MAX_RANGE - cMidDistFiltered) / (BIN_MAX_RANGE - SENSOR_COVERED_THRESH), 0.0f, 1.0f);
    cFill = max(5, (int)(5.0f + (ratio * 45.0f)));
  }

  cGas = analogRead(MQ5_PIN);
  float t = dht.readTemperature();
  if (!isnan(t)) cTemp = t;
  cRisk = (cFill * 0.1f) + ((cGas / 1000.0f) * 1.5f) + (cTemp * 0.2f);

  Serial.println("\n==============================");
  Serial.println("NODE C SENSOR DEBUG");
  Serial.println("==============================");
  Serial.print("Top Raw Distance: "); Serial.println(rawTop);
  Serial.print("Mid Raw Distance: "); Serial.println(rawMid);
  Serial.print("Top Filtered Distance: "); Serial.println(cTopDistFiltered);
  Serial.print("Mid Filtered Distance: "); Serial.println(cMidDistFiltered);
  Serial.print("Top Covered: "); Serial.println(topCovered ? "YES" : "NO");
  Serial.print("Mid Covered: "); Serial.println(midCovered ? "YES" : "NO");
  Serial.print("Calculated Fill %: "); Serial.println(cFill);
  Serial.print("Gas: "); Serial.println(cGas);
  Serial.print("Temperature: "); Serial.println(cTemp);
  Serial.print("Risk: "); Serial.println(cRisk);
  Serial.print("Current Algorithm Branch: ");
  if (topCovered) {
    Serial.println("TOP RANGE");
  } else if (midCovered) {
    Serial.println("MID RANGE");
  } else {
    Serial.println("BOTTOM RANGE");
  }
  Serial.println("==============================\n");
}

const char* getStatusString(float risk, bool online) {
  if (!online) return "Offline";
  if (risk < 10.0f) return "Normal";
  if (risk <= 15.0f) return "Warning";
  return "Critical";
}

// ── Networking ────────────────────────────────────────────────────────────────
void setupWiFi() {
  Serial.print("\n[WIFI] Connecting to "); Serial.println(ssid);
  WiFi.begin(ssid, password);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500); Serial.print("."); attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) Serial.println("\n[WIFI] Connected.");
  else Serial.println("\n[WIFI] Failed.");
}

void setupMQTT() {
  mqttClient.setServer(mqttBroker, mqttPort);
}

void maintainConnections() {
  if (WiFi.status() != WL_CONNECTED) {
    setupWiFi();
  }
  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
    Serial.print("[MQTT] Connecting...");
    String clientId = "SmartBin-Gateway-" + String(random(0xffff), HEX);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" Connected.");
    } else {
      Serial.println(" Failed.");
    }
  }
}

void publishMQTTNode(const char* topic, int fill, int gas, float temp, float risk, float trust, bool online, const char* hbStatus, const char* path) {
  char json[384];
  snprintf(json, sizeof(json), 
    "{\"fill\":%d,\"gas\":%d,\"temperature\":%.1f,\"risk\":%.1f,\"trust\":%.2f,\"status\":\"%s\",\"hbStatus\":\"%s\",\"path\":\"%s\",\"timestamp\":%lu}",
    fill, gas, temp, risk, trust, getStatusString(risk, online), hbStatus, path, millis() / 1000);
  mqttClient.publish(topic, json);
}

void publishNetworkStatus() {
  float aRel = (aPacketsReceived + aPacketsLost > 0) ? (aPacketsReceived / (float)(aPacketsReceived + aPacketsLost)) * 100.0f : 100.0f;
  float bRel = (bPacketsReceived + bPacketsLost > 0) ? (bPacketsReceived / (float)(bPacketsReceived + bPacketsLost)) * 100.0f : 100.0f;

  char json[256];
  snprintf(json, sizeof(json),
    "{\"trustAB\":%.2f,\"trustBC\":%.2f,\"nodeAStatus\":\"%s\",\"nodeBStatus\":\"%s\",\"nodeCStatus\":\"ONLINE\",\"aRecv\":%lu,\"aLost\":%lu,\"aRel\":%.1f,\"bRecv\":%lu,\"bLost\":%lu,\"bRel\":%.1f}",
    aTrust, bTrust, nodeAStatus, nodeBStatus, aPacketsReceived, aPacketsLost, aRel, bPacketsReceived, bPacketsLost, bRel);
  mqttClient.publish("smartbin_revat_2026/network", json);
}

void publishAllMQTT() {
  maintainConnections();
  if (!mqttClient.connected()) return;
  publishMQTTNode("smartbin_revat_2026/A", aFill, aGas, aTemp, aRisk, aTrust, strcmp(nodeAStatus, "OFFLINE") != 0, nodeAStatus, activePathA);
  
  const char* displayPathB = (strcmp(nodeBStatus, "OFFLINE") == 0) ? "Offline" : activePathB;
  publishMQTTNode("smartbin_revat_2026/B", bFill, bGas, bTemp, bRisk, bTrust, strcmp(nodeBStatus, "OFFLINE") != 0, nodeBStatus, displayPathB);
  
  publishMQTTNode("smartbin_revat_2026/C", cFill, cGas, cTemp, cRisk, cTrust, true, "ONLINE", "Gateway");
  publishNetworkStatus();
  Serial.println("[MQTT PUBLISHED] All nodes updated.");
}

void ThingSpeakTaskCode(void * pvParameters) {
  for(;;) {
    if (triggerThingSpeak) {
      triggerThingSpeak = false;
      unsigned long tsStart = millis();

      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        char url[512];
        snprintf(url, sizeof(url), 
          "%s?api_key=%s&field1=%.1f&field2=%.2f&field3=%.1f&field4=%.2f&field5=%.1f&field6=%.2f&field7=%.2f&field8=%.2f",
          tsUrl, tsApiKey, 
          strcmp(nodeAStatus, "OFFLINE") != 0 ? aRisk : 0.0f, strcmp(nodeAStatus, "OFFLINE") != 0 ? aTrust : 0.0f,
          strcmp(nodeBStatus, "OFFLINE") != 0 ? bRisk : 0.0f, strcmp(nodeBStatus, "OFFLINE") != 0 ? bTrust : 0.0f,
          cRisk, cTrust,
          strcmp(nodeAStatus, "OFFLINE") != 0 ? aTrust : 0.0f, strcmp(nodeBStatus, "OFFLINE") != 0 ? bTrust : 0.0f);
      
        http.begin(url);
        http.setTimeout(3000);
        int code = http.GET();
        if (code > 0) {
          Serial.print("[THINGSPEAK UPLOADED] Code: "); Serial.println(code);
        } else {
          Serial.print("[THINGSPEAK ERROR] "); Serial.println(http.errorToString(code));
        }
        http.end();
      }
      unsigned long duration = millis() - tsStart;
      Serial.print("[TIMING] ThingSpeak request duration: "); Serial.print(duration); Serial.println(" ms");
    }
    vTaskDelay(100 / portTICK_PERIOD_MS); // Sleep for 100ms before checking again to yield Core 0
  }
}

// ── Parsing Helpers ───────────────────────────────────────────────────────────
void sendAck(const char* prefix, unsigned long seq) {
  char ack[32];
  snprintf(ack, sizeof(ack), "%s,%lu", prefix, seq);
  delay(50); // Required tiny delay for Node B to switch to RX
  LoRa.beginPacket(); LoRa.print(ack); LoRa.endPacket();
  LoRa.receive(); // Instantly put radio into continuous receive mode in the background!
  Serial.print("[ACK SENT] "); Serial.println(ack);
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  while (!Serial);
  Serial.println("\n[NODE BOOT] === NODE C GATEWAY INITIALIZING ===");

  pinMode(TOP_TRIG, OUTPUT); pinMode(TOP_ECHO, INPUT);
  pinMode(MID_TRIG, OUTPUT); pinMode(MID_ECHO, INPUT);
  pinMode(MQ5_PIN, INPUT);
  dht.begin();

  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) { Serial.println("[ERROR] LoRa FAILED!"); while (1); }
  Serial.println("[INFO] LoRa OK");

  setupWiFi();
  setupMQTT();
  
  // Start ThingSpeak Task on Core 0 (Wi-Fi Core)
  xTaskCreatePinnedToCore(ThingSpeakTaskCode, "ThingSpeakTask", 10000, NULL, 1, &ThingSpeakTask, 0);
  
  Serial.println("===========================================");
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Non-blocking Reconnects (do NOT block LoRa in background)
  if (!mqttClient.connected()) {
    if (mqttClient.connect("GatewayNodeC")) Serial.println("[MQTT] Connected.");
  }
  mqttClient.loop();

  // Heartbeat Tracking Engine
  if (lastNodeARecvTime != 0) {
    if (now - lastNodeARecvTime > HB_OFFLINE_MS) nodeAStatus = "OFFLINE";
    else if (now - lastNodeARecvTime > HB_WARNING_MS) nodeAStatus = "WARNING";
    else nodeAStatus = "ONLINE";
  }
  
  if (lastNodeBRecvTime != 0) {
    if (now - lastNodeBRecvTime > HB_OFFLINE_MS) nodeBStatus = "OFFLINE";
    else if (now - lastNodeBRecvTime > HB_WARNING_MS) nodeBStatus = "WARNING";
    else nodeBStatus = "ONLINE";
  }

  // Node C Sensor Loop
  if (now - lastSensorReadTime >= 1000) {
    lastSensorReadTime = now;
    readOwnSensors();
  }

  // Periodic Publishes (every 5s to keep dashboard alive)
  if (gatewayHasData && (now - lastNetworkPublishTime >= NETWORK_PUB_INTERVAL)) {
    lastNetworkPublishTime = now;
    publishAllMQTT();
    if (now - lastThingSpeakSendTime >= TS_RATE_LIMIT_MS) {
      lastThingSpeakSendTime = now;
      triggerThingSpeak = true;
    }
  }

  // LoRa Processing
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    unsigned long rxTimestamp = millis();
    char rxBuf[256] = {0};
    int len = 0;
    while (LoRa.available() && len < 255) {
      char c = (char)LoRa.read();
      if (c != '\r' && c != '\n') rxBuf[len++] = c;
    }
    Serial.println("\n==========================================");
    Serial.print("[TRACE] Node C RX. Raw: "); Serial.println(rxBuf);
    Serial.println("==========================================");

    // Skip CRC validation for System packets
    if (strncmp(rxBuf, "ACK", 3) == 0 || strncmp(rxBuf, "HELLO", 5) == 0) {
      Serial.println("[INFO] System packet ignored for telemetry.");
      // Do not strip or validate CRC for ACKs and HELLOs
    } else {
      bool crcValid = validateAndStripCRC(rxBuf);
      Serial.print("CRC Result: "); Serial.println(crcValid ? "PASS" : "FAIL");
      if (!crcValid) {
        Serial.println("\n[PACKET DROPPED] Reason: CRC Rejection");
        LoRa.receive();
        return;
      }
    }

    // Tokenize
    char* tokens[15];
    int tokenCount = 0;
    char* ptr = strtok(rxBuf, ",");
    while (ptr != NULL && tokenCount < 15) {
      tokens[tokenCount++] = ptr;
      ptr = strtok(NULL, ",");
    }

    // HELLO Packets
    if (tokenCount >= 2 && strcmp(tokens[0], "HELLO") == 0) {
      if (strcmp(tokens[1], "A") == 0) {
        lastNodeARecvTime = now; nodeAStatus = "ONLINE"; activePathA = "A -> B -> C";
        aExpectedSeq = 0; aPacketsReceived = 0; aPacketsLost = 0;
        Serial.println("[HELLO] Node A Booted.");
      } else if (strcmp(tokens[1], "B") == 0) {
        lastNodeBRecvTime = now; nodeBStatus = "ONLINE"; activePathB = "Standalone B -> C";
        bExpectedSeq = 0; bPacketsReceived = 0; bPacketsLost = 0;
        Serial.println("[HELLO] Node B Booted.");
      }
      publishAllMQTT();
      LoRa.receive();
      return;
    }

    bool shouldAck = false;
    unsigned long ackSeq = 0;
    const char* ackPrefix = "";
    
    // Relay Mode: A + B
    if (tokenCount == 14 && strcmp(tokens[0], "A") == 0 && strcmp(tokens[7], "B") == 0) {
      unsigned long aSeq = strtoul(tokens[1], NULL, 10);
      updateStats("A", aSeq, aExpectedSeq, aPacketsReceived, aPacketsLost);

      unsigned long bSeq = strtoul(tokens[8], NULL, 10);
      if (bSeq != lastNodeBSeq || bSeq <= 2) {
        updateStats("B", bSeq, bExpectedSeq, bPacketsReceived, bPacketsLost);
        lastNodeBSeq = bSeq;
      }

      aFill = atoi(tokens[2]); aGas = atoi(tokens[3]); aTemp = atof(tokens[4]); aRisk = atof(tokens[5]); aTrust = atof(tokens[6]);
      bFill = atoi(tokens[9]); bGas = atoi(tokens[10]); bTemp = atof(tokens[11]); bRisk = atof(tokens[12]); bTrust = atof(tokens[13]);
      
      lastNodeARecvTime = now; lastNodeBRecvTime = now;
      nodeAStatus = "ONLINE"; nodeBStatus = "ONLINE";
      activePathA = "A -> B -> C"; activePathB = "B -> C";
      gatewayHasData = true;
      
      shouldAck = true; ackPrefix = "ACK,A"; ackSeq = aSeq;
    }
    // Direct Mode: DA
    else if (tokenCount == 7 && strcmp(tokens[0], "DA") == 0) {
      unsigned long aSeq = strtoul(tokens[1], NULL, 10);
      updateStats("A", aSeq, aExpectedSeq, aPacketsReceived, aPacketsLost);

      aFill = atoi(tokens[2]); aGas = atoi(tokens[3]); aTemp = atof(tokens[4]); aRisk = atof(tokens[5]); aTrust = atof(tokens[6]);

      lastNodeARecvTime = now; nodeAStatus = "ONLINE"; activePathA = "A -> C"; gatewayHasData = true;
      
      shouldAck = true; ackPrefix = "ACK,DA"; ackSeq = aSeq;
    }
    // 4. Standalone Node B: B, B_SEQ, BFill, BGas, BTemp, BRisk, BTrust
    else if (tokenCount == 7 && strcmp(tokens[0], "B") == 0) {
      unsigned long bSeq = strtoul(tokens[1], NULL, 10);
      if (bSeq != lastNodeBSeq || bSeq <= 2) {
        lastNodeBSeq = bSeq;
        updateStats("B", bSeq, bExpectedSeq, bPacketsReceived, bPacketsLost);

        bFill = atoi(tokens[2]); bGas = atoi(tokens[3]);
        bTemp = atof(tokens[4]); bRisk = atof(tokens[5]); bTrust = 1.00f; // Standalone Trust

        lastNodeBRecvTime = now; nodeBStatus = "ONLINE"; activePathB = "Standalone B -> C";
        gatewayHasData = true;
        
        shouldAck = true; ackPrefix = "ACK,B"; ackSeq = bSeq;
      } else {
        Serial.println("[WARNING] Duplicate Sequence ID from Node B. Packet ignored.");
      }
    } else {
      Serial.print("Token Count: "); Serial.println(tokenCount);
      Serial.println("\n[PACKET DROPPED] Reason: Unknown format / Token count mismatch");
    }

    if (shouldAck) {
      // 1. Send ACK immediately before doing anything heavy!
      sendAck(ackPrefix, ackSeq);
      unsigned long ackLatency = millis() - rxTimestamp;
      
      // 2. Perform heavy network operations
      unsigned long mqttStart = millis();
      publishAllMQTT();
      lastNetworkPublishTime = millis(); // Reset the periodic timer!
      unsigned long mqttDuration = millis() - mqttStart;
      
      // 3. Update Dashboard Stats
      unsigned long dashboardStart = millis();
      if (now - lastThingSpeakSendTime >= TS_RATE_LIMIT_MS) {
        lastThingSpeakSendTime = now;
        triggerThingSpeak = true;
      }
      unsigned long dashboardDuration = millis() - dashboardStart;
      
      Serial.println("\n## Node C");
      Serial.print("Packet Received SEQ: "); Serial.println(ackSeq);
      Serial.println("CRC Result: PASS");
      Serial.print("ACK Sent: "); Serial.println(ackPrefix);
      Serial.print("ACK Latency: "); Serial.print(ackLatency); Serial.println(" ms");
      Serial.print("MQTT Publish Time: "); Serial.print(mqttDuration); Serial.println(" ms");
      Serial.print("ThingSpeak Task Triggered: "); Serial.println(triggerThingSpeak ? "YES" : "NO");
      Serial.println("Statistics Updated: YES");
    }
  }
}
