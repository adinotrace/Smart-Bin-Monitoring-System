"use client";

import React, { useEffect, useState } from "react";
import { useMQTT } from "./mqtt-provider";
import { Server, Database, Activity, Clock, ShieldCheck, FileDown } from "lucide-react";

export const CloudStatusCard: React.FC = () => {
  const { mqttStatus, network } = useMQTT();
  const [lastCloudUpdate, setLastCloudUpdate] = useState<string>("Waiting...");
  
  // Track TS sync time
  useEffect(() => {
    if (network.tsSync) {
      const timer = setTimeout(() => {
        setLastCloudUpdate(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [network.tsSync]);

  const getMqttStatusDetails = () => {
    switch (mqttStatus) {
      case "connected": return { text: "Connected", bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" };
      case "connecting": return { text: "Connecting", bg: "bg-amber-500/10 border-amber-500/30 text-amber-400" };
      case "error": return { text: "Error", bg: "bg-rose-500/10 border-rose-500/30 text-rose-400" };
      default: return { text: "Disconnected", bg: "bg-slate-500/10 border-slate-500/30 text-slate-400" };
    }
  };

  const mqttDetails = getMqttStatusDetails();
  const isThingSpeakOnline = mqttStatus === "connected";

  return (
    <div className="glass-card p-6 rounded-2xl border border-white/5 flex flex-col h-full justify-between">
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400" />
            Network & Cloud Statistics
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-950/30 p-4 rounded-xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-1.5 font-semibold"><Server className="h-4 w-4 text-indigo-400" /> MQTT CONNECTION</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${mqttDetails.bg}`}>{mqttDetails.text}</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono"><span className="text-slate-500">Broker:</span><span className="text-slate-300">broker.hivemq.com</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-slate-500">Active Source:</span><span className="font-bold text-emerald-400 animate-pulse">Real MQTT Stream</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-slate-500">Global Health:</span><span className={`font-bold ${network.health >= 90 ? "text-emerald-400" : network.health >= 70 ? "text-amber-400" : "text-rose-400"}`}>{network.health.toFixed(1)}%</span></div>
            </div>
          </div>

          <div className="bg-slate-950/30 p-4 rounded-xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-1.5 font-semibold"><Database className="h-4 w-4 text-cyan-400" /> THINGSPEAK CLOUD</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${isThingSpeakOnline ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-rose-500/10 border-rose-500/30 text-rose-400"}`}>{isThingSpeakOnline ? "Online" : "Offline"}</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono"><span className="text-slate-500">Sync Target:</span><span className="text-slate-300">16 Seconds</span></div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Last Sync Time:</span>
                <span className="text-slate-300 flex items-center gap-1"><Clock className="h-3 w-3 text-cyan-400" />{lastCloudUpdate}</span>
              </div>
              <div className="flex justify-between text-xs font-mono"><span className="text-slate-500">Status:</span><span className="text-emerald-400 font-bold">{network.tsSync ? "Uploading..." : "Idle"}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Gateway Telemetry Footer */}
      <div className="border-t border-white/5 pt-4">
        <div className="flex items-center justify-between text-xs mb-3">
          <div className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-emerald-400" />
            <span className="text-slate-300 font-bold">Node Telemetry Packet Stats</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-950/20 p-3 rounded-lg border border-white/5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-400"/> Node A Stats</div>
            <div className="mt-2 grid grid-cols-3 text-center divide-x divide-white/5">
              <div><div className="text-[9px] text-slate-500">RECV</div><div className="text-xs font-mono text-emerald-400">{network.aRecv}</div></div>
              <div><div className="text-[9px] text-slate-500">LOST</div><div className="text-xs font-mono text-rose-400">{network.aLost}</div></div>
              <div><div className="text-[9px] text-slate-500">REL %</div><div className="text-xs font-mono text-cyan-400">{network.aRel.toFixed(1)}%</div></div>
            </div>
          </div>
          <div className="bg-slate-950/20 p-3 rounded-lg border border-white/5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-400"/> Node B Stats</div>
            <div className="mt-2 grid grid-cols-3 text-center divide-x divide-white/5">
              <div><div className="text-[9px] text-slate-500">RECV</div><div className="text-xs font-mono text-emerald-400">{network.bRecv}</div></div>
              <div><div className="text-[9px] text-slate-500">LOST</div><div className="text-xs font-mono text-rose-400">{network.bLost}</div></div>
              <div><div className="text-[9px] text-slate-500">REL %</div><div className="text-xs font-mono text-cyan-400">{network.bRel.toFixed(1)}%</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
