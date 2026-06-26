"use client";

import React from "react";
import { NetworkData, BinData } from "./mqtt-provider";
import { Radio, Database, Shield, Wifi, WifiOff, Activity } from "lucide-react";

interface NetworkTopologyProps {
  binA: BinData;
  binB: BinData;
  binC: BinData;
}

export const NetworkTopology: React.FC<NetworkTopologyProps> = ({ binA, binB, binC }) => {
  const nodeA = binA.hbStatus !== "OFFLINE";
  const nodeB = binB.hbStatus !== "OFFLINE";
  const nodeC = binC.hbStatus !== "OFFLINE";
  const trustAB = binA.trust;
  const trustBC = binB.trust;

  // Link status determinations
  const getLinkColor = (trust: number, nodeSource: boolean, nodeDest: boolean) => {
    if (!nodeSource || !nodeDest) return "stroke-slate-700";
    if (trust >= 0.95) return "stroke-emerald-400";
    if (trust >= 0.85) return "stroke-amber-400";
    return "stroke-rose-500";
  };

  const getFlowAnimation = (trust: number, nodeSource: boolean, nodeDest: boolean) => {
    if (!nodeSource || !nodeDest || trust < 0.8) return "";
    return "animate-flow";
  };

  const getLinkGlow = (trust: number, nodeSource: boolean, nodeDest: boolean) => {
    if (!nodeSource || !nodeDest) return "drop-shadow-none";
    if (trust >= 0.95) return "drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    if (trust >= 0.85) return "drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]";
    return "drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]";
  };

  const getNodeColor = (status: string) => {
    if (status === "ONLINE") return "stroke-emerald-500 shadow-glow-emerald text-emerald-400";
    if (status === "WARNING") return "stroke-amber-500 shadow-glow-amber text-amber-400";
    return "stroke-rose-500 text-rose-500";
  };

  return (
    <div className="glass-card p-6 rounded-2xl border border-white/5 flex flex-col h-full justify-between">
      <div>
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-400 animate-pulse" />
            LoRa Network Health & Topology
          </h3>
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            Gateway Syncing
          </span>
        </div>

        {/* Interactive SVG Routing Diagram */}
        <div className="relative w-full bg-slate-950/40 border border-white/5 rounded-xl p-6 mb-6 overflow-x-auto min-h-[160px] flex items-center justify-center">
          <svg className="w-full max-w-[560px] h-[100px]" viewBox="0 0 560 100" fill="none">
            <defs>
              <linearGradient id="gradient-ab" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={nodeA ? "#10b981" : "#ef4444"} />
                <stop offset="100%" stopColor={nodeB ? "#10b981" : "#ef4444"} />
              </linearGradient>
            </defs>

            {/* Link A -> B */}
            <path
              d="M80 50 H 220"
              className={`stroke-2 ${getLinkColor(trustAB, nodeA, nodeB)} ${getLinkGlow(trustAB, nodeA, nodeB)}`}
            />
            {nodeA && nodeB && (
              <path
                d="M80 50 H 220"
                className={`stroke-[3px] ${getLinkColor(trustAB, nodeA, nodeB)} ${getFlowAnimation(trustAB, nodeA, nodeB)}`}
                strokeLinecap="round"
              />
            )}
            
            {/* Dashed arc: A -> C direct bypass when B is offline or Warning */}
            {nodeA && !nodeB && (
              <path d="M80 35 Q 230 -20 390 35" className="stroke-[1.5px] stroke-amber-400/60" strokeDasharray="6 4" strokeLinecap="round" fill="none" />
            )}
            {nodeA && !nodeB && (
              <text x="230" y="5" className="text-[8px] fill-amber-400/80 font-bold" textAnchor="middle" fontSize="8">Direct Bypass (DA)</text>
            )}

            {/* Link B -> C */}
            <path
              d="M240 50 H 380"
              className={`stroke-2 ${getLinkColor(trustBC, nodeB, nodeC)} ${getLinkGlow(trustBC, nodeB, nodeC)}`}
            />
            {nodeB && nodeC && (
              <path
                d="M240 50 H 380"
                className={`stroke-[3px] ${getLinkColor(trustBC, nodeB, nodeC)} ${getFlowAnimation(trustBC, nodeB, nodeC)}`}
                strokeLinecap="round"
              />
            )}

            {/* Link C -> Gateway */}
            <path d="M400 50 H 480" className={`stroke-2 ${nodeC ? "stroke-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" : "stroke-slate-700"}`} />
            {nodeC && <path d="M400 50 H 480" className="stroke-[3px] stroke-cyan-400 animate-flow" strokeLinecap="round" />}

            {/* Node A */}
            <g transform="translate(60, 50)">
              <circle r="24" className={`fill-slate-900 stroke-2 ${getNodeColor(binA.hbStatus)}`} />
              <text y="-32" className="text-[10px] fill-slate-300 font-bold" textAnchor="middle">Bin Node A</text>
              <foreignObject x="-12" y="-12" width="24" height="24"><Radio className={`h-6 w-6 ${getNodeColor(binA.hbStatus)}`} /></foreignObject>
            </g>

            {/* Node B */}
            <g transform="translate(230, 50)">
              <circle r="24" className={`fill-slate-900 stroke-2 ${getNodeColor(binB.hbStatus)}`} />
              <text y="-32" className="text-[10px] fill-slate-300 font-bold" textAnchor="middle">Bin Node B</text>
              <foreignObject x="-12" y="-12" width="24" height="24"><Radio className={`h-6 w-6 ${getNodeColor(binB.hbStatus)}`} /></foreignObject>
            </g>

            {/* Node C */}
            <g transform="translate(390, 50)">
              <circle r="24" className={`fill-slate-900 stroke-2 ${getNodeColor(binC.hbStatus)}`} />
              <text y="-32" className="text-[10px] fill-slate-300 font-bold" textAnchor="middle">Gateway C</text>
              <foreignObject x="-12" y="-12" width="24" height="24"><Radio className={`h-6 w-6 ${getNodeColor(binC.hbStatus)}`} /></foreignObject>
            </g>

            {/* ThingSpeak */}
            <g transform="translate(500, 50)">
              <circle r="24" className={`fill-slate-900 stroke-2 ${nodeC ? "stroke-cyan-400" : "stroke-slate-700"}`} />
              <text y="-32" className="text-[10px] fill-cyan-400 font-extrabold" textAnchor="middle">ThingSpeak</text>
              <foreignObject x="-12" y="-12" width="24" height="24"><Database className={`h-6 w-6 ${nodeC ? "text-cyan-400" : "text-slate-500"}`} /></foreignObject>
            </g>

            {/* Link Text Labels */}
            {nodeA && nodeB && <text x="145" y="42" className="text-[9px] fill-slate-400 font-semibold font-mono" textAnchor="middle">{trustAB.toFixed(2)}</text>}
            {nodeB && nodeC && <text x="310" y="42" className="text-[9px] fill-slate-400 font-semibold font-mono" textAnchor="middle">{trustBC.toFixed(2)}</text>}
            {nodeC && <text x="440" y="42" className="text-[8px] fill-cyan-400/80 font-bold uppercase" textAnchor="middle">Cloud</text>}
          </svg>
        </div>
      </div>

      {/* Network Metrics Panels */}
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {/* Node A Badge */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between ${binA.hbStatus === "ONLINE" ? "bg-emerald-500/5 border-emerald-500/20" : binA.hbStatus === "WARNING" ? "bg-amber-500/5 border-amber-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
            <span className="text-xs font-semibold text-slate-300">Node A</span>
            <span className="flex items-center gap-1 text-[10px] font-bold">
              {binA.hbStatus === "ONLINE" ? <><Wifi className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Online</span></> : binA.hbStatus === "WARNING" ? <><Wifi className="h-3 w-3 text-amber-400" /><span className="text-amber-400">Warning</span></> : <><WifiOff className="h-3 w-3 text-rose-400" /><span className="text-rose-400">Offline</span></>}
            </span>
          </div>

          {/* Node B Badge */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between ${binB.hbStatus === "ONLINE" ? "bg-emerald-500/5 border-emerald-500/20" : binB.hbStatus === "WARNING" ? "bg-amber-500/5 border-amber-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
            <span className="text-xs font-semibold text-slate-300">Node B</span>
            <span className="flex items-center gap-1 text-[10px] font-bold">
              {binB.hbStatus === "ONLINE" ? <><Wifi className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Online</span></> : binB.hbStatus === "WARNING" ? <><Wifi className="h-3 w-3 text-amber-400" /><span className="text-amber-400">Warning</span></> : <><WifiOff className="h-3 w-3 text-rose-400" /><span className="text-rose-400">Offline</span></>}
            </span>
          </div>

          {/* Node C Badge */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between ${binC.hbStatus === "ONLINE" ? "bg-emerald-500/5 border-emerald-500/20" : binC.hbStatus === "WARNING" ? "bg-amber-500/5 border-amber-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
            <span className="text-xs font-semibold text-slate-300">Node C</span>
            <span className="flex items-center gap-1 text-[10px] font-bold">
              {binC.hbStatus === "ONLINE" ? <><Wifi className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Online</span></> : binC.hbStatus === "WARNING" ? <><Wifi className="h-3 w-3 text-amber-400" /><span className="text-amber-400">Warning</span></> : <><WifiOff className="h-3 w-3 text-rose-400" /><span className="text-rose-400">Offline</span></>}
            </span>
          </div>
        </div>

        {/* Link Trust Metrics */}
        <div className="space-y-3 pt-2">
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-slate-400 flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-indigo-400" /> Link Trust: <span className="font-bold text-slate-200">A → B</span></span>
              {!nodeA ? <span className="font-mono font-bold text-slate-500">Node A Offline</span> : <span className={`font-mono font-bold ${trustAB >= 0.95 ? "text-emerald-400" : trustAB >= 0.85 ? "text-amber-400" : "text-rose-400"}`}>{trustAB.toFixed(2)}</span>}
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${!nodeA ? "from-slate-700 to-slate-600" : trustAB >= 0.95 ? "from-emerald-400 to-teal-500" : trustAB >= 0.85 ? "from-amber-400 to-orange-500" : "from-rose-500 to-red-600"}`} style={{ width: nodeA ? `${trustAB * 100}%` : "0%" }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-slate-400 flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-indigo-400" /> Link Trust: <span className="font-bold text-slate-200">B → C</span></span>
              {!nodeB ? <span className="font-mono font-bold text-slate-500">Node B Offline</span> : <span className={`font-mono font-bold ${trustBC >= 0.95 ? "text-emerald-400" : trustBC >= 0.85 ? "text-amber-400" : "text-rose-400"}`}>{trustBC.toFixed(2)}</span>}
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${!nodeB ? "from-slate-700 to-slate-600" : trustBC >= 0.95 ? "from-emerald-400 to-teal-500" : trustBC >= 0.85 ? "from-amber-400 to-orange-500" : "from-rose-500 to-red-600"}`} style={{ width: nodeB ? `${trustBC * 100}%` : "0%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
