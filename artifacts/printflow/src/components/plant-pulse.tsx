import React, { useMemo } from "react";

/* PLANT PULSE v2 — the living line.
   Not a generic press: THEIR plant. Every machine from the DB rendered as a
   station in production order, each animating by its OWN live status:
   running spins at its real SPH · paused freezes mid-motion (amber)
   maintenance beats red · idle sits as a dim ghost.
   Wall-TV hero: dark by design, glanceable from across the floor.
   Pure CSS transform/opacity — 60fps on a stick PC. Reduced-motion safe. */

type M = {
  id: number;
  machineName?: string | null;
  machineType?: string | null;
  status?: string | null;
  speedPerHour?: number | null;
  currentJobName?: string | null;
};

type Kind = "cutter" | "press" | "coater" | "diecut" | "gluer" | "gear";

function kindOf(m: M): Kind {
  const s = `${m.machineType ?? ""} ${m.machineName ?? ""}`.toLowerCase();
  if (/die/.test(s)) return "diecut";
  if (/glu|fold/.test(s)) return "gluer";
  if (/coat/.test(s)) return "coater";
  if (/cut|guillo|wohlenberg/.test(s)) return "cutter";
  if (/print|press|komori|planeta|offset/.test(s)) return "press";
  return "gear";
}

const ORDER: Record<Kind, number> = { cutter: 0, press: 1, coater: 2, diecut: 3, gluer: 4, gear: 5 };

function stateOf(m: M): "run" | "paused" | "maint" | "idle" {
  if (m.status === "maintenance") return "maint";
  if (m.status === "paused") return "paused";
  if (m.status === "running") return "run";
  return "idle";
}

const STATE_COLOR = { run: "#34d399", paused: "#fbbf24", maint: "#fb7185", idle: "#475569" } as const;

