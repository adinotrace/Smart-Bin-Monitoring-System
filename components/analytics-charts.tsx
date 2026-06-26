"use client";

import React, { useEffect, useState } from "react";
import { useMQTT } from "./mqtt-provider";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { BarChart3, TrendingUp, ShieldAlert } from "lucide-react";

// Custom tooltips matching the dashboard aesthetic
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-950/90 border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-md">
        <p className="text-[10px] font-mono text-slate-400 mb-1">{label}</p>
        <div className="space-y-1">
          {payload.map((entry, index: number) => (
            <div key={index} className="flex items-center gap-2 text-xs font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-300">{entry.name}:</span>
              <span className="font-mono text-slate-100">{entry.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const AnalyticsCharts: React.FC = () => {
  const { chartHistory } = useMQTT();
  const [activeTab, setActiveTab] = useState<"risk" | "trust" | "fill">("risk");
  const [mounted, setMounted] = useState(false);

  // Avoid Hydration mismatch issues by rendering Recharts only on the client
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) {
    return (
      <div className="glass-card p-6 rounded-2xl border border-white/5 h-[380px] flex items-center justify-center">
        <span className="text-slate-400 font-mono text-sm animate-pulse">Loading Analytics Engine...</span>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-2xl border border-white/5 flex flex-col justify-between h-full">
      {/* Header and Toggles */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-400" />
            System Analytics & Trend Analysis
          </h3>
          <p className="text-xs text-slate-400 mt-1">Real-time charts plotting LoRa packet parameters</p>
        </div>
        
        {/* Tab Controls */}
        <div className="flex bg-slate-950/80 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab("risk")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === "risk" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Risk Trends
          </button>
          <button
            onClick={() => setActiveTab("trust")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === "trust" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Trust Scores
          </button>
          <button
            onClick={() => setActiveTab("fill")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === "fill" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Fill Levels
          </button>
        </div>
      </div>

      {/* Recharts Container */}
      <div className="h-[280px] w-full bg-slate-950/20 rounded-xl p-2 border border-white/5">
        <ResponsiveContainer width="100%" height="100%">
          {activeTab === "risk" ? (
            <AreaChart data={chartHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRiskA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorRiskB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorRiskC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="timestamp" stroke="#64748b" fontSize={9} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={9} tickLine={false} domain={[0, 20]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
              
              <Area
                type="monotone"
                dataKey="binA_risk"
                name="Bin A Risk"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRiskA)"
              />
              <Area
                type="monotone"
                dataKey="binB_risk"
                name="Bin B Risk"
                stroke="#f59e0b"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRiskB)"
              />
              <Area
                type="monotone"
                dataKey="binC_risk"
                name="Bin C Risk"
                stroke="#f43f5e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRiskC)"
              />
            </AreaChart>
          ) : activeTab === "trust" ? (
            <AreaChart data={chartHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTrustAB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorTrustBC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="timestamp" stroke="#64748b" fontSize={9} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={9} tickLine={false} domain={[0.4, 1.0]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
              
              <Area
                type="monotone"
                dataKey="trustAB"
                name="Trust Link A-B"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorTrustAB)"
              />
              <Area
                type="monotone"
                dataKey="trustBC"
                name="Trust Link B-C"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorTrustBC)"
              />
            </AreaChart>
          ) : (
            <AreaChart data={chartHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorFillA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorFillB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorFillC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="timestamp" stroke="#64748b" fontSize={9} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={9} tickLine={false} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />

              <Area
                type="monotone"
                dataKey="binA_fill"
                name="Bin A Fill %"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorFillA)"
              />
              <Area
                type="monotone"
                dataKey="binB_fill"
                name="Bin B Fill %"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorFillB)"
              />
              <Area
                type="monotone"
                dataKey="binC_fill"
                name="Bin C Fill %"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorFillC)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
