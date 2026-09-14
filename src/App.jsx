import React, { useState, useMemo, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Ship, Anchor, TrendingUp, TrendingDown, Minus, AlertTriangle,
  CheckCircle2, XCircle, Compass, Clock, DollarSign, Sparkles,
  ArrowRight, RefreshCw, MapPin, Gauge, LayoutDashboard, FileInput,
  GitCompare, Info
} from "lucide-react";

/* ============================================================
   DEMO / PROTOTYPE DATA
   All figures below are illustrative and clearly labeled as
   demo data. In production these are replaced by live feeds
   (AIS, Baltic Exchange, port authority APIs) via the same
   engine functions.
   ============================================================ */

const PORTS = [
  { id: "paradip", name: "Paradip", maxDraft: 18.0, maxLOA: 300, maxBeam: 45.0, handlingRate: 25000, congestion: "Moderate" },
  { id: "vizag", name: "Visakhapatnam", maxDraft: 17.0, maxLOA: 280, maxBeam: 43.0, handlingRate: 22000, congestion: "Low" },
  { id: "gangavaram", name: "Gangavaram", maxDraft: 20.0, maxLOA: 320, maxBeam: 48.0, handlingRate: 30000, congestion: "Low" },
  { id: "gopalpur", name: "Gopalpur", maxDraft: 15.0, maxLOA: 230, maxBeam: 32.0, handlingRate: 15000, congestion: "Low" },
  { id: "dhamra", name: "Dhamra", maxDraft: 18.5, maxLOA: 300, maxBeam: 45.0, handlingRate: 28000, congestion: "Moderate" },
  { id: "sagar", name: "Sagar / Sandheads", maxDraft: 13.0, maxLOA: 230, maxBeam: 32.0, handlingRate: 12000, congestion: "High" },
  { id: "haldia", name: "Haldia", maxDraft: 9.5, maxLOA: 186, maxBeam: 28.0, handlingRate: 10000, congestion: "High" },
];

const VESSELS = [
  { id: "handysize", name: "Handysize", dwt: 35000, draft: 10.5, loa: 190, beam: 29.0, speed: 14.0, dailyCost: 9000, costFactor: 1.08 },
  { id: "supramax", name: "Supramax", dwt: 58000, draft: 12.5, loa: 200, beam: 32.3, speed: 14.0, dailyCost: 11500, costFactor: 1.0 },
  { id: "panamax", name: "Panamax", dwt: 82000, draft: 14.5, loa: 229, beam: 32.3, speed: 14.5, dailyCost: 14000, costFactor: 0.94 },
  { id: "capesize", name: "Capesize", dwt: 180000, draft: 18.0, loa: 290, beam: 45.0, speed: 14.5, dailyCost: 22000, costFactor: 0.88 },
];

const ORIGINS = [
  { id: "australia", name: "Australia", distanceNm: 4300 },
  { id: "usa", name: "USA (Gulf Coast)", distanceNm: 11800 },
  { id: "mozambique", name: "Mozambique", distanceNm: 4700 },
  { id: "russia", name: "Russia (Far East)", distanceNm: 4600 },
  { id: "indonesia", name: "Indonesia", distanceNm: 2800 },
];

const CARGO_TYPES = ["Coal", "Iron Ore Pellets", "Limestone", "Coke"];

/* ============================================================
   DETERMINISTIC PRNG (seeded by route so charts stay stable
   for a given origin/destination but vary across scenarios)
   ============================================================ */

function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/* ============================================================
   ENGINE 1 — MARKET / FREIGHT HISTORY + FORECAST
   (stand-in for the Python XGBoost + Prophet pipeline; same
   feature logic — lagged rate, BDI level/delta, seasonality —
   reimplemented client-side for a self-contained demo)
   ============================================================ */

