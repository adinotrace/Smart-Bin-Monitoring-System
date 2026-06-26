"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import mqtt from "mqtt";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BinData {
  fill: number;
  gas: number;
  temperature: number;
  risk: number;
  trust: number;
  status: "Normal" | "Warning" | "Critical"; // Based on Risk
  hbStatus: "ONLINE" | "WARNING" | "OFFLINE"; // From Gateway Heartbeat Tracker
  path: string; 
}

export interface NetworkData {
  aRecv: number;
  aLost: number;
  aRel: number;
  bRecv: number;
  bLost: number;
  bRel: number;
  health: number;
  tsSync: boolean;
}

export interface Alert {
  id: string;
  timestamp: string;
  source: "Bin A" | "Bin B" | "Bin C" | "Network" | "Gateway";
  type: "info" | "warning" | "critical";
  message: string;
  read: boolean;
}

export interface ChartDataPoint {
  timestamp: string;
  binA_risk: number;
  binB_risk: number;
  binC_risk: number;
  binA_fill: number;
  binB_fill: number;
  binC_fill: number;
  trustAB: number;
  trustBC: number;
}

interface MQTTContextType {
  binA: BinData;
  binB: BinData;
  binC: BinData;
  network: NetworkData;
  alerts: Alert[];
  chartHistory: ChartDataPoint[];
  mqttStatus: "connected" | "connecting" | "disconnected" | "error";
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
  triggerManualAlert: (source: Alert["source"], type: Alert["type"], message: string) => void;
}

const MQTTContext = createContext<MQTTContextType | undefined>(undefined);

const safeNum = (val: unknown, fallback: number): number => {
  const n = Number(val);
  return isNaN(n) || !isFinite(n) ? fallback : n;
};

// Initial States
const initBin = (): BinData => ({
  fill: 0, gas: 0, temperature: 0, risk: 0, trust: 1.0,
  status: "Normal", hbStatus: "OFFLINE", path: "Unknown"
});

const initNet: NetworkData = {
  aRecv: 0, aLost: 0, aRel: 100.0,
  bRecv: 0, bLost: 0, bRel: 100.0,
  health: 100.0, tsSync: false
};

