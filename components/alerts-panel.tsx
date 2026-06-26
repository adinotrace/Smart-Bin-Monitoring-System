"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMQTT, Alert } from "./mqtt-provider";
import { AlertCircle, Bell, Check, X, ShieldAlert, Sparkles, AlertTriangle, Info } from "lucide-react";

export const AlertsPanel: React.FC = () => {
  const { alerts, dismissAlert, clearAlerts, triggerManualAlert } = useMQTT();
  const [selectedSeverity, setSelectedSeverity] = useState<"all" | "warning" | "critical">("all");

  // Track which alert IDs we have already shown a notification for
  const notifiedIds = useRef<Set<string>>(new Set());

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Fire a desktop notification for every new unread critical or warning alert
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    alerts.forEach((alert) => {
      if (alert.read) return;
      if (notifiedIds.current.has(alert.id)) return;
      if (alert.type !== "critical" && alert.type !== "warning") return;

      notifiedIds.current.add(alert.id);
      new Notification(
        alert.type === "critical" ? "🚨 Critical Alert — Smart Bin" : "⚠️ Warning — Smart Bin",
        {
          body: `[${alert.source}] ${alert.message}`,
          icon: "/favicon.ico",
          tag: alert.id, // prevents duplicate toasts for the same alert
        }
      );
    });
  }, [alerts]);

  const filteredAlerts = alerts.filter((alert) => {
    if (selectedSeverity === "all") return true;
    return alert.type === selectedSeverity;
  });

  const getAlertIcon = (type: Alert["type"]) => {
    switch (type) {
      case "critical":
        return <ShieldAlert className="h-5 w-5 text-rose-400" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-400" />;
      case "info":
      default:
        return <Info className="h-5 w-5 text-cyan-400" />;
    }
  };

  const getAlertBorder = (type: Alert["type"], read: boolean) => {
    if (read) return "border-white/5 bg-slate-950/10 opacity-50";
    switch (type) {
      case "critical":
        return "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.05)]";
      case "warning":
        return "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.05)]";
      case "info":
      default:
        return "border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/50";
    }
  };

  const getAlertTextTheme = (type: Alert["type"]) => {
    switch (type) {
      case "critical":
        return "text-rose-400";
      case "warning":
        return "text-amber-400";
      case "info":
      default:
        return "text-cyan-400";
    }
  };

  // Fault simulation triggers
  const simulateFault = (type: "gas" | "overflow" | "offline" | "trust") => {
    switch (type) {
      case "gas":
        triggerManualAlert("Bin A", "critical", "Toxic/Flammable gas leak detected in Bin A (2950 PPM)!");
        break;
      case "overflow":
        triggerManualAlert("Bin C", "critical", "Bin C is overflowing (96%). Dispatch vehicle immediately!");
        break;
      case "offline":
        triggerManualAlert("Network", "critical", "LoRa Node B failed to transmit packet. Node B Offline.");
        break;
      case "trust":
        triggerManualAlert("Network", "warning", "Routing Link B-C trust index degraded to 0.74 (Potential malicious node).");
        break;
    }
  };

  const hasCritical = alerts.some((a) => !a.read && a.type === "critical");

  return (
    <div className={`glass-card p-6 rounded-2xl border transition-colors duration-500 flex flex-col h-full justify-between ${
      hasCritical ? "border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.08)]" : "border-white/5"
    }`}>
      <div>
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-400 animate-swing" />
            Real-Time System Alerts ({alerts.filter((a) => !a.read).length} active)
          </h3>
          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <button
                onClick={clearAlerts}
                className="text-[10px] uppercase font-bold text-slate-400 hover:text-slate-200 transition-colors bg-slate-900/60 border border-white/5 px-2.5 py-1 rounded-lg"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Severity Filter Tabs */}
        <div className="flex gap-2 mb-4 bg-slate-950/30 p-1 rounded-lg border border-white/5">
          <button
            onClick={() => setSelectedSeverity("all")}
            className={`flex-1 text-[10px] py-1 rounded-md font-bold transition-all ${
              selectedSeverity === "all" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setSelectedSeverity("warning")}
            className={`flex-1 text-[10px] py-1 rounded-md font-bold transition-all ${
              selectedSeverity === "warning" ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Warnings
          </button>
          <button
            onClick={() => setSelectedSeverity("critical")}
            className={`flex-1 text-[10px] py-1 rounded-md font-bold transition-all ${
              selectedSeverity === "critical" ? "bg-rose-500/20 text-rose-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Critical
          </button>
        </div>

        {/* Alerts Log List */}
        <div className="space-y-2.5 max-h-[190px] overflow-y-auto pr-1">
          {filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-950/20 border border-dashed border-white/5 rounded-xl">
              <Check className="h-8 w-8 text-emerald-400 mb-2 opacity-60" />
              <p className="text-xs text-slate-400 font-medium">All systems normal.</p>
              <p className="text-[10px] text-slate-500 mt-0.5">No active alerts reported.</p>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`relative flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 ${getAlertBorder(
                  alert.type,
                  alert.read
                )}`}
              >
                <div className="mt-0.5">{getAlertIcon(alert.type)}</div>
                
                <div className="flex-1 min-w-0 pr-6">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wide ${getAlertTextTheme(alert.type)}`}>
                      {alert.source}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">{alert.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-normal font-medium break-words">
                    {alert.message}
                  </p>
                </div>

                {!alert.read && (
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
                    title="Acknowledge Alert"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Fault Injection Panel */}
      <div className="border-t border-white/5 pt-4 mt-4">
        <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          Demonstration / Fault Injection
        </h4>
        <p className="text-[10px] text-slate-400 mb-3">
          Simulate real-world IoT errors to demonstrate fail-safe routing and alerts logic:
        </p>
        
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => simulateFault("gas")}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-left border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-300 transition-colors flex items-center justify-between"
          >
            Toxic Gas Spike
            <AlertCircle className="h-3 w-3" />
          </button>
          <button
            onClick={() => simulateFault("overflow")}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-left border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-300 transition-colors flex items-center justify-between"
          >
            Bin Overflow
            <AlertCircle className="h-3 w-3" />
          </button>
          <button
            onClick={() => simulateFault("offline")}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-left border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 transition-colors flex items-center justify-between"
          >
            Node A/B Offline
            <AlertCircle className="h-3 w-3" />
          </button>
          <button
            onClick={() => simulateFault("trust")}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-left border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 transition-colors flex items-center justify-between"
          >
            Trust Degradation
            <AlertCircle className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