function generateMarketHistory(seed) {
  const rand = hashSeed(seed);
  const months = 24;
  let bdi = 1350 + rand() * 200;
  let rate = 14 + rand() * 3;
  const history = [];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const seasonal = Math.sin((d.getMonth() / 12) * Math.PI * 2) * 60;
    const drift = 3.2 + Math.sin(i / 5) * 2.5; // gentle upward-biased drift
    const noise = (rand() - 0.5) * 90;
    bdi = Math.max(650, bdi + drift + seasonal * 0.15 + noise);
    const rateNoise = (rand() - 0.5) * 1.1;
    rate = Math.max(6, rate + drift * 0.03 + rateNoise);
    history.push({
      month: `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
      bdi: Math.round(bdi),
      rate: Math.round(rate * 100) / 100,
      isDemo: true,
    });
  }
  return history;
}

function computeForecast(history, horizonMonths = 3) {
  const n = history.length;
  const recent = history.slice(n - 6);
  const xs = recent.map((_, i) => i);
  const ys = recent.map((h) => h.rate);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - meanX) * (ys[i] - meanY); den += (x - meanX) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  const lastRate = history[n - 1].rate;
  const lastBdi = history[n - 1].bdi;
  const prevBdi = history[n - 7]?.bdi ?? lastBdi;
  const bdiDelta = lastBdi - prevBdi;

  const std = Math.sqrt(ys.reduce((s, y) => s + (y - meanY) ** 2, 0) / ys.length);
  const volatility = std / meanY; // coefficient of variation, drives confidence + risk

  const forecastPoints = [];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const lastDate = new Date();
  for (let i = 1; i <= horizonMonths; i++) {
    const projected = lastRate + slope * i + bdiDelta * 0.002 * i;
    const band = projected * (0.06 + volatility * 0.9);
    const d = new Date(lastDate.getFullYear(), lastDate.getMonth() + i, 1);
    forecastPoints.push({
      month: `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
      forecast: Math.round(projected * 100) / 100,
      low: Math.round((projected - band) * 100) / 100,
      high: Math.round((projected + band) * 100) / 100,
      isDemo: true,
    });
  }

  const trendPctPerMonth = (slope / meanY) * 100;
  const trend = trendPctPerMonth > 0.6 ? "increasing" : trendPctPerMonth < -0.6 ? "decreasing" : "stable";

  return {
    forecastPoints,
    trend,
    trendPctPerMonth: Math.round(trendPctPerMonth * 10) / 10,
    volatility: Math.round(volatility * 1000) / 1000,
    lastRate,
    lastBdi,
    bdiTrend: bdiDelta > 15 ? "increasing" : bdiDelta < -15 ? "decreasing" : "stable",
    confidence: volatility < 0.05 ? "High" : volatility < 0.1 ? "Medium" : "Low",
  };
}

/* ============================================================
   ENGINE 2 — VESSEL COMPATIBILITY + COST
   ============================================================ */

function computeVesselOptions(quantityTonnes, originId, destPort, forecast) {
  const origin = ORIGINS.find((o) => o.id === originId);
  return VESSELS.map((v) => {
    const capacityFit = v.dwt >= quantityTonnes;
    const portFit =
      v.draft <= destPort.maxDraft && v.loa <= destPort.maxLOA && v.beam <= destPort.maxBeam;
    const compatible = capacityFit && portFit;

    const transitDays = origin.distanceNm / (v.speed * 24);
    const portDays = quantityTonnes / destPort.handlingRate + 1.5; // + berthing buffer
    const roundTripDays = transitDays * 2 + portDays;

    const freightCost = forecast.lastRate * v.costFactor * quantityTonnes;
    const utilization = Math.min(1, quantityTonnes / v.dwt);
    const underUtilPenalty = utilization < 0.55 ? (0.55 - utilization) * v.dailyCost * 4 : 0;
    const voyageCost = v.dailyCost * roundTripDays + underUtilPenalty;
    const totalCost = Math.round(freightCost + voyageCost);

    let disqualifyReason = null;
    if (!capacityFit) disqualifyReason = `Cargo quantity (${quantityTonnes.toLocaleString()} t) exceeds practical single-shipment capacity`;
    else if (!portFit) disqualifyReason = `Vessel dimensions exceed ${destPort.name} berth limits`;

    return {
      ...v,
      compatible,
      disqualifyReason,
      transitDays: Math.round(transitDays * 10) / 10,
      roundTripDays: Math.round(roundTripDays * 10) / 10,
      totalCost,
      costPerTonne: Math.round((totalCost / quantityTonnes) * 100) / 100,
      utilization: Math.round(utilization * 100),
    };
  });
}