// ─── Provider ─────────────────────────────────────────────────────────────────
export const MQTTProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [binA, setBinA]       = useState<BinData>(initBin());
  const [binB, setBinB]       = useState<BinData>(initBin());
  const [binC, setBinC]       = useState<BinData>(initBin());
  const [network, setNetwork] = useState<NetworkData>(initNet);
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [chartHistory, setChartHistory] = useState<ChartDataPoint[]>([]);
  const [mqttStatus, setMqttStatus]     = useState<MQTTContextType["mqttStatus"]>("disconnected");

  const clientRef = useRef<mqtt.MqttClient | null>(null);

  const addAlert = useCallback((source: Alert["source"], type: Alert["type"], message: string) => {
    setAlerts((prev) => {
      const exists = prev.some((a) => a.source === source && a.message === message && !a.read);
      if (exists) return prev;
      return [{
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
        source, type, message, read: false,
      }, ...prev].slice(0, 50); // Keep last 50 alerts
    });
  }, []);

  const dismissAlert = (id: string) => setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
  const clearAlerts = () => setAlerts([]);
  const triggerManualAlert = (source: Alert["source"], type: Alert["type"], message: string) => addAlert(source, type, message);

  // Checks Data Alerts
  const checkAlertThresholds = useCallback((binName: Alert["source"], data: BinData) => {
    if (data.hbStatus === "OFFLINE") addAlert(binName, "critical", `${binName} is OFFLINE (6 Missed Heartbeats).`);
    else if (data.hbStatus === "WARNING") addAlert(binName, "warning", `${binName} missed 3 heartbeats. Connection unstable.`);
    
    if (data.hbStatus === "ONLINE") {
      if (data.fill >= 85) addAlert(binName, "critical", `${binName} is nearly full (${data.fill}%). Immediate dispatch needed!`);
      if (data.gas >= 2800) addAlert(binName, "critical", `Toxic gas leak in ${binName} (${data.gas} PPM).`);
      if (data.temperature >= 35) addAlert(binName, "critical", `High Temperature in ${binName} (${data.temperature}°C). Fire risk!`);
    }
  }, [addAlert]);

  // MQTT Connection Effect
  useEffect(() => {
    const timer = setTimeout(() => setMqttStatus("connecting"), 0);
    const client = mqtt.connect("ws://broker.hivemq.com:8000/mqtt", {
      clean: true, connectTimeout: 5000, reconnectPeriod: 4000,
    });
    clientRef.current = client;

    client.on("connect", () => {
      setMqttStatus("connected");
      addAlert("Gateway", "info", "Connected to HiveMQ Broker.");
      client.subscribe(["smartbin_revat_2026/A", "smartbin_revat_2026/B", "smartbin_revat_2026/C", "smartbin_revat_2026/network"], (err) => {
        if (err) addAlert("Gateway", "critical", "MQTT topic subscription failed.");
      });
    });

    client.on("message", (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

        if (topic.startsWith("smartbin_revat_2026/") && ["A", "B", "C"].includes(topic.split("/")[1])) {
          const binName = topic.split("/")[1];
          const updated: BinData = {
            fill: safeNum(payload.fill, 0),
            gas: safeNum(payload.gas, 0),
            temperature: safeNum(payload.temperature, 25),
            risk: safeNum(payload.risk, 0),
            trust: safeNum(payload.trust, 1),
            status: payload.status,
            hbStatus: payload.hbStatus === "OFFLINE" ? "OFFLINE" : payload.hbStatus === "WARNING" ? "WARNING" : "ONLINE",
            path: payload.path || "Unknown"
          };
          
          if (binName === "A") { setBinA(updated); checkAlertThresholds("Bin A", updated); }
          if (binName === "B") { setBinB(updated); checkAlertThresholds("Bin B", updated); }
          if (binName === "C") { setBinC(updated); checkAlertThresholds("Bin C", updated); }

          setChartHistory(prev => {
            const last = prev[prev.length - 1];
            return [...prev, {
              timestamp: ts,
              binA_risk: binName === "A" ? updated.risk : (last?.binA_risk || 0),
              binB_risk: binName === "B" ? updated.risk : (last?.binB_risk || 0),
              binC_risk: binName === "C" ? updated.risk : (last?.binC_risk || 0),
              binA_fill: binName === "A" ? updated.fill : (last?.binA_fill || 0),
              binB_fill: binName === "B" ? updated.fill : (last?.binB_fill || 0),
              binC_fill: binName === "C" ? updated.fill : (last?.binC_fill || 0),
              trustAB: binName === "A" ? updated.trust : (last?.trustAB || 1.0),
              trustBC: binName === "B" ? updated.trust : (last?.trustBC || 1.0),
            }].slice(-30);
          });
        } else if (topic === "smartbin_revat_2026/network") {
          const net: NetworkData = {
            aRecv: safeNum(payload.aRecv, 0),
            aLost: safeNum(payload.aLost, 0),
            aRel: safeNum(payload.aRel, 100),
            bRecv: safeNum(payload.bRecv, 0),
            bLost: safeNum(payload.bLost, 0),
            bRel: safeNum(payload.bRel, 100),
            health: safeNum(payload.health, 100),
            tsSync: payload.tsSync === true || payload.tsSync === "true"
          };
          setNetwork(net);
          if (net.health < 80) addAlert("Network", "warning", `Network Health dropped to ${net.health.toFixed(1)}%`);
        }
      } catch (err) {
        console.error("MQTT parse error", err);
      }
    });

    client.on("error", (err) => { setMqttStatus("error"); addAlert("Gateway", "critical", `MQTT Error: ${err.message}`); });
    client.on("offline", () => { setMqttStatus("disconnected"); });

    return () => { 
      clearTimeout(timer);
      client.end(); 
    };
  }, [addAlert, checkAlertThresholds]);

  return (
    <MQTTContext.Provider
      value={{
        binA, binB, binC, network, alerts, chartHistory, mqttStatus,
        clearAlerts, dismissAlert, triggerManualAlert,
      }}
    >
      {children}
    </MQTTContext.Provider>
  );
};

export const useMQTT = () => {
  const context = useContext(MQTTContext);
  if (!context) throw new Error("useMQTT must be used within an MQTTProvider");
  return context;
};
