import React from "react";

/* MACHINE MOTION — the living machine on each floor card.
   Rich/dimensional direction: metallic towers, glowing ink ducts, real silhouettes.

   Everything here is driven by the machine record, never decoration:
     • tower count      = machine.colorUnits
     • coater tower     = capabilities include uv-/varnish-single-pass
     • extended delivery appears only on presses that carry a coater
     • animation speed  = that machine's own SPH
     • play state       = running / paused / maintenance / idle

   Hard-won details — do not "simplify" these away:
     - Sheet spacing MUST equal the travel distance or the loop visibly jumps.
     - Blanket cylinder turns anti-clockwise, impression clockwise: the sheet
       runs the nip between them and both surfaces must move WITH the paper.
     - Rotation pivots are explicit in view-box units; transform-box:fill-box
       pivots on the element's own bbox and makes the spoke wobble.
     - The die cutter's platen must contact the sheet at top of stroke, and the
       sheet must be stationary at that instant. */

type Props = {
  machineType?: string | null;
  machineName?: string | null;
  status?: string | null;
  isPaused?: boolean;
  sph?: number | null;
  colorUnits?: number | null;
  capabilities?: string[] | null;
};

type Kind = "press" | "diecut" | "gluer" | "cutter" | "gear";

function kindOf(t?: string | null, n?: string | null): Kind {
  const s = `${t ?? ""} ${n ?? ""}`.toLowerCase();
  if (/die/.test(s)) return "diecut";
  if (/glu|fold/.test(s)) return "gluer";
  if (/cut|guillo|wohlenberg/.test(s)) return "cutter";
  if (/print|press|komori|planeta|offset/.test(s)) return "press";
  return "gear";
}

const INK = ["#22D3EE", "#E879F9", "#FDE047", "#CBD5E1", "#A78BFA", "#FB923C"];

export function MachineMotion({
  machineType, machineName, status, isPaused, sph, colorUnits, capabilities,
}: Props) {
  const k = kindOf(machineType, machineName);
  const maint = status === "maintenance";
  const running = status === "running" && !isPaused;
  const cyc = Math.max(0.75, Math.min(3.2, 11000 / Math.max(1, sph ?? 8000)));
  const stateClass = maint ? "mm-maint" : isPaused ? "mm-paused" : running ? "mm-run" : "mm-idle";

  const caps = capabilities ?? [];
  const hasCoater = caps.some((c) => c === "uv-single-pass" || c === "varnish-single-pass");
  const units = Math.max(1, Math.min(8, colorUnits ?? 4));

  return (
    <div className={`mm ${stateClass} mb-2 rounded-lg overflow-hidden border border-[#24344F]`}
         style={{ background: "linear-gradient(158deg,#0B1220,#152441 58%,#0C1526)" }}>
      <style>{MM_CSS}</style>
      {k === "press"  && <Press units={units} hasCoater={hasCoater} cyc={cyc} />}
      {k === "diecut" && <DieCutter cyc={cyc} />}
      {k === "gluer"  && <Gluer cyc={cyc} />}
      {k === "cutter" && <Cutter cyc={cyc} />}
      {k === "gear"   && <Gear cyc={cyc} />}
    </div>
  );
}