/* ============================================================
   ENGINE 3 — PORT COMPATIBILITY EXPLANATION
   ============================================================ */

function explainPortCompatibility(vessel, port) {
  const checks = [
    { label: "Draft", ok: vessel.draft <= port.maxDraft, detail: `${vessel.draft} m vessel vs ${port.maxDraft} m max` },
    { label: "LOA", ok: vessel.loa <= port.maxLOA, detail: `${vessel.loa} m vessel vs ${port.maxLOA} m max` },
    { label: "Beam", ok: vessel.beam <= port.maxBeam, detail: `${vessel.beam} m vessel vs ${port.maxBeam} m max` },
  ];
  return { compatible: checks.every((c) => c.ok), checks };
}

/* ============================================================
   ENGINE 4 — RISK
   ============================================================ */

function computeRisk(forecast, destPort, bestVessel) {
  let score = 0;
  const reasons = [];

  if (forecast.volatility > 0.09) { score += 2; reasons.push("Freight-rate volatility is elevated over the trailing 6 months"); }
  else if (forecast.volatility > 0.05) { score += 1; reasons.push("Freight-rate volatility is moderate"); }

  if (destPort.congestion === "High") { score += 2; reasons.push(`${destPort.name} is currently reporting high congestion`); }
  else if (destPort.congestion === "Moderate") { score += 1; reasons.push(`${destPort.name} is reporting moderate congestion`); }

  if (bestVessel && bestVessel.utilization < 60) { score += 1; reasons.push(`Recommended vessel utilization is only ${bestVessel.utilization}%, raising cost-efficiency risk`); }

  if (forecast.trend === "increasing") { score += 1; reasons.push("Rising rate trend increases the cost of delayed booking"); }

  const level = score >= 4 ? "High" : score >= 2 ? "Medium" : "Low";
  if (reasons.length === 0) reasons.push("Market volatility, port congestion and vessel fit are all within normal ranges");
  return { level, reasons: reasons.slice(0, 4) };
}

/* ============================================================
   ENGINE 5 — IDLE TIME
   ============================================================ */

function computeIdleTime(destPort, vessel) {
  let idleDays = 0;
  const causes = [];
  if (destPort.congestion === "High") { idleDays += 3.5; causes.push("Berth waiting time due to port congestion"); }
  else if (destPort.congestion === "Moderate") { idleDays += 1.5; causes.push("Minor berth queuing expected"); }
  if (vessel && vessel.utilization < 55) { idleDays += 1; causes.push("Low cargo utilization increases scheduling friction"); }
  if (causes.length === 0) causes.push("No material idle-time drivers identified");
  return { idleDays: Math.round(idleDays * 10) / 10, causes };
}

/* ============================================================
   ENGINE 6 — CHARTERING DECISION (explainable, rule-based)
   ============================================================ */

function computeDecision(forecast, risk, best, alt) {
  const reasons = [];
  let action = "BOOK WITHIN WINDOW";
  let windowDays = 14;

  if (forecast.trend === "increasing") {
    windowDays = forecast.volatility > 0.08 ? 5 : 10;
    action = windowDays <= 7 ? "BOOK NOW" : "BOOK WITHIN WINDOW";
    reasons.push(`Forecast indicates a rising freight-rate trend (${forecast.trendPctPerMonth}%/month)`);
  } else if (forecast.trend === "decreasing") {
    action = "WAIT";
    windowDays = 21;
    reasons.push(`Forecast indicates a softening freight-rate trend (${forecast.trendPctPerMonth}%/month)`);
  } else {
    windowDays = 14;
    reasons.push("Freight rates are expected to remain broadly stable in the short term");
  }

  if (risk.level === "High") { windowDays = Math.max(3, windowDays - 5); reasons.push("Elevated risk favors locking in terms sooner rather than later"); }
  if (best) reasons.push(`${best.name} offers the best balance of cost, capacity fit and port compatibility`);
  if (alt && best) {
    const savings = alt.totalCost - best.totalCost;
    if (savings > 0) reasons.push(`Estimated cost advantage over ${alt.name}: $${savings.toLocaleString()}`);
  }

  return { action, windowDays, reasons: reasons.slice(0, 4) };
}

