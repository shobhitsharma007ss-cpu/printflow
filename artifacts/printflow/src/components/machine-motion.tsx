import React from "react";

/* MACHINE MOTION — compact living illustration INSIDE each machine card.
   Type-specific: press cylinders / die-cutter chop / gluer fold / cutter blade / coater roller.
   Speed maps to that machine's SPH. Status drives play state.
   Pure CSS transforms — 60fps, reduced-motion safe. */

type Props = {
  machineType?: string | null;
  machineName?: string | null;
  status?: string | null;
  isPaused?: boolean;
  sph?: number | null;
};

function kind(t?: string | null, n?: string | null): "press" | "diecut" | "gluer" | "cutter" | "coater" | "gear" {
  const s = `${t ?? ""} ${n ?? ""}`.toLowerCase();
  if (/die/.test(s)) return "diecut";
  if (/glu|fold/.test(s)) return "gluer";
  if (/coat/.test(s)) return "coater";
  if (/cut|guillo|wohlenberg/.test(s)) return "cutter";
  if (/print|press|komori|planeta|offset/.test(s)) return "press";
  return "gear";
}

export function MachineMotion({ machineType, machineName, status, isPaused, sph }: Props) {
  const k = kind(machineType, machineName);
  const running = status === "running" && !isPaused;
  const maint = status === "maintenance";
  const cyc = Math.max(0.7, Math.min(3, 11000 / Math.max(1, sph ?? 8000)));

  const stateClass = maint ? "mm-maint" : isPaused ? "mm-paused" : running ? "mm-run" : "mm-idle";

  return (
    <div className={`mm ${stateClass} mb-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden`}>
      <style>{MM_CSS}</style>
      <svg viewBox="0 0 300 56" className="w-full h-14" style={{ ["--c" as string]: `${cyc}s` }} aria-hidden="true">
        {k === "press" && <Press />}
        {k === "diecut" && <DieCut />}
        {k === "gluer" && <Gluer />}
        {k === "cutter" && <Cutter />}
        {k === "coater" && <Coater />}
        {k === "gear" && <Gear />}
      </svg>
    </div>
  );
}

/* ── PRESS: 2 cylinder pairs + sheet dashes + CMYK ticks ── */
function Press() {
  return (
    <g>
      <path d="M14 34 L286 34" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="10 14" className="mm-sheet" fill="none" />
      {[70, 150, 230].map((x, i) => (
        <g key={i}>
          <g className="mm-spin" style={{ transformOrigin: `${x}px 22px` }}>
            <circle cx={x} cy={22} r={11} fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="2" />
            <line x1={x} y1={13} x2={x} y2={22} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </g>
          <g className="mm-spin-r" style={{ transformOrigin: `${x}px 44px` }}>
            <circle cx={x} cy={44} r={8} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" />
            <line x1={x} y1={44} x2={x + 6} y2={44} stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>
      ))}
      {["#22d3ee", "#e879f9", "#facc15", "#64748b"].map((c, i) => (
        <circle key={c} cx={30 + i * 10} cy={10} r={3.4} fill={c} className="mm-ink" style={{ animationDelay: `${i * 0.25}s` }} />
      ))}
    </g>
  );
}

/* ── DIE CUTTER: platen chops down on sheet ── */
function DieCut() {
  return (
    <g>
      <rect x="40" y="44" width="220" height="5" rx="2.5" fill="currentColor" opacity="0.35" />
      <path d="M20 46 L280 46" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="8 16" className="mm-sheet" fill="none" />
      <g className="mm-chop">
        <rect x="90" y="6" width="120" height="18" rx="4" fill="currentColor" opacity="0.75" />
        {[105, 130, 155, 180, 195].map((x) => (
          <line key={x} x1={x} y1={24} x2={x} y2={30} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        ))}
      </g>
      <g className="mm-spark">
        <circle cx="120" cy="40" r="1.8" fill="currentColor" />
        <circle cx="150" cy="38" r="1.8" fill="currentColor" />
        <circle cx="180" cy="40" r="1.8" fill="currentColor" />
      </g>
    </g>
  );
}

/* ── FOLDER-GLUER: strip travels, chevron fold wave ── */
function Gluer() {
  return (
    <g>
      <path d="M16 28 L284 28" stroke="currentColor" strokeOpacity="0.35" strokeWidth="8" strokeLinecap="round" />
      <path d="M16 28 L284 28" stroke="currentColor" strokeOpacity="0.8" strokeWidth="2" strokeDasharray="14 18" className="mm-sheet" fill="none" />
      {[60, 120, 180, 240].map((x, i) => (
        <path key={x} d={`M${x - 8} 40 L${x} 30 L${x + 8} 40`} stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" className="mm-fold" style={{ animationDelay: `${i * 0.22}s` }} />
      ))}
      <circle cx="284" cy="28" r="4" fill="currentColor" className="mm-ink" />
    </g>
  );
}