/* ─────────────────────────── PRESS ─────────────────────────── */
function Press({ units, hasCoater, cyc }: { units: number; hasCoater: boolean; cyc: number }) {
  const GAP = 34, TW = 28, X0 = 46;
  const towers: number[] = [];
  for (let i = 0; i < units; i++) towers.push(X0 + i * GAP);
  const lastEnd = X0 + (units - 1) * GAP + TW;
  const coaterX = lastEnd + 8;
  const extX = coaterX + 26;
  const delX = hasCoater ? extX + 46 : lastEnd + 10;
  const W = delX + 44;

  const sheets: number[] = [];
  for (let i = -1; i < units + 3; i++) sheets.push(X0 + 2 + i * GAP);

  return (
    <svg viewBox={`0 0 ${W} 120`} className="w-full h-14" style={{ ["--c" as string]: `${cyc}s` }} aria-hidden="true">
      <defs>
        <linearGradient id="mmTower" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3A5478" /><stop offset=".42" stopColor="#22344F" /><stop offset="1" stopColor="#16233A" />
        </linearGradient>
        <linearGradient id="mmHull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#263A57" /><stop offset="1" stopColor="#101B2E" />
        </linearGradient>
        <linearGradient id="mmCyl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6B8FC4" /><stop offset=".5" stopColor="#2C4570" /><stop offset="1" stopColor="#15223A" />
        </linearGradient>
        <linearGradient id="mmCoat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34D399" /><stop offset=".5" stopColor="#0F7A52" /><stop offset="1" stopColor="#0A3D2C" />
        </linearGradient>
        <filter id="mmGlow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="mmRun"><rect x={X0 - 2} y="74" width={delX - X0 + 2} height="12" /></clipPath>
      </defs>

      <rect x="8" y="102" width={W - 16} height="7" fill="#16233A" stroke="#243954" />
      <path d="M10 102 V44 L17 37 H36 L43 44 V102 Z" fill="url(#mmHull)" stroke="#31486B" />
      <rect x="14" y="86" width="26" height="13" rx="1.5" fill="#EDF3FA" opacity=".85" />
      <path d={`M45 102 V72 H${delX - 4} V102 Z`} fill="url(#mmHull)" stroke="#31486B" />

      <g clipPath="url(#mmRun)">
        <g className="mm-feed" style={{ ["--tx" as string]: `${GAP}px` }}>
          {sheets.map((x, i) => (
            <rect key={i} x={x} y="76" width={GAP - 6} height="8" rx="1" fill="#F1F5FB" opacity=".95" />
          ))}
        </g>
      </g>

      {towers.map((x, i) => {
        const cx = x + TW / 2;
        return (
          <g key={x}>
            <path d={`M${x} 102 V46 L${x + 5} 40 H${x + TW - 5} L${x + TW} 46 V102 Z`} fill="url(#mmTower)" stroke="#3E6293" />
            <rect x={x + 6} y="32" width={TW - 12} height="7" rx="1.5" fill="#0C1626" stroke="#3A5478" />
            <circle cx={cx} cy="70" r="10" fill="url(#mmCyl)" stroke="#4A7AB5" strokeWidth=".9" />
            <g className="mm-spinA" style={{ transformOrigin: `${cx}px 70px` }}>
              <line x1={cx} y1="62" x2={cx} y2="70" stroke="#8FC4FF" strokeWidth="1.7" strokeLinecap="round" />
            </g>
            <circle cx={cx} cy="70" r="1.7" fill="#8FC4FF" />
            <circle cx={cx} cy="92" r="7.5" fill="url(#mmCyl)" stroke="#3E6293" strokeWidth=".8" opacity=".92" />
            <g className="mm-spinB" style={{ transformOrigin: `${cx}px 92px` }}>
              <line x1={cx} y1="98" x2={cx} y2="92" stroke="#6FA3DB" strokeWidth="1.5" strokeLinecap="round" />
            </g>
            <circle cx={cx} cy="52" r="3.4" fill={INK[i % INK.length]} filter="url(#mmGlow)" className="mm-ink" />
          </g>
        );
      })}

      {hasCoater && (
        <g>
          <path d={`M${coaterX} 102 V50 L${coaterX + 4} 44 H${coaterX + 18} L${coaterX + 22} 50 V102 Z`} fill="url(#mmTower)" stroke="#3E6293" />
          <circle cx={coaterX + 11} cy="70" r="8" fill="url(#mmCoat)" stroke="#34D399" strokeWidth=".9" />
          <g className="mm-spinA" style={{ transformOrigin: `${coaterX + 11}px 70px` }}>
            <line x1={coaterX + 11} y1="64" x2={coaterX + 11} y2="70" stroke="#A7F3D0" strokeWidth="1.5" strokeLinecap="round" />
          </g>
          <circle cx={coaterX + 11} cy="92" r="6" fill="url(#mmCyl)" stroke="#3E6293" strokeWidth=".8" opacity=".9" />
          <g className="mm-spinB" style={{ transformOrigin: `${coaterX + 11}px 92px` }}>
            <line x1={coaterX + 11} y1="97" x2={coaterX + 11} y2="92" stroke="#6FA3DB" strokeWidth="1.3" strokeLinecap="round" />
          </g>
          <circle cx={coaterX + 11} cy="56" r="3.4" fill="#00E676" filter="url(#mmGlow)" className="mm-ink" />
        </g>
      )}

      {hasCoater && (
        <g>
          <path d={`M${extX} 102 V72 H${extX + 40} V102 Z`} fill="url(#mmHull)" stroke="#31486B" />
          <rect x={extX + 4} y="64" width="32" height="7" rx="1.5" fill="#0C1626" stroke="#3A5478" />
          <circle cx={extX + 10} cy="67" r="1.9" fill="#FDBA74" className="mm-ink" />
          <circle cx={extX + 20} cy="67" r="1.9" fill="#FDBA74" className="mm-ink" />
          <circle cx={extX + 30} cy="67" r="1.9" fill="#FDBA74" className="mm-ink" />
        </g>
      )}

      <path d={`M${delX} 102 V44 L${delX + 7} 37 H${delX + 30} L${delX + 37} 44 V102 Z`} fill="url(#mmHull)" stroke="#31486B" />
      <rect x={delX + 5} y="86" width="27" height="13" rx="1.5" fill="#EDF3FA" opacity=".88" />
    </svg>
  );
}

