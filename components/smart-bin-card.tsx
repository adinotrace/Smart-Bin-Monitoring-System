"use client";

import React from "react";
import { BinData } from "./mqtt-provider";
import { Thermometer, Wind, AlertTriangle, Shield, WifiOff, Wifi, Route } from "lucide-react";

interface SmartBinCardProps {
  label: string;
  data: BinData;
}

export const SmartBinCard: React.FC<SmartBinCardProps> = ({ label, data }) => {
  const { fill, gas, temperature, risk, trust, status, hbStatus, path } = data;

  // Determine color theme based on sensor Risk Status
  const themeMap: Record<string, {
    border: string; glow: string; badgeBg: string; badgeDot: string; fillGradient: string;
  }> = {
    Normal: {
      border: "hover:border-emerald-500/50",
      glow: "group-hover:shadow-emerald-500/10",
      badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      badgeDot: "bg-emerald-400 animate-pulse",
      fillGradient: "from-emerald-600/60 to-cyan-500/60",
    },
    Warning: {
      border: "hover:border-amber-500/50",
      glow: "group-hover:shadow-amber-500/10",
      badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      badgeDot: "bg-amber-400 animate-pulse",
      fillGradient: "from-amber-600/60 to-yellow-500/60",
    },
    Critical: {
      border: "hover:border-rose-500/50",
      glow: "group-hover:shadow-rose-500/10",
      badgeBg: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      badgeDot: "bg-rose-400 animate-pulse",
      fillGradient: "from-rose-600/70 to-red-500/70",
    },
  };

  const theme = themeMap[status] ?? themeMap["Normal"];

  const getGasColor = (ppm: number) => {
    if (ppm >= 2800) return "text-rose-400";
    if (ppm >= 2200) return "text-amber-400";
    return "text-cyan-400";
  };

  const getTempColor = (temp: number) => {
    if (temp >= 35) return "text-rose-400";
    if (temp >= 30) return "text-amber-400";
    return "text-emerald-400";
  };

  return (
    <div className={`group relative glass-card p-6 rounded-2xl border border-white/5 transition-all duration-300 ${theme.border} hover:shadow-2xl ${theme.glow}`}>

      {/* Heartbeat Status Banners */}
      {hbStatus === "OFFLINE" && (
        <div className="absolute top-0 inset-x-0 z-10 rounded-t-2xl bg-rose-950/80 backdrop-blur-sm border-b border-rose-500/30 px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5 text-rose-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-300">Node Offline</span>
          </div>
          <span className="text-[9px] text-rose-500/70 font-mono">Missed 6 Heartbeats</span>
        </div>
      )}
      {hbStatus === "WARNING" && (
        <div className="absolute top-0 inset-x-0 z-10 rounded-t-2xl bg-amber-950/80 backdrop-blur-sm border-b border-amber-500/30 px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">Link Unstable</span>
          </div>
          <span className="text-[9px] text-amber-500/70 font-mono">Missed 3 Heartbeats</span>
        </div>
      )}

      {/* Dim card content slightly when offline */}
      <div className={hbStatus === "OFFLINE" ? "grayscale opacity-50 mt-5 transition-all duration-500" : (hbStatus === "WARNING" ? "mt-5 transition-all duration-500" : "")}>

      <div className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-transparent to-transparent opacity-0 group-hover:opacity-10 transition-opacity duration-300 blur`} />

      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold tracking-wider text-slate-100 flex items-center gap-2">
            SMART BIN <span className="text-2xl text-cyan-400 font-extrabold">{label}</span>
          </h3>
          <div className="flex flex-col gap-1 mt-1">
            <span className="text-xs text-slate-400 font-mono tracking-tight flex items-center gap-1">
              <Route className="h-3 w-3" />
              Path: <span className="text-cyan-300">{path}</span>
            </span>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${theme.badgeBg}`}>
          <span className={`h-2 w-2 rounded-full ${theme.badgeDot}`} />
          {status}
        </span>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Left: Fill Level Visualizer */}
        <div className="col-span-1 md:col-span-5 flex flex-col items-center justify-center">
          <div className="relative w-28 h-40 bg-slate-950/80 rounded-2xl border border-white/10 overflow-hidden flex flex-col justify-end shadow-inner">
            <div
              className={`w-full bg-gradient-to-t ${theme.fillGradient} transition-all duration-700 ease-out relative`}
              style={{ height: `${fill}%` }}
            >
              {fill > 0 && (
                <div className="absolute -top-3 left-0 w-full overflow-hidden leading-[0] h-4">
                  <svg className="relative block w-[200%] h-4 animate-[wave_3s_linear_infinite]" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M0,60 C150,90 350,30 500,60 C650,90 850,30 1000,60 C1150,90 1350,30 1500,60 L1500,120 L0,120 Z" className="fill-cyan-400/20" />
                  </svg>
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{fill}%</span>
              </div>
            </div>
            {fill === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-slate-500 font-mono text-sm">Empty</span>
              </div>
            )}
          </div>
          <span className="mt-3 text-sm font-medium text-slate-300">Fill Level</span>
        </div>

        {/* Right: Telemetry Parameters */}
        <div className="col-span-1 md:col-span-7 space-y-4">
          
          <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium"><Wind className="h-4 w-4 text-cyan-400" /> Gas Level</span>
              <span className={`text-sm font-bold font-mono ${getGasColor(gas)}`}>{gas} PPM</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${gas >= 2800 ? "from-red-500 to-rose-600" : gas >= 2200 ? "from-amber-400 to-orange-500" : "from-cyan-400 to-indigo-500"}`} style={{ width: `${Math.min(100, (gas / 5000) * 100)}%` }} />
            </div>
          </div>

          <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5">
            <div className="flex justify-between items-center mb-1 font-medium">
              <span className="text-xs text-slate-400 flex items-center gap-1.5"><Thermometer className="h-4 w-4 text-orange-400" /> Temperature</span>
              <span className={`text-sm font-bold font-mono ${getTempColor(temperature)}`}>{temperature}°C</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${temperature >= 35 ? "from-red-500 to-rose-500" : temperature >= 30 ? "from-amber-400 to-orange-500" : "from-emerald-400 to-teal-500"}`} style={{ width: `${Math.min(100, (temperature / 60) * 100)}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold uppercase tracking-wider"><AlertTriangle className="h-3.5 w-3.5 text-rose-400" /> Risk Score</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className={`text-xl font-black font-mono leading-none ${risk >= 14 ? "text-rose-400" : risk >= 9 ? "text-amber-400" : "text-cyan-400"}`}>{risk.toFixed(1)}</span>
                <span className="text-[10px] text-slate-500">/ 20</span>
              </div>
            </div>

            <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold uppercase tracking-wider"><Shield className="h-3.5 w-3.5 text-emerald-400" /> Trust Rating</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className={`text-xl font-black font-mono leading-none ${trust < 0.85 ? "text-rose-400" : trust < 0.95 ? "text-amber-400" : "text-emerald-400"}`}>{trust.toFixed(3)}</span>
                <span className="text-[10px] text-slate-500">/ 1.0</span>
              </div>
            </div>
          </div>

        </div>
      </div>
      </div>
    </div>
  );
};