/* ── CUTTER: guillotine blade slides down across pile ── */
function Cutter() {
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={70} y={40 - i * 5} width={160} height={4} rx={2} fill="currentColor" opacity={0.5 - i * 0.09} />
      ))}
      <g className="mm-blade">
        <rect x="66" y="4" width="168" height="7" rx="2" fill="currentColor" opacity="0.8" />
        <path d="M66 11 L234 11 L230 16 L70 16 Z" fill="currentColor" opacity="0.5" />
      </g>
    </g>
  );
}

/* ── COATER: roller + shimmer film line ── */
function Coater() {
  return (
    <g>
      <path d="M16 38 L284 38" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="12 16" className="mm-sheet" fill="none" />
      <g className="mm-spin" style={{ transformOrigin: "150px 22px" }}>
        <circle cx="150" cy="22" r="13" fill="none" stroke="currentColor" strokeOpacity="0.65" strokeWidth="2.5" />
        <line x1="150" y1="11" x2="150" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <path d="M60 33 Q150 30 240 33" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" fill="none" className="mm-ink" />
    </g>
  );
}

/* ── GENERIC: gear ── */
function Gear() {
  return (
    <g className="mm-spin" style={{ transformOrigin: "150px 28px" }}>
      <circle cx="150" cy="28" r="13" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="2.5" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line
          key={a}
          x1={150 + 13 * Math.cos((a * Math.PI) / 180)}
          y1={28 + 13 * Math.sin((a * Math.PI) / 180)}
          x2={150 + 18 * Math.cos((a * Math.PI) / 180)}
          y2={28 + 18 * Math.sin((a * Math.PI) / 180)}
          stroke="currentColor"
          strokeOpacity="0.6"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

const MM_CSS = `
.mm{color:hsl(var(--muted-foreground, 215 16% 47%))}
.mm-run{color:#10b981}
.mm-run .mm-spin{animation:mmSpin var(--c) linear infinite}
.mm-run .mm-spin-r{animation:mmSpinR calc(var(--c)*0.7) linear infinite}
.mm-run .mm-sheet{animation:mmTravel calc(var(--c)*0.8) linear infinite}
.mm-run .mm-ink{animation:mmInk calc(var(--c)*2) ease-in-out infinite}
.mm-run .mm-chop{animation:mmChop calc(var(--c)*1.2) ease-in-out infinite}
.mm-run .mm-spark{animation:mmSpark calc(var(--c)*1.2) ease-in-out infinite;opacity:0}
.mm-run .mm-blade{animation:mmBlade calc(var(--c)*1.6) ease-in-out infinite}
.mm-run .mm-fold{animation:mmFold calc(var(--c)*1.4) ease-in-out infinite}

.mm-paused{color:#f59e0b}
.mm-paused .mm-spin,.mm-paused .mm-spin-r,.mm-paused .mm-sheet,.mm-paused .mm-chop,.mm-paused .mm-blade{animation:none}
.mm-paused .mm-ink{animation:mmInk 2.4s ease-in-out infinite}

.mm-maint{color:#f43f5e}
.mm-maint svg *{animation:none}
.mm-maint{animation:mmBeat 1.3s ease-in-out infinite}

.mm-idle{opacity:.55}
.mm-idle .mm-spin{animation:mmSpin 16s linear infinite}
.mm-idle .mm-sheet,.mm-idle .mm-ink,.mm-idle .mm-spark{opacity:.25}

@keyframes mmSpin{to{transform:rotate(360deg)}}
@keyframes mmSpinR{to{transform:rotate(-360deg)}}
@keyframes mmTravel{to{stroke-dashoffset:-32}}
@keyframes mmInk{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes mmChop{0%,100%{transform:translateY(0)}45%{transform:translateY(14px)}60%{transform:translateY(14px)}}
@keyframes mmSpark{0%,40%,100%{opacity:0}50%,58%{opacity:.9}}
@keyframes mmBlade{0%,100%{transform:translateY(0)}42%{transform:translateY(22px)}58%{transform:translateY(22px)}}
@keyframes mmFold{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(-4px) scaleY(0.55)}}
@keyframes mmBeat{0%,100%{opacity:1}50%{opacity:.55}}

@media (prefers-reduced-motion: reduce){.mm *{animation:none !important}}
`;