/* ───────────────────────── DIE CUTTER ───────────────────────── */
function DieCutter({ cyc }: { cyc: number }) {
  const sheets = [36, 96, 156, 216];
  return (
    <svg viewBox="0 0 300 120" className="w-full h-14" style={{ ["--c" as string]: `${cyc}s` }} aria-hidden="true">
      <defs>
        <linearGradient id="dcHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A4162" /><stop offset="1" stopColor="#0F1A2C" /></linearGradient>
        <linearGradient id="dcPlaten" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5B8FD0" /><stop offset="1" stopColor="#22385C" /></linearGradient>
        <clipPath id="dcRun"><rect x="44" y="56" width="196" height="12" /></clipPath>
      </defs>
      <rect x="8" y="102" width="284" height="7" fill="#16233A" stroke="#243954" />
      <path d="M10 102 V40 L17 33 H40 L47 40 V70 H244 V40 L251 33 H274 L281 40 V102 Z" fill="url(#dcHull)" stroke="#3E6293" strokeLinejoin="round" />
      <rect x="14" y="82" width="30" height="16" rx="1.5" fill="#EDF3FA" opacity=".88" />
      <rect x="250" y="82" width="28" height="16" rx="1.5" fill="#EDF3FA" opacity=".88" />

      <rect x="96" y="44" width="60" height="9" rx="1.5" fill="#122238" stroke="#5B8FD0" />
      <line x1="104" y1="46" x2="104" y2="51" stroke="#8FC4FF" strokeWidth="1" />
      <line x1="114" y1="46" x2="114" y2="51" stroke="#8FC4FF" strokeWidth="1" />
      <line x1="124" y1="46" x2="124" y2="51" stroke="#8FC4FF" strokeWidth="1" />
      <line x1="134" y1="46" x2="134" y2="51" stroke="#8FC4FF" strokeWidth="1" />
      <line x1="144" y1="46" x2="144" y2="51" stroke="#8FC4FF" strokeWidth="1" />

      <g clipPath="url(#dcRun)">
        <g className="mm-index" style={{ ["--tx" as string]: "60px" }}>
          {sheets.map((x, i) => (
            <rect key={i} x={x} y="57" width="56" height="7" rx="1" fill="#EDF3FA" opacity=".95" />
          ))}
        </g>
      </g>

      <g className="mm-chop">
        <rect x="96" y="75" width="60" height="9" rx="1.5" fill="url(#dcPlaten)" stroke="#8FC4FF" strokeWidth=".9" />
        <path d="M122 84 H130 V92 H122 Z" fill="#2A4162" stroke="#6B93C9" strokeWidth=".8" />
        <rect x="114" y="92" width="24" height="7" rx="3" fill="#0A1322" stroke="#6B93C9" strokeWidth=".9" />
      </g>
      <circle cx="126" cy="95" r="6" fill="none" stroke="#4A7AB5" strokeWidth="1" opacity=".5" strokeDasharray="2 2" />
      <g className="mm-crank" style={{ transformOrigin: "126px 95px" }}>
        <line x1="126" y1="95" x2="126" y2="101" stroke="#8FC4FF" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="126" cy="101" r="2.4" fill="#8FC4FF" />
      </g>
      <circle cx="126" cy="95" r="2" fill="#22385C" stroke="#5B8FD0" strokeWidth=".8" />

      <rect x="182" y="76" width="5" height="4" rx="1" fill="#7D93B0" className="mm-fall" />
      <rect x="198" y="78" width="5" height="4" rx="1" fill="#7D93B0" className="mm-fall" />
      <rect x="214" y="76" width="5" height="4" rx="1" fill="#7D93B0" className="mm-fall" />
    </svg>
  );
}