/* ============================================================
   FULL PIPELINE
   ============================================================ */

function runPipeline({ cargoType, quantity, originId, destPortId }) {
  const destPort = PORTS.find((p) => p.id === destPortId);
  const origin = ORIGINS.find((o) => o.id === originId);
  const seed = `${originId}-${destPortId}-${cargoType}-${quantity}`;

  const history = generateMarketHistory(seed);
  const forecast = computeForecast(history);
  const vesselOptions = computeVesselOptions(quantity, originId, destPort, forecast);

  const compatibleOptions = vesselOptions.filter((v) => v.compatible).sort((a, b) => a.totalCost - b.totalCost);
  const best = compatibleOptions[0] || null;
  const alt = compatibleOptions[1] || null;

  const portExplain = best ? explainPortCompatibility(best, destPort) : null;
  const risk = computeRisk(forecast, destPort, best);
  const idle = computeIdleTime(destPort, best);
  const decision = computeDecision(forecast, risk, best, alt);

  const savings = best && alt ? alt.totalCost - best.totalCost : 0;

  return {
    cargoType, quantity, origin, destPort,
    history, forecast, vesselOptions, best, alt,
    portExplain, risk, idle, decision, savings,
  };
}

/* ============================================================
   SMALL UI PRIMITIVES
   ============================================================ */

function Panel({ children, className = "" }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-lg ${className}`}>
      {children}
    </div>
  );
}

function Eyebrow({ children }) {
  return <div className="text-[11px] font-semibold tracking-widest uppercase text-amber-400/90 mb-1">{children}</div>;
}

function KPICard({ icon: Icon, label, value, sub, accent = "text-slate-100" }) {
  return (
    <Panel className="p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
        <Icon size={16} className="text-slate-600" />
      </div>
      <div className={`font-mono text-2xl font-semibold ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </Panel>
  );
}

function RiskBadge({ level }) {
  const map = {
    Low: "bg-teal-400/10 text-teal-400 border-teal-400/30",
    Medium: "bg-amber-400/10 text-amber-400 border-amber-400/30",
    High: "bg-rose-400/10 text-rose-400 border-rose-400/30",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${map[level]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" /> {level} Risk
    </span>
  );
}

function DemoTag() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-800 text-slate-400 border border-slate-700">
      <Info size={10} /> Simulated Dataset
    </span>
  );
}

function TrendIcon({ trend, size = 14 }) {
  if (trend === "increasing") return <TrendingUp size={size} className="text-rose-400" />;
  if (trend === "decreasing") return <TrendingDown size={size} className="text-teal-400" />;
  return <Minus size={size} className="text-slate-400" />;
}

/* ============================================================
   FORM
   ============================================================ */

