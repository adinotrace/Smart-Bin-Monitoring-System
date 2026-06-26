# Smart Bin Monitoring System

## Project Overview
The Smart Bin Monitoring System is an IoT-based solution designed to monitor waste levels, detect hazardous gases, and measure internal temperatures of smart bins. It uses a robust LoRa-based communication architecture to transmit telemetry data from edge nodes to a central gateway, which then pushes the data to the cloud via MQTT and ThingSpeak. A sleek, modern Next.js dashboard provides real-time visualization of the network topology, node status, and sensor readings.

## Architecture
The system employs a multi-hop, self-healing routing architecture using three ESP32 modules:
- **Node A**: Edge sensor node equipped with Ultrasonic (Fill), MQ-5 (Gas), and DHT11 (Temperature) sensors.
- **Node B**: Edge sensor node (same hardware as Node A) that acts as a physical relay for Node A's packets while transmitting its own telemetry.
- **Node C (Gateway)**: Central hub that listens for LoRa packets, validates them, and bridges the data to Wi-Fi (MQTT & ThingSpeak).

## Hardware
- 3x ESP32 Microcontrollers
- 3x SX1276 LoRa Modules (433MHz)
- Ultrasonic Sensors (HC-SR04)
- Gas Sensors (MQ-5)
- Temperature & Humidity Sensors (DHT11)

## Software
- **Firmware**: C++ (Arduino Core for ESP32) with FreeRTOS.
- **Frontend**: Next.js (React), Tailwind CSS, TypeScript, Recharts, Framer Motion.
- **Cloud/IoT**: MQTT Protocol, ThingSpeak REST API.

## Features
- **Self-Healing Routing**: Automatic fallback from `A -> B -> C` (Relay Mode) to `A -> C` (Direct Mode) if Node B fails, and seamless recovery when it returns.
- **Sequence-Locked ACKs**: Cryptographically strict Acknowledgement mechanisms mathematically eliminating false timeouts.
- **Exponential Moving Average (EMA) Trust Algorithm**: Real-time evaluation of link quality (`TrustAB`, `TrustBC`) that degrades solely on genuine packet loss.
- **Dual-Core Processing**: The Gateway offloads heavy HTTP REST API calls (ThingSpeak) to ESP32 Core 0 via FreeRTOS, guaranteeing zero-latency LoRa packet processing on Core 1.
- **Real-Time Next.js Dashboard**: Stunning dark-mode UI with live status pills, trust meters, dynamic node topology maps, and real-time telemetry graphs.

## Folder Structure
```
.
├── arduino/
│   ├── NodeA/          # Edge Node firmware
│   ├── NodeB/          # Relay Node firmware
│   └── NodeC/          # Gateway firmware
├── app/                # Next.js Application Routes
├── components/         # React UI Components
├── lib/                # Utilities and Configuration
├── public/             # Static Assets
└── package.json        # Frontend Dependencies
```

## Packet Format
Telemetry packets transmitted over LoRa follow a strict comma-separated format:
`TYPE, SEQ, Fill, Gas, Temp, Risk, Trust, [Optional Relay Data], CRC`

Example Relay Packet (Node B forwarding Node A):
`A,155,85,4000,35.5,20.5,1.00,B,29,50,4000,35.5,20.5,1.00,4F`

## MQTT Topics
- `smartbin_revat_2026/A`
- `smartbin_revat_2026/B`
- `smartbin_revat_2026/C`
- `smartbin_revat_2026/network`

## Routing Logic
1. **Default State**: Node A transmits to Node B. Node B appends its data and relays to Node C.
2. **Node B Failure**: Node A misses 3 consecutive sequence-locked ACKs, switches to `bOfflineMode`, and transmits `DA` (Direct) packets directly to Node C.
3. **Node A Failure**: Node B detects 30s of silence, enters Standalone Mode, and transmits `B` packets directly to Node C.

## Trust Algorithm
The network calculates link reliability dynamically:
`Trust = (0.02 * Hit) + (0.98 * Trust)`
Trust values naturally degrade when sequence gaps are detected or ACKs are mathematically missed.

## Installation
1. **Firmware**: Open the `.ino` files in the Arduino IDE, install required libraries (`LoRa`, `DHT sensor library`, `PubSubClient`, `WiFi`), and flash to the respective ESP32 boards.
2. **Frontend**: 
   ```bash
   npm install
   npm run dev
   ```

## Testing
Ensure ESP32 boards have adequate physical separation (>1 meter) during indoor lab testing to prevent hardware RF saturation of the SX1276 receivers. Open the Serial Monitor at 115200 baud to view the injected `[TIMING]`, `[STATS]`, and `[TRACE]` logs.

## Future Scope
- Integration with AI models to predict waste generation patterns.
- Transition from standard LoRa to LoRaWAN (TTN/Helium) for city-wide scalability.
- Solar-powered deep-sleep optimization for Edge Nodes.

## Authors
Developed for the Smart Bin Monitoring System 2026.