/* ─────────────────────────── GLUER ─────────────────────────── */
function Gluer({ cyc }: { cyc: number }) {
  const GAP = 56;
  const idx = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 300 120" className="w-full h-14" style={{ ["--c" as string]: `${cyc}s` }} aria-hidden="true">
      <defs>
        <linearGradient id="fgHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A4162" /><stop offset="1" stopColor="#0F1A2C" /></linearGradient>
        <filter id="fgGlow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="1.8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="fgRun"><rect x="44" y="52" width="196" height="44" /></clipPath>
      </defs>
      <rect x="8" y="102" width="284" height="7" fill="#16233A" stroke="#243954" />
      <path d="M10 102 V40 L17 33 H38 L45 40 V64 H246 V42 L253 35 H274 L281 42 V102 Z" fill="url(#fgHull)" stroke="#3E6293" strokeLinejoin="round" />
      <rect x="14" y="80" width="28" height="18" rx="1.5" fill="#EDF3FA" opacity=".88" />
      <rect x="252" y="80" width="26" height="18" rx="1.5" fill="#EDF3FA" opacity=".88" />
      <line x1="46" y1="66" x2="244" y2="66" stroke="#4A7AB5" strokeWidth="1.6" strokeDasharray="7 9" className="mm-belt" opacity=".65" />
      <line x1="46" y1="96" x2="244" y2="96" stroke="#4A7AB5" strokeWidth="1.6" strokeDasharray="7 9" className="mm-belt" opacity=".45" />

      <g clipPath="url(#fgRun)">
        {idx.map((i) => {
          const x = 50 + i * GAP;
          const mid = x + 18;
          const d = `calc(var(--c) * ${-i * 0.25})`;
          return (
            <g key={i} className="mm-journey" style={{ ["--tx" as string]: `${GAP}px`, animationDelay: d }}>
              <g className="mm-cbody" style={{ transformOrigin: `${mid}px 88px`, animationDelay: d }}>
                <rect x={x} y="72" width="36" height="16" rx="1" fill="#F1F5FB" opacity=".95" />
              </g>
              <g className="mm-flapL" style={{ transformOrigin: `${x}px 88px`, animationDelay: d }}>
                <rect x={x - 9} y="82" width="9" height="6" rx="1" fill="#F1F5FB" opacity=".95" />
              </g>
              <g className="mm-flapR" style={{ transformOrigin: `${x + 36}px 88px`, animationDelay: d }}>
                <rect x={x + 36} y="82" width="9" height="6" rx="1" fill="#F1F5FB" opacity=".95" />
              </g>
              <circle className="mm-gdot" style={{ animationDelay: d }} cx={x + 3} cy="84" r="2.2" fill="#00E676" filter="url(#fgGlow)" />
            </g>
          );
        })}
      </g>

      <circle cx="72" cy="62" r="4" fill="none" stroke="#5B8FD0" strokeWidth="1" />
      <circle cx="92" cy="62" r="4" fill="none" stroke="#5B8FD0" strokeWidth="1" />
      <path d="M128 64 V44 L132 40 H150 L154 44 V64 Z" fill="url(#fgHull)" stroke="#34D399" />
      <line x1="136" y1="54" x2="136" y2="72" stroke="#34D399" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="136" cy="74" r="2.4" fill="#00E676" filter="url(#fgGlow)" />
      <line x1="192" y1="70" x2="240" y2="70" stroke="#8FC4FF" strokeWidth="1.6" opacity=".8" />
      <line x1="192" y1="92" x2="240" y2="92" stroke="#8FC4FF" strokeWidth="1.6" opacity=".8" />
    </svg>
  );
}

/* ─────────────────────────── CUTTER ─────────────────────────── */
function Cutter({ cyc }: { cyc: number }) {
  return (
    <svg viewBox="0 0 300 120" className="w-full h-14" style={{ ["--c" as string]: `${cyc}s` }} aria-hidden="true">
      <defs>
        <linearGradient id="cuHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A4162" /><stop offset="1" stopColor="#0F1A2C" /></linearGradient>
        <linearGradient id="cuBlade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#93C5FD" /><stop offset="1" stopColor="#22385C" /></linearGradient>
      </defs>
      <rect x="8" y="102" width="284" height="7" fill="#16233A" stroke="#243954" />
      <path d="M40 102 V36 L50 28 H250 L260 36 V102 Z" fill="url(#cuHull)" stroke="#3E6293" strokeLinejoin="round" />
      <rect x="60" y="76" width="180" height="16" rx="1.5" fill="#EDF3FA" opacity=".9" />
      <g className="mm-chop">
        <rect x="70" y="50" width="160" height="8" rx="1" fill="url(#cuBlade)" stroke="#BFDBFF" strokeWidth=".9" />
        <path d="M70 58 H230 L226 63 H74 Z" fill="#22385C" stroke="#8FC4FF" strokeWidth=".7" />
      </g>
      <rect x="66" y="40" width="168" height="6" rx="1.5" fill="#0C1626" stroke="#3A5478" />
    </svg>
  );
}

