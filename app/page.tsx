"use client";

import React, { useEffect, useState } from "react";
import { MQTTProvider, useMQTT } from "../components/mqtt-provider";
import { SmartBinCard } from "../components/smart-bin-card";
import { NetworkTopology } from "../components/network-topology";
import { CloudStatusCard } from "../components/cloud-status-card";
import { AnalyticsCharts } from "../components/analytics-charts";
import { AlertsPanel } from "../components/alerts-panel";
import { Calendar, Clock, Cpu, Server } from "lucide-react";

// Inner dashboard component that consumes the MQTT context
const DashboardContent: React.FC = () => {
  const { binA, binB, binC, network, mqttStatus } = useMQTT();
  const [time, setTime] = useState<Date | null>(null);

  // Clock effect
  useEffect(() => {
    const clockTimer = setTimeout(() => setTime(new Date()), 0);
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => {
      clearTimeout(clockTimer);
      clearInterval(timer);
    };
  }, []);

  const formattedTime = time
    ? time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--:--:--";
  const formattedDate = time
    ? time.toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" })
    : "Loading date...";

  const activeBinCount = [binA.hbStatus !== "OFFLINE", binB.hbStatus !== "OFFLINE", binC.hbStatus !== "OFFLINE"].filter(Boolean).length;

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 md:py-8 flex flex-col gap-6 md:gap-8">
      
      {/* 1. HEADER SECTION */}
      <header className="relative w-full glass-card p-6 rounded-2xl border border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/5 rounded-full blur-3xl" />
        
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="bg-indigo-600/20 p-1.5 rounded-lg border border-indigo-500/30">
              <Cpu className="h-5 w-5 text-indigo-400" />
            </div>
            <span className="text-[10px] tracking-wider text-indigo-400 font-extrabold uppercase">
              IoT Project
            </span>
          </div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-black tracking-tight text-white leading-none">
            Trust-Aware Smart Waste Management System
          </h1>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            Multi-hop routing path via LoRa wireless nodes
          </p>
        </div>

        {/* Live indicators and Clock */}
        <div className="flex flex-wrap items-center gap-4 sm:self-center">
          {/* Status Pill */}
          <div className="flex items-center gap-2 bg-slate-950/60 border border-white/5 px-4 py-2 rounded-xl">
            <div className={`h-2.5 w-2.5 rounded-full ${
              mqttStatus === "connected"
                ? "bg-emerald-400 animate-pulse-green"
                : "bg-rose-500"
            }`} />
            <div className="text-left font-mono">
              <div className="text-[9px] text-slate-500 font-bold uppercase leading-none">MQTT Status</div>
              <div className="text-[11px] font-bold text-slate-300 capitalize leading-tight">
                {mqttStatus === "connected" 
                  ? "Live Broker" 
                  : mqttStatus}
              </div>
            </div>
          </div>

          {/* Clock Panel */}
          <div className="flex items-center gap-3 bg-slate-950/60 border border-white/5 px-4 py-2 rounded-xl text-left font-mono min-w-[150px]">
            <Clock className="h-4 w-4 text-cyan-400" />
            <div>
              <div className="text-[11px] font-bold text-slate-200">{formattedTime}</div>
              <div className="text-[8px] text-slate-500">{formattedDate}</div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. SMART BIN MONITORING SECTION */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-200 tracking-wide uppercase flex items-center gap-2">
            <Server className="h-4 w-4 text-cyan-400" />
            Smart Bin Monitoring Nodes
          </h2>
          <span className="text-xs text-slate-400 font-mono">{activeBinCount} / 3 Nodes Online</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <SmartBinCard label="A" data={binA} />
          <SmartBinCard label="B" data={binB} />
          <SmartBinCard label="C" data={binC} />
        </div>
      </section>

      {/* 3. NETWORK & CLOUD MONITORING SECTIONS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Network Topology Visualizer */}
        <NetworkTopology binA={binA} binB={binB} binC={binC} />

        {/* Cloud Monitoring & Gateway Info */}
        <CloudStatusCard />
      </section>

      {/* 4. ANALYTICS & ALERTS SECTIONS */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Analytics (2/3 width) */}
        <div className="lg:col-span-2">
          <AnalyticsCharts />
        </div>

        {/* Real-time Alerts Panel (1/3 width) */}
        <div className="lg:col-span-1">
          <AlertsPanel />
        </div>
      </section>

      {/* Footer info for project presentation */}
      <footer className="text-center py-4 border-t border-white/5 text-[10px] text-slate-500 font-mono flex flex-col md:flex-row justify-between items-center gap-2">
        <span>Trust-Aware Smart Waste Routing Demonstration • LoRa ➔ Gateway Node C ➔ ThingSpeak ➔ HiveMQ MQTT</span>
        <span>Developer Console: ws://broker.hivemq.com:8000/mqtt • Topics: smartbin/#</span>
      </footer>

    </div>
  );
};

export default function Home() {
  return (
    <MQTTProvider>
      <div className="min-h-screen w-full flex flex-col justify-between py-6">
        <DashboardContent />
      </div>
    </MQTTProvider>
  );
}
