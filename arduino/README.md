# ESP32 + LoRa Trust-Based Adaptive Waste Management System

This directory contains the complete Arduino IDE source code and documentation for the multi-node IoT waste management network.

## Project Structure
- `NodeA/NodeA.ino`: Telemetry Node A (DHT11, MQ5, Dual HC-SR04 Sensors, LoRa sender, TrustAB tracker).
- `NodeB/NodeB.ino`: Relay/Standalone Node B (DHT22, MQ5, Dual HC-SR04 Sensors, LoRa relay, TrustBC tracker, fallback mode).
- `NodeC/NodeC.ino`: Gateway Node C (DHT11, MQ5, Dual AJ-SR04M Waterproof Sensors, LoRa receiver, WiFi, MQTT, ThingSpeak client).

---

## 1. Complete GPIO Wiring Table

| Module / Sensor | Pin Function | ESP32 GPIO | Notes |
| :--- | :--- | :--- | :--- |
| **LoRa RA-02** | NSS (Chip Select) | `GPIO5` | SPI Chip Select |
| **LoRa RA-02** | RST (Reset) | `GPIO14` | LoRa Hardware Reset |
| **LoRa RA-02** | DIO0 (Interrupt) | `GPIO2` | Received packet trigger |
| **LoRa RA-02** | SCK (Clock) | `GPIO18` | Hardware SPI SCK |
| **LoRa RA-02** | MISO | `GPIO19` | Hardware SPI MISO |
| **LoRa RA-02** | MOSI | `GPIO23` | Hardware SPI MOSI |
| **LoRa RA-02** | VCC | `3.3V` | **Do not connect to 5V** |
| **LoRa RA-02** | GND | `GND` | Ground reference |
| **Top Ultrasonic** | TRIG | `GPIO26` | Trigger (A/B: HC-SR04, C: AJ-SR04M) |
| **Top Ultrasonic** | ECHO | `GPIO27` | Echo (A/B: HC-SR04, C: AJ-SR04M) |
| **Middle Ultrasonic** | TRIG | `GPIO32` | Trigger (A/B: HC-SR04, C: AJ-SR04M) |
| **Middle Ultrasonic** | ECHO | `GPIO33` | Echo (A/B: HC-SR04, C: AJ-SR04M) |
| **MQ5 Gas Sensor** | AO (Analog Out) | `GPIO34` | Connects to ESP32 ADC1_CH6 |
| **DHT Sensor** | DATA | `GPIO25` | Node A/C: DHT11 \| Node B: DHT22 |

---

## 2. Required Arduino Libraries

Install these via the Arduino Library Manager:
1. **LoRa** (by Sandeep Mistry) - Version `0.8.0`+
2. **DHT sensor library** (by Adafruit) - Version `1.4.6`+
3. **Adafruit Unified Sensor** (by Adafruit) - Dependency for DHT
4. **PubSubClient** (by Nick O'Leary) - Version `2.8.0`+ (For HiveMQ MQTT)

---

## 3. Packet Format Explanation

- **Relay Mode (Node A Online)**:
  `A,AFill,AGas,ATemp,ARisk,ATrust,B,BFill,BGas,BTemp,BRisk,BTrust`
  *Example*: `A,85,1980,30.4,14.2,0.95,B,50,1200,28.5,8.5,0.98`
- **Standalone Mode (Node A Offline)**:
  `B,Fill,Gas,Temperature,Risk,Trust`
  *Example*: `B,50,1200,28.5,8.5,0.98`

---

## 4. Trust System Algorithm

- **Range**: `0.00` to `1.00` (Starts at `1.00`)
- **ACK Received**: `Trust = min(1.00, Trust + 0.02)`
- **ACK Missing**: `Trust = max(0.00, Trust - 0.05)`
- `TrustAB` is updated by Node A, and `TrustBC` is updated by Node B.

---

## 5. Risk Calculation Explanation

Weighted formula representing bin hazards:
$$\text{Risk} = (\text{Fill} \times 0.1) + \left(\frac{\text{Gas}}{1000.0} \times 1.5\right) + (\text{Temperature} \times 0.2)$$

### Classification:
* **Normal**: `0 - 10`
* **Warning**: `10 - 15`
* **Critical**: `Above 15`

---

## 6. Bin Fill Calculation

Using two HC-SR04 sensors (Top: Trigger=15cm, Middle: Trigger=15cm):
1. **Fill = 20%**: Both sensors measure empty space ($\ge 15\text{ cm}$).
2. **Fill = 50%**: Only top sensor measures garbage ($< 15\text{ cm}$, middle $\ge 15\text{ cm}$).
3. **Fill = 85%**: Both sensors measure garbage ($< 15\text{ cm}$).
4. **Fill = 100%**: Both sensors measure distance $< 8\text{ cm}$.

---

## 7. MQTT JSON Examples

### Topic: `smartbin/A` (and `smartbin/B`, `smartbin/C`)
```json
{
  "fill": 85,
  "gas": 1980,
  "temperature": 30.4,
  "risk": 14.2,
  "trust": 0.95,
  "status": "Warning",
  "online": true
}
```

### Topic: `smartbin/network`
```json
{
  "trustAB": 0.95,
  "trustBC": 0.98,
  "nodeA": "ONLINE",
  "nodeB": "ONLINE",
  "nodeC": "ONLINE"
}
```

---

## 8. ThingSpeak Field Mapping

- **Field 1**: Node A Risk
- **Field 2**: Node A Trust (`TrustAB`)
- **Field 3**: Node B Risk
- **Field 4**: Node B Trust (`TrustBC`)
- **Field 5**: Node C Risk
- **Field 6**: Node C Trust (Constant `1.00`)
- **Field 7**: TrustAB
- **Field 8**: TrustBC

---

## 9. LoRa Communication Flow

1. **Node A** transmits telemetry every 5s.
2. **Node B** receives it, appends its data, and forwards it to **Node C (Gateway)**.
3. **Node C** publishes data to MQTT and ThingSpeak.
4. **Node C** broadcasts `ACK,A` via LoRa.
5. **Node A** and **Node B** receive the ACK and increase their respective trust metrics. If timeout occurs, trust is decreased.
6. If Node A goes offline, Node B sends `B` data directly every 5s. Node C replies with `ACK,B`.

---

## 10. Offline Detection & Error Handling

- **Gateway timeout**: Node C marks a node `OFFLINE` if no packet is received for 10 seconds.
- **Node B timeout**: If Node B receives no packet from A for 10s, it marks A offline and switches to standalone transmission.
- **Sensor fallback**: If DHT reads `NaN`, it defaults to `25.0` to keep calculations and serial parsing working.
- **Auto-reconnection**: Gateway automatically reconnects to WiFi and MQTT upon disconnects.