/* ─────────────────────────── GENERIC ─────────────────────────── */
function Gear({ cyc }: { cyc: number }) {
  return (
    <svg viewBox="0 0 300 120" className="w-full h-14" style={{ ["--c" as string]: `${cyc}s` }} aria-hidden="true">
      <defs>
        <linearGradient id="gwCyl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6B8FC4" /><stop offset="1" stopColor="#15223A" /></linearGradient>
      </defs>
      <rect x="8" y="102" width="284" height="7" fill="#16233A" stroke="#243954" />
      <circle cx="150" cy="66" r="26" fill="url(#gwCyl)" stroke="#4A7AB5" strokeWidth="1.2" />
      <g className="mm-spinA" style={{ transformOrigin: "150px 66px" }}>
        <line x1="150" y1="44" x2="150" y2="66" stroke="#8FC4FF" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="150" y1="66" x2="172" y2="66" stroke="#8FC4FF" strokeWidth="2.2" strokeLinecap="round" opacity=".5" />
      </g>
      <circle cx="150" cy="66" r="3" fill="#8FC4FF" />
    </svg>
  );
}

const MM_CSS = `
.mm svg{display:block}
@keyframes mmSpinA{to{transform:rotate(-360deg)}}
@keyframes mmSpinB{to{transform:rotate(360deg)}}
@keyframes mmFeed{from{transform:translateX(0)}to{transform:translateX(var(--tx))}}
@keyframes mmIndex{0%,75%{transform:translateX(0)}100%{transform:translateX(var(--tx))}}
@keyframes mmChop{0%,100%{transform:translateY(0)}50%{transform:translateY(-11px)}}
@keyframes mmCrank{to{transform:rotate(360deg)}}
@keyframes mmFall{0%,52%{opacity:0}62%{opacity:1}78%,100%{opacity:0}}
@keyframes mmInk{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes mmBelt{from{stroke-dashoffset:0}to{stroke-dashoffset:-16px}}
@keyframes mmJourney{from{transform:translateX(0)}to{transform:translateX(var(--tx))}}
@keyframes mmCBody{0%,16%{transform:scaleY(1)}52%{transform:scaleY(.6)}76%,100%{transform:scaleY(.34)}}
@keyframes mmFlapL{0%,16%{transform:rotate(0)}42%{transform:rotate(-42deg)}74%,100%{transform:rotate(-92deg)}}
@keyframes mmFlapR{0%,16%{transform:rotate(0)}42%{transform:rotate(42deg)}74%,100%{transform:rotate(92deg)}}
@keyframes mmGdot{0%,40%{opacity:0}46%,100%{opacity:1}}

.mm .mm-spinA{animation:mmSpinA var(--c) linear infinite;transform-box:view-box}
.mm .mm-spinB{animation:mmSpinB var(--c) linear infinite;transform-box:view-box}
.mm .mm-feed{animation:mmFeed var(--c) linear infinite}
.mm .mm-index{animation:mmIndex var(--c) cubic-bezier(.65,0,.35,1) infinite}
.mm .mm-chop{animation:mmChop var(--c) ease-in-out infinite}
.mm .mm-crank{animation:mmCrank var(--c) linear infinite;transform-box:view-box}
.mm .mm-fall{animation:mmFall var(--c) ease-in infinite}
.mm .mm-ink{animation:mmInk 2.1s ease-in-out infinite}
.mm .mm-belt{animation:mmBelt calc(var(--c) * .5) linear infinite}
.mm .mm-journey{animation:mmJourney var(--c) linear infinite;transform-box:view-box}
.mm .mm-cbody{animation:mmCBody var(--c) linear infinite;transform-box:view-box}
.mm .mm-flapL{animation:mmFlapL var(--c) linear infinite;transform-box:view-box}
.mm .mm-flapR{animation:mmFlapR var(--c) linear infinite;transform-box:view-box}
.mm .mm-gdot{animation:mmGdot var(--c) linear infinite}

.mm.mm-paused *{animation-play-state:paused!important}
.mm.mm-idle *{animation:none!important}
.mm.mm-idle svg{opacity:.4}
.mm.mm-maint *{animation:none!important}
.mm.mm-maint svg{opacity:.34;filter:grayscale(.7)}

@media (prefers-reduced-motion:reduce){.mm *{animation:none!important}}
`;
