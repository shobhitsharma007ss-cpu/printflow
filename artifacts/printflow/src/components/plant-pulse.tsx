import React, { useMemo } from "react";

/* PLANT PULSE — living press hero for the wall TV.
   Pure CSS animations (transform/opacity only → 60fps on stick PC).
   Speed of everything maps to REAL data: fastest running machine's SPH.
   Respects prefers-reduced-motion. Self-contained: no framer, no deps. */

type M = { status?: string | null; speedPerHour?: number | null };

export function PlantPulse({ machines }: { machines: M[] | undefined }) {
  const { running, idle, maint, cycleSec } = useMemo(() => {
    const ms = machines ?? [];
    const running = ms.filter((m) => m.status === "running").length;
    const maint = ms.filter((m) => m.status === "maintenance").length;
    const idle = ms.length - running - maint;
    const maxSph = Math.max(0, ...ms.filter((m) => m.status === "running").map((m) => m.speedPerHour ?? 0));
    // 12,000 sph → 1.1s cylinder cycle; 5,000 → 2.6s; nothing running → slow ghost 6s
    const cycleSec = maxSph > 0 ? Math.max(0.8, Math.min(3, 13200 / maxSph)) : 6;
    return { running, idle, maint, cycleSec };
  }, [machines]);

  const live = running > 0;
  const pulseClass = running >= 3 ? "pp-ecg-high" : running >= 1 ? "pp-ecg-med" : "pp-ecg-flat";

  return (
    <div className="pp-wrap relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0b0f14] p-4 md:p-5">
      <style>{PP_CSS}</style>

      {/* header row: counts */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Plant Pulse</p>
        <div className="flex items-center gap-4 text-xs font-bold tabular-nums">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <i className="pp-dot bg-emerald-400" style={{ animationDuration: live ? "1.6s" : "0s" }} />
            {running} running
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <i className="pp-dot bg-slate-500" style={{ animation: "none" }} />
            {idle} idle
          </span>
          {maint > 0 && (
            <span className="flex items-center gap-1.5 text-rose-400">
              <i className="pp-dot bg-rose-400" style={{ animationDuration: "1.2s" }} />
              {maint} maintenance
            </span>
          )}
        </div>
      </div>

      {/* the living press */}
      <svg
        viewBox="0 0 900 190"
        className={live ? "pp-live w-full h-auto" : "pp-idle w-full h-auto"}
        style={{ ["--cyc" as string]: `${cycleSec}s` }}
        role="img"
        aria-label="Live press animation"
      >
        {/* base line */}
        <rect x="20" y="158" width="860" height="6" rx="3" fill="#1e293b" />

        {/* FEEDER: paper pile */}
        <g>
          <rect x="34" y="128" width="70" height="30" rx="3" fill="#334155" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={38} y={124 - i * 5} width={62} height={4} rx={2} fill="#cbd5e1" opacity={0.9 - i * 0.15} />
          ))}
          <text x="69" y="180" textAnchor="middle" fontSize="10" fill="#475569" fontWeight="700">FEEDER</text>
        </g>

        {/* sheet path — traveling dashes */}
        <path
          d="M 104 120 L 780 120"
          stroke="#e2e8f0"
          strokeWidth="2.5"
          strokeDasharray="16 26"
          className="pp-sheet"
          fill="none"
          strokeLinecap="round"
        />

        {/* 4 INK UNITS + COATER */}
        {[
          { x: 150, c: "#22d3ee", label: "C" },
          { x: 280, c: "#e879f9", label: "M" },
          { x: 410, c: "#facc15", label: "Y" },
          { x: 540, c: "#94a3b8", label: "K" },
          { x: 670, c: "#34d399", label: "COAT" },
        ].map((u, i) => (
          <g key={i}>
            {/* glow under unit */}
            <ellipse cx={u.x + 40} cy={150} rx={42} ry={9} fill={u.c} className="pp-glow" style={{ animationDelay: `${i * 0.18}s` }} />
            {/* tower */}
            <rect x={u.x} y={52} width={80} height={106} rx={8} fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
            {/* ink duct tint */}
            <rect x={u.x + 12} y={60} width={56} height={10} rx={5} fill={u.c} opacity="0.85" />
            {/* upper cylinder — rotates */}
            <g className="pp-cyl" style={{ transformOrigin: `${u.x + 40}px 96px` }}>
              <circle cx={u.x + 40} cy={96} r={17} fill="#1e293b" stroke="#475569" strokeWidth="2" />
              <line x1={u.x + 40} y1={82} x2={u.x + 40} y2={96} stroke={u.c} strokeWidth="3" strokeLinecap="round" />
            </g>
            {/* lower cylinder — counter-rotates */}
            <g className="pp-cyl-r" style={{ transformOrigin: `${u.x + 40}px 132px` }}>
              <circle cx={u.x + 40} cy={132} r={13} fill="#1e293b" stroke="#475569" strokeWidth="2" />
              <line x1={u.x + 40} y1={132} x2={u.x + 50} y2={132} stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
            </g>
            <text x={u.x + 40} y={44} textAnchor="middle" fontSize="11" fill={u.c} fontWeight="800">{u.label}</text>
          </g>
        ))}

        {/* DELIVERY: growing stack */}
        <g>
          <rect x="790" y="128" width="76" height="30" rx="3" fill="#334155" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={794} y={124 - i * 5} width={68} height={4} rx={2} fill="#e2e8f0" opacity={0.85 - i * 0.15} />
          ))}
          {/* landing sheet */}
          <rect x="794" y="100" width="68" height="4" rx="2" fill="#ffffff" className="pp-land" />
          <text x="828" y="180" textAnchor="middle" fontSize="10" fill="#475569" fontWeight="700">DELIVERY</text>
        </g>
      </svg>

      {/* ECG plant heartbeat */}
      <svg viewBox="0 0 900 34" className="w-full h-auto mt-1" aria-hidden="true">
        <path
          d={
            running >= 3
              ? "M0 17 L120 17 L140 4 L160 30 L180 17 L340 17 L360 2 L385 32 L410 17 L560 17 L580 6 L600 28 L620 17 L900 17"
              : running >= 1
                ? "M0 17 L200 17 L220 8 L245 26 L270 17 L520 17 L540 9 L565 25 L590 17 L900 17"
                : "M0 17 L900 17"
          }
          stroke={live ? "#34d399" : "#334155"}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          className={`pp-ecg ${pulseClass}`}
        />
      </svg>
    </div>
  );
}