export function PlantPulse({ machines }: { machines: M[] | undefined }) {
  const model = useMemo(() => {
    const ms = [...(machines ?? [])].sort((a, b) => ORDER[kindOf(a)] - ORDER[kindOf(b)] || a.id - b.id);
    const counts = { run: 0, paused: 0, maint: 0, idle: 0 };
    for (const m of ms) counts[stateOf(m)]++;
    const fastest = ms
      .filter((m) => stateOf(m) === "run" && (m.speedPerHour ?? 0) > 0)
      .sort((a, b) => (b.speedPerHour ?? 0) - (a.speedPerHour ?? 0))[0];
    const flowCyc = fastest ? Math.max(0.8, Math.min(3, 13200 / (fastest.speedPerHour ?? 8000))) : 6;
    return { ms, counts, fastest, flowCyc, live: counts.run > 0 };
  }, [machines]);

  const { ms, counts, fastest, flowCyc, live } = model;
  if (ms.length === 0) return null;

  const W = 900;
  const slot = (W - 60) / ms.length;
  const ecg = useMemo(() => {
    const n = counts.run;
    if (n === 0) return `M0 16 L${W} 16`;
    let d = `M0 16`;
    const seg = W / (n + 1);
    for (let i = 1; i <= n; i++) {
      const cx = seg * i;
      d += ` L${cx - 26} 16 L${cx - 14} 12 L${cx - 6} 28 L${cx + 2} 3 L${cx + 10} 22 L${cx + 18} 16`;
    }
    d += ` L${W} 16`;
    return d;
  }, [counts.run]);

  return (
    <div className="pp2 relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0b0f14] p-4 md:p-5">
      <style>{CSS}</style>

      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-500">Plant Pulse</p>
          {live && (
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">
              <i className="pp2-dot" /> Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs font-bold tabular-nums">
          <span className="text-emerald-400">{counts.run} running</span>
          {counts.paused > 0 && <span className="text-amber-400">{counts.paused} paused</span>}
          {counts.maint > 0 && <span className="text-rose-400">{counts.maint} maintenance</span>}
          <span className="text-slate-500">{counts.idle} idle</span>
          {fastest && (
            <span className="hidden md:inline text-slate-400">
              {fastest.machineName} · {(fastest.speedPerHour ?? 0).toLocaleString("en-IN")} sph
            </span>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} 210`} className="w-full h-auto" role="img" aria-label="Live plant line — one station per machine">
        {/* conveyor */}
        <rect x="20" y="164" width={W - 40} height="5" rx="2.5" fill="#1e293b" />
        <path
          d={`M 30 158 L ${W - 30} 158`}
          stroke="#e2e8f0" strokeWidth="2" strokeDasharray="12 22" strokeLinecap="round" fill="none"
          className={live ? "pp2-flow" : ""} opacity={live ? 0.9 : 0.12}
          style={{ ["--fc" as string]: `${flowCyc}s` }}
        />
        {ms.map((m, i) => (
          <Station key={m.id} m={m} x={30 + slot * i + slot / 2} slot={Math.min(slot, 110)} />
        ))}
      </svg>

      <svg viewBox={`0 0 ${W} 32`} className="w-full h-auto mt-1" aria-hidden="true">
        <path
          d={ecg}
          stroke={live ? "#34d399" : "#334155"} strokeWidth="1.5" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
          className={`pp2-ecg ${counts.run >= 3 ? "pp2-ecg-hi" : counts.run >= 1 ? "pp2-ecg-md" : "pp2-ecg-lo"}`}
        />
      </svg>
    </div>
  );
}

function Station({ m, x, slot }: { m: M; x: number; slot: number }) {
  const k = kindOf(m);
  const st = stateOf(m);
  const c = STATE_COLOR[st];
  const cyc = Math.max(0.7, Math.min(3, 11000 / Math.max(1, m.speedPerHour ?? 8000)));
  const name = (m.machineName ?? "").length > 13 ? `${(m.machineName ?? "").slice(0, 12)}…` : m.machineName ?? "";
  const w = Math.min(slot - 14, 78);

  return (
    <g
      className={`pp2-st pp2-${st}`}
      style={{ ["--c" as string]: `${cyc}s`, ["--d" as string]: `-${(cyc * 0.4).toFixed(2)}s` }}
    >
      {/* status underline on conveyor */}
      <rect x={x - w / 2} y={164} width={w} height={5} rx={2.5} fill={c} opacity={st === "idle" ? 0.25 : 0.9} />
      {st === "maint" && <rect x={x - w / 2} y={164} width={w} height={5} rx={2.5} fill={c} className="pp2-beat" />}

      {k === "press" && <Press x={x} c={c} />}
      {k === "cutter" && <Cutter x={x} c={c} />}
      {k === "diecut" && <DieCut x={x} c={c} />}
      {k === "gluer" && <Gluer x={x} c={c} />}
      {k === "coater" && <Coater x={x} c={c} />}
      {k === "gear" && <Gear x={x} c={c} />}

      <text x={x} y={188} textAnchor="middle" fontSize="11" fontWeight="700"
        fill={st === "idle" ? "#475569" : "#cbd5e1"}>{name}</text>
      <text x={x} y={202} textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="0.08em"
        fill={c} opacity={st === "idle" ? 0.5 : 0.9}>
        {st === "run" ? "RUNNING" : st === "paused" ? "PAUSED" : st === "maint" ? "MAINT" : "IDLE"}
      </text>
    </g>
  );
}

/* Cylinders rotate via dashed-ring dashoffset — cleaner than spoke lines */
function Press({ x, c }: { x: number; c: string }) {
  return (
    <g>
      <rect x={x - 34} y={82} width={68} height={76} rx={7} fill="#0f172a" stroke="#1e293b" strokeWidth="1.5" />
      {["#22d3ee", "#e879f9", "#facc15", "#94a3b8"].map((ink, i) => (
        <rect key={i} x={x - 26 + i * 14} y={88} width={10} height={4} rx={2} fill={ink} opacity={0.85} />
      ))}
      <circle cx={x} cy={112} r={13} fill="#0b0f14" stroke="#475569" strokeWidth="1.5" />
      <circle cx={x} cy={112} r={13} fill="none" stroke={c} strokeWidth="2" strokeDasharray="7 14"
        className="pp2-spin" style={{ transformOrigin: `${x}px 112px` }} />
      <circle cx={x} cy={140} r={10} fill="#0b0f14" stroke="#475569" strokeWidth="1.5" />
      <circle cx={x} cy={140} r={10} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="5 11"
        className="pp2-spin-r" style={{ transformOrigin: `${x}px 140px` }} />
      <line x1={x - 30} y1={127} x2={x + 30} y2={127} stroke="#e2e8f0" strokeWidth="1.5" opacity="0.5" />
    </g>
  );
}

function Cutter({ x, c }: { x: number; c: string }) {
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={x - 26} y={150 - i * 5} width={52} height={3.5} rx={1.5} fill="#cbd5e1" opacity={0.85 - i * 0.18} />
      ))}
      <rect x={x - 30} y={96} width={60} height={8} rx={3} fill="#334155" />
      <g className="pp2-chop">
        <rect x={x - 26} y={106} width={52} height={5} rx={2} fill={c} />
        <polygon points={`${x - 26},111 ${x + 26},111 ${x},117`} fill={c} opacity="0.7" />
      </g>
    </g>
  );
}

function DieCut({ x, c }: { x: number; c: string }) {
  return (
    <g>
      <rect x={x - 30} y={144} width={60} height={12} rx={3} fill="#334155" />
      <g className="pp2-chop">
        <rect x={x - 26} y={104} width={52} height={22} rx={4} fill="#0f172a" stroke="#475569" strokeWidth="1.5" />
        <line x1={x - 18} y1={126} x2={x - 18} y2={132} stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1={x} y1={126} x2={x} y2={132} stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1={x + 18} y1={126} x2={x + 18} y2={132} stroke={c} strokeWidth="2" strokeLinecap="round" />
      </g>
    </g>
  );
}

function Gluer({ x, c }: { x: number; c: string }) {
  return (
    <g>
      <rect x={x - 32} y={128} width={64} height={28} rx={6} fill="#0f172a" stroke="#1e293b" strokeWidth="1.5" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M ${x - 16 + i * 14} 136 l 8 6 l -8 6`} stroke={c} strokeWidth="2.5" fill="none"
          strokeLinecap="round" strokeLinejoin="round" className="pp2-chev" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </g>
  );
}

function Coater({ x, c }: { x: number; c: string }) {
  return (
    <g>
      <line x1={x - 30} y1={150} x2={x + 30} y2={150} stroke="#e2e8f0" strokeWidth="1.5" opacity="0.5" />
      <circle cx={x} cy={132} r={14} fill="#0b0f14" stroke="#475569" strokeWidth="1.5" />
      <circle cx={x} cy={132} r={14} fill="none" stroke={c} strokeWidth="2" strokeDasharray="8 14"
        className="pp2-spin" style={{ transformOrigin: `${x}px 132px` }} />
    </g>
  );
}

function Gear({ x, c }: { x: number; c: string }) {
  return (
    <circle cx={x} cy={136} r={14} fill="none" stroke={c} strokeWidth="2.5" strokeDasharray="5 8"
      className="pp2-spin" style={{ transformOrigin: `${x}px 136px` }} />
  );
}

const CSS = `
.pp2-dot{display:inline-block;width:7px;height:7px;border-radius:9999px;background:#34d399;animation:pp2Blink 1.4s ease-in-out infinite}
@keyframes pp2Blink{0%,100%{opacity:1}50%{opacity:.3}}

.pp2-run .pp2-spin{animation:pp2Spin var(--c) linear infinite}
.pp2-run .pp2-spin-r{animation:pp2SpinR calc(var(--c)*.72) linear infinite}
.pp2-run .pp2-chop{animation:pp2Chop calc(var(--c)*1.4) ease-in-out infinite;}
.pp2-run .pp2-chev{animation:pp2Chev calc(var(--c)*.9) ease-in-out infinite}

.pp2-paused .pp2-spin,.pp2-paused .pp2-spin-r,.pp2-paused .pp2-chop,.pp2-paused .pp2-chev{
  animation-play-state:paused !important;
  animation-name:pp2Spin;animation-duration:var(--c);animation-delay:var(--d);animation-iteration-count:infinite;animation-timing-function:linear}
.pp2-paused .pp2-spin-r{animation-name:pp2SpinR}
.pp2-paused .pp2-chop{animation-name:pp2Chop;animation-timing-function:ease-in-out}
.pp2-paused .pp2-chev{animation-name:pp2Chev;animation-timing-function:ease-in-out}

.pp2-idle{opacity:.3}
.pp2-idle .pp2-spin,.pp2-idle .pp2-spin-r,.pp2-idle .pp2-chop,.pp2-idle .pp2-chev{animation:none}

.pp2-maint .pp2-spin,.pp2-maint .pp2-spin-r,.pp2-maint .pp2-chop,.pp2-maint .pp2-chev{animation:none}
.pp2-beat{animation:pp2Beat 1.3s ease-in-out infinite}
@keyframes pp2Beat{0%,100%{opacity:.25}18%{opacity:1}36%{opacity:.35}50%{opacity:.95}70%,100%{opacity:.25}}

.pp2-flow{animation:pp2Flow var(--fc) linear infinite}
@keyframes pp2Flow{to{stroke-dashoffset:-34}}
@keyframes pp2Spin{to{transform:rotate(360deg)}}
@keyframes pp2SpinR{to{transform:rotate(-360deg)}}
@keyframes pp2Chop{0%,55%,100%{transform:translateY(0)}70%{transform:translateY(26px)}82%{transform:translateY(26px)}}
@keyframes pp2Chev{0%{transform:translateX(0);opacity:.25}50%{transform:translateX(7px);opacity:1}100%{transform:translateX(14px);opacity:0}}

.pp2-ecg{stroke-dasharray:1400;stroke-dashoffset:1400}
.pp2-ecg-hi{animation:pp2Ecg 2.4s linear infinite}
.pp2-ecg-md{animation:pp2Ecg 4s linear infinite}
.pp2-ecg-lo{animation:pp2Ecg 9s linear infinite;opacity:.45}
@keyframes pp2Ecg{to{stroke-dashoffset:0}}

@media (prefers-reduced-motion: reduce){.pp2 *{animation:none !important}}
`;