function AnalysisForm({ formData, setFormData, onSubmit, loading }) {
  return (
    <Panel className="p-6">
      <Eyebrow>New Chartering Analysis</Eyebrow>
      <h2 className="text-lg font-semibold text-slate-100 mb-5">Describe the shipment</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Cargo type</label>
          <select
            value={formData.cargoType}
            onChange={(e) => setFormData({ ...formData, cargoType: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            {CARGO_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Quantity (tonnes)</label>
          <input
            type="number"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Origin</label>
          <select
            value={formData.originId}
            onChange={(e) => setFormData({ ...formData, originId: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            {ORIGINS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Destination port</label>
          <select
            value={formData.destPortId}
            onChange={(e) => setFormData({ ...formData, destPortId: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            {PORTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Contract duration</label>
          <select
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            <option>1 month</option><option>3 months</option><option>6 months</option><option>12 months</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Required shipment window</label>
          <input
            type="date"
            value={formData.period}
            onChange={(e) => setFormData({ ...formData, period: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          />
        </div>
      </div>
      <button
        onClick={onSubmit}
        disabled={loading}
        className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 font-semibold text-sm px-5 py-2.5 rounded-md transition-colors"
      >
        {loading ? <><RefreshCw size={15} className="animate-spin" /> Running analysis…</> : <>Run Analysis <ArrowRight size={15} /></>}
      </button>
    </Panel>
  );
}

const LOADING_STAGES = [
  "Pulling freight & BDI history",
  "Forecasting freight-rate trend",
  "Checking vessel compatibility",
  "Checking port constraints",
  "Assessing risk",
  "Optimizing chartering window",
];

function LoadingSequence({ stage }) {
  return (
    <Panel className="p-6">
      <div className="space-y-3">
        {LOADING_STAGES.map((s, i) => (
          <div key={s} className="flex items-center gap-3 text-sm">
            {i < stage ? <CheckCircle2 size={16} className="text-teal-400 shrink-0" /> :
             i === stage ? <RefreshCw size={16} className="text-amber-400 animate-spin shrink-0" /> :
             <span className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />}
            <span className={i <= stage ? "text-slate-200" : "text-slate-600"}>{s}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ============================================================
   RESULT / DASHBOARD VIEW
   ============================================================ */

function VesselOptionCard({ v, isBest }) {
  return (
    <div className={`rounded-lg border p-4 ${isBest ? "border-amber-400/50 bg-amber-400/5" : "border-slate-800 bg-slate-950/40"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Ship size={16} className={isBest ? "text-amber-400" : "text-slate-500"} />
          <span className="font-semibold text-slate-100 text-sm">{v.name}</span>
          {isBest && <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded">Recommended</span>}
        </div>
        {v.compatible ? <CheckCircle2 size={16} className="text-teal-400" /> : <XCircle size={16} className="text-rose-400" />}
      </div>
      {v.compatible ? (
        <div className="grid grid-cols-3 gap-2 text-xs text-slate-400 font-mono">
          <div>DWT {v.dwt.toLocaleString()}t</div>
          <div>{v.roundTripDays}d transit</div>
          <div>{v.utilization}% util</div>
          <div className="col-span-2 text-slate-200 text-sm">${v.totalCost.toLocaleString()}</div>
          <div>${v.costPerTonne}/t</div>
        </div>
      ) : (
        <div className="text-xs text-rose-400/80">{v.disqualifyReason}</div>
      )}
    </div>
  );
}

function ForecastChart({ history, forecastPoints }) {
  const data = [
    ...history.map((h) => ({ month: h.month, historical: h.rate })),
    ...forecastPoints.map((f) => ({ month: f.month, forecast: f.forecast, low: f.low, high: f.high })),
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} interval={2} />
        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={30} />
        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="historical" name="Historical rate ($/t)" stroke="#94a3b8" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="forecast" name="Forecast ($/t)" stroke="#fbbf24" strokeDasharray="5 3" dot={{ r: 3 }} strokeWidth={2} />
        <Line type="monotone" dataKey="high" name="Upper band" stroke="#fbbf24" strokeOpacity={0.25} dot={false} strokeWidth={1} />
        <Line type="monotone" dataKey="low" name="Lower band" stroke="#fbbf24" strokeOpacity={0.25} dot={false} strokeWidth={1} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BDIChart({ history }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="bdiFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} interval={3} />
        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={35} />
        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} />
        <Area type="monotone" dataKey="bdi" name="Baltic Dry Index" stroke="#2dd4bf" fill="url(#bdiFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function CostCompareChart({ vesselOptions }) {
  const data = vesselOptions.filter((v) => v.compatible).map((v) => ({ name: v.name, cost: v.totalCost }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} />
        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={45} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} formatter={(v) => `$${v.toLocaleString()}`} />
        <Bar dataKey="cost" fill="#fbbf24" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CharterWindowBar({ decision }) {
  const total = 30;
  const pct = Math.min(100, (decision.windowDays / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
        <span>Today</span><span>30 days</span>
      </div>
      <div className="relative h-2.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-amber-300 rounded-full" style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 border-l-2 border-slate-950" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-xs font-mono text-amber-400">Recommended window: day 0 – day {decision.windowDays}</div>
    </div>
  );
}

function Dashboard({ result }) {
  const { forecast, history, vesselOptions, best, alt, portExplain, risk, idle, decision, savings, destPort, origin, cargoType, quantity } = result;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Eyebrow>Chartering Recommendation</Eyebrow>
          <h2 className="text-lg font-semibold text-slate-100">
            {quantity.toLocaleString()} t {cargoType} · {origin.name} → {destPort.name}
          </h2>
        </div>
        <DemoTag />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KPICard icon={Compass} label="Current BDI" value={forecast.lastBdi.toLocaleString()} sub={`${forecast.bdiTrend}`} />
        <KPICard icon={DollarSign} label="Forecast rate" value={`$${forecast.forecastPoints[0]?.forecast}/t`} sub={forecast.trend} />
        <KPICard icon={Ship} label="Recommended vessel" value={best ? best.name : "—"} accent="text-amber-400" />
        <KPICard icon={Clock} label="Charter window" value={`${decision.windowDays}d`} sub={decision.action} />
        <KPICard icon={AlertTriangle} label="Risk" value={risk.level} accent={risk.level === "High" ? "text-rose-400" : risk.level === "Medium" ? "text-amber-400" : "text-teal-400"} />
        <KPICard icon={Sparkles} label="Potential savings" value={`$${savings.toLocaleString()}`} accent="text-teal-400" sub="vs. next-best option" />
      </div>

      {/* Decision panel */}
      <Panel className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-wide bg-amber-400 text-slate-950 px-2 py-1 rounded">{decision.action}</span>
          <span className="text-sm text-slate-400">Charter within {decision.windowDays} days</span>
        </div>
        <CharterWindowBar decision={decision} />
        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          {decision.reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <CheckCircle2 size={14} className="text-teal-400 mt-0.5 shrink-0" /> {r}
            </div>
          ))}
        </div>
      </Panel>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel className="p-4">
          <Eyebrow>Historical vs. forecast freight rate</Eyebrow>
          <ForecastChart history={history} forecastPoints={forecast.forecastPoints} />
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center justify-between mb-1">
            <Eyebrow>Baltic Dry Index trend</Eyebrow>
            <TrendIcon trend={forecast.bdiTrend} />
          </div>
          <BDIChart history={history} />
          <p className="text-xs text-slate-500 mt-2">
            BDI reflects overall dry-bulk shipping demand. A rising BDI tends to push route-specific freight rates
            up over the following weeks — it is one input into the forecast, not the sole determinant.
          </p>
        </Panel>
      </div>

      {/* Vessel + Port */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel className="p-4">
          <Eyebrow>Vessel options</Eyebrow>
          <div className="space-y-2 mt-2">
            {vesselOptions.map((v) => <VesselOptionCard key={v.id} v={v} isBest={best && v.id === best.id} />)}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel className="p-4">
            <Eyebrow>Port compatibility — {destPort.name}</Eyebrow>
            {portExplain && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  {portExplain.compatible ? <CheckCircle2 size={18} className="text-teal-400" /> : <XCircle size={18} className="text-rose-400" />}
                  <span className={`font-semibold text-sm ${portExplain.compatible ? "text-teal-400" : "text-rose-400"}`}>
                    {portExplain.compatible ? "Compatible" : "Not Compatible"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {portExplain.checks.map((c) => (
                    <div key={c.label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{c.label}</span>
                      <span className={`font-mono ${c.ok ? "text-slate-300" : "text-rose-400"}`}>{c.detail}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500 flex items-center justify-between">
                  <span>Congestion status</span><span className="text-slate-300">{destPort.congestion}</span>
                </div>
              </>
            )}
          </Panel>
          <Panel className="p-4">
            <Eyebrow>Risk assessment</Eyebrow>
            <div className="mb-2"><RiskBadge level={risk.level} /></div>
            <ul className="space-y-1.5 mt-2">
              {risk.reasons.map((r, i) => (
                <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                  <span className="text-slate-600 mt-0.5">•</span> {r}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* Cost + Idle */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel className="p-4">
          <Eyebrow>Vessel cost comparison</Eyebrow>
          <CostCompareChart vesselOptions={vesselOptions} />
          {best && alt && (
            <div className="mt-2 text-xs text-slate-400">
              <span className="text-teal-400 font-semibold">Estimated saving</span> of ${savings.toLocaleString()} choosing {best.name} over {alt.name}.
            </div>
          )}
        </Panel>
        <Panel className="p-4">
          <Eyebrow>Idle-time exposure</Eyebrow>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-mono text-2xl text-slate-100">{idle.idleDays}d</span>
            <span className="text-xs text-slate-500">estimated idle time</span>
          </div>
          <ul className="space-y-1.5">
            {idle.causes.map((c, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <span className="text-slate-600 mt-0.5">•</span> {c}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Route */}
      <Panel className="p-5">
        <Eyebrow>Voyage route</Eyebrow>
        <div className="flex items-center gap-3 mt-3">
          <div className="flex flex-col items-center">
            <MapPin size={18} className="text-amber-400" />
            <span className="text-xs text-slate-300 mt-1">{origin.name}</span>
          </div>
          <div className="flex-1 relative h-px bg-slate-700">
            <div className="absolute inset-0 border-t border-dashed border-slate-600" />
            <Ship size={16} className="absolute -top-2 left-1/3 text-amber-400" />
          </div>
          <div className="flex flex-col items-center">
            <Anchor size={18} className="text-teal-400" />
            <span className="text-xs text-slate-300 mt-1">{destPort.name}</span>
          </div>
        </div>
        <div className="text-xs text-slate-500 mt-3">
          ~{origin.distanceNm.toLocaleString()} nm · {best ? `${best.transitDays} days transit at ${best.name} service speed` : ""} (demo route distance)
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================
   WHAT-IF SIMULATOR
   ============================================================ */

function ScenarioForm({ label, data, setData }) {
  return (
    <Panel className="p-4">
      <Eyebrow>{label}</Eyebrow>
      <div className="space-y-3 mt-2">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Quantity (t)</label>
          <input type="number" value={data.quantity} onChange={(e) => setData({ ...data, quantity: Number(e.target.value) })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-sm text-slate-100 font-mono" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Origin</label>
          <select value={data.originId} onChange={(e) => setData({ ...data, originId: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-sm text-slate-100">
            {ORIGINS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Destination port</label>
          <select value={data.destPortId} onChange={(e) => setData({ ...data, destPortId: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-sm text-slate-100">
            {PORTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
    </Panel>
  );
}

function WhatIf() {
  const [a, setA] = useState({ cargoType: "Coal", quantity: 80000, originId: "australia", destPortId: "paradip" });
  const [b, setB] = useState({ cargoType: "Coal", quantity: 80000, originId: "australia", destPortId: "vizag" });
  const [results, setResults] = useState(null);

  const compare = () => {
    setResults({ a: runPipeline(a), b: runPipeline(b) });
  };

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>What-If Scenario Simulator</Eyebrow>
        <h2 className="text-lg font-semibold text-slate-100">Compare two chartering strategies</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ScenarioForm label="Scenario A" data={a} setData={setA} />
        <ScenarioForm label="Scenario B" data={b} setData={setB} />
      </div>
      <button onClick={compare} className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm px-5 py-2.5 rounded-md transition-colors">
        <GitCompare size={15} /> Compare scenarios
      </button>

      {results && (
        <Panel className="p-4 overflow-x-auto">
          <Eyebrow>Comparison</Eyebrow>
          <table className="w-full text-sm mt-2 min-w-[520px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3 font-medium">Metric</th>
                <th className="py-2 pr-3 font-medium">Scenario A</th>
                <th className="py-2 font-medium">Scenario B</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-3 text-slate-400">Route</td>
                <td className="py-2 pr-3">{results.a.origin.name} → {results.a.destPort.name}</td>
                <td className="py-2">{results.b.origin.name} → {results.b.destPort.name}</td>
              </tr>
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-3 text-slate-400">Recommended vessel</td>
                <td className="py-2 pr-3 font-mono">{results.a.best?.name ?? "None compatible"}</td>
                <td className="py-2 font-mono">{results.b.best?.name ?? "None compatible"}</td>
              </tr>
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-3 text-slate-400">Estimated cost</td>
                <td className="py-2 pr-3 font-mono">{results.a.best ? `$${results.a.best.totalCost.toLocaleString()}` : "—"}</td>
                <td className="py-2 font-mono">{results.b.best ? `$${results.b.best.totalCost.toLocaleString()}` : "—"}</td>
              </tr>
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-3 text-slate-400">Transit time</td>
                <td className="py-2 pr-3 font-mono">{results.a.best?.transitDays ?? "—"}d</td>
                <td className="py-2 font-mono">{results.b.best?.transitDays ?? "—"}d</td>
              </tr>
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-3 text-slate-400">Risk</td>
                <td className="py-2 pr-3"><RiskBadge level={results.a.risk.level} /></td>
                <td className="py-2"><RiskBadge level={results.b.risk.level} /></td>
              </tr>
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-3 text-slate-400">Idle time</td>
                <td className="py-2 pr-3 font-mono">{results.a.idle.idleDays}d</td>
                <td className="py-2 font-mono">{results.b.idle.idleDays}d</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-slate-400">Decision</td>
                <td className="py-2 pr-3 font-mono text-amber-400">{results.a.decision.action}</td>
                <td className="py-2 font-mono text-amber-400">{results.b.decision.action}</td>
              </tr>
            </tbody>
          </table>
          {results.a.best && results.b.best && (
            <div className="mt-4 text-sm text-slate-300 flex items-center gap-2">
              <Sparkles size={15} className="text-teal-400" />
              {results.a.best.totalCost < results.b.best.totalCost
                ? `Scenario A is estimated to be $${(results.b.best.totalCost - results.a.best.totalCost).toLocaleString()} cheaper.`
                : `Scenario B is estimated to be $${(results.a.best.totalCost - results.b.best.totalCost).toLocaleString()} cheaper.`}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

/* ============================================================
   APP SHELL
   ============================================================ */

export default function App() {
  const [tab, setTab] = useState("input");
  const [formData, setFormData] = useState({
    cargoType: "Coal", quantity: 80000, originId: "australia", destPortId: "paradip",
    duration: "3 months", period: "",
  });
  const [loadingStage, setLoadingStage] = useState(null);
  const [result, setResult] = useState(null);

  const runAnalysis = useCallback((data) => {
    setResult(null);
    setLoadingStage(0);
    let stage = 0;
    const step = () => {
      stage += 1;
      if (stage < LOADING_STAGES.length) {
        setLoadingStage(stage);
        setTimeout(step, 420);
      } else {
        const r = runPipeline(data);
        setResult(r);
        setLoadingStage(null);
        setTab("dashboard");
      }
    };
    setTimeout(step, 420);
  }, []);

  const runDemo = () => {
    const demo = { cargoType: "Coal", quantity: 80000, originId: "australia", destPortId: "paradip", duration: "3 months", period: "" };
    setFormData(demo);
    runAnalysis(demo);
  };

  const tabs = [
    { id: "input", label: "New Analysis", icon: FileInput },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, disabled: !result && loadingStage === null },
    { id: "whatif", label: "What-If", icon: GitCompare },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 sticky top-0 bg-slate-950/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-amber-400 flex items-center justify-center">
              <Ship size={16} className="text-slate-950" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight leading-none">Freight Intelligence</div>
              <div className="text-[10px] text-slate-500 tracking-wide">Chartering Decision Support</div>
            </div>
          </div>
          <button onClick={runDemo} className="hidden sm:inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors">
            <Sparkles size={13} className="text-amber-400" /> Run Analysis
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.id}
              disabled={t.disabled}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 border-b-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                ${tab === t.id ? "border-amber-400 text-amber-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <button onClick={runDemo} className="sm:hidden mb-4 w-full inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-md">
          <Sparkles size={13} className="text-amber-400" /> Run Demo Scenario
        </button>

        {tab === "input" && (
          <div className="space-y-4">
            <AnalysisForm formData={formData} setFormData={setFormData} onSubmit={() => runAnalysis(formData)} loading={loadingStage !== null} />
            {loadingStage !== null && <LoadingSequence stage={loadingStage} />}
          </div>
        )}

        {tab === "dashboard" && (
          result ? <Dashboard result={result} /> : (
            <Panel className="p-8 text-center text-slate-500 text-sm">
              Run an analysis first to see the dashboard.
            </Panel>
          )
        )}

        {tab === "whatif" && <WhatIf />}
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-6 text-[11px] text-slate-600">
        Freight Intelligence uses simulated market, port and vessel data to demonstrate its decision-support capabilities. 
        The platform is designed to integrate live market, vessel and port-authority feeds without requiring changes to the core user interface.
      </footer>
    </div>
  );
}