const PP_CSS = `
.pp-dot{display:inline-block;width:8px;height:8px;border-radius:9999px;animation:ppBlink 1.6s ease-in-out infinite}
@keyframes ppBlink{0%,100%{opacity:1}50%{opacity:.35}}

.pp-live .pp-cyl{animation:ppSpin var(--cyc) linear infinite}
.pp-live .pp-cyl-r{animation:ppSpinR calc(var(--cyc)*0.72) linear infinite}
.pp-live .pp-sheet{animation:ppTravel calc(var(--cyc)*0.9) linear infinite}
.pp-live .pp-glow{opacity:.16;animation:ppGlow calc(var(--cyc)*2) ease-in-out infinite}
.pp-live .pp-land{animation:ppLand calc(var(--cyc)*1.8) ease-in infinite}
.pp-idle .pp-cyl,.pp-idle .pp-cyl-r{animation:ppSpin 14s linear infinite}
.pp-idle .pp-sheet{opacity:.15}
.pp-idle .pp-glow{opacity:.05}
.pp-idle .pp-land{opacity:0}

@keyframes ppSpin{to{transform:rotate(360deg)}}
@keyframes ppSpinR{to{transform:rotate(-360deg)}}
@keyframes ppTravel{to{stroke-dashoffset:-42}}
@keyframes ppGlow{0%,100%{opacity:.10}50%{opacity:.30}}
@keyframes ppLand{0%{transform:translateY(-26px);opacity:0}25%{opacity:1}55%{transform:translateY(0);opacity:1}100%{transform:translateY(0);opacity:0}}

.pp-ecg{stroke-dasharray:1200;stroke-dashoffset:1200}
.pp-ecg-high{animation:ppEcg 2.2s linear infinite}
.pp-ecg-med{animation:ppEcg 3.6s linear infinite}
.pp-ecg-flat{animation:ppEcg 8s linear infinite;opacity:.5}
@keyframes ppEcg{to{stroke-dashoffset:0}}

@media (prefers-reduced-motion: reduce){
  .pp-wrap *{animation:none !important}
}
`;
