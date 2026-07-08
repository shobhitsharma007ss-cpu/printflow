import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play, Pause, CheckCircle2, Lock, ArrowLeft, Clock, Factory,
  Wrench, Droplets, Palette, FileWarning, Zap, Coffee, User, QrCode,
} from "lucide-react";
import { useMachines } from "@/hooks/use-machines";
import { useJobs, useUpdateJobRoutingStatus } from "@/hooks/use-jobs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { JobWithDetails, JobRouting } from "@workspace/api-client-react";

/* ────────────────────────────────────────────────────────────────────────────
   OPERATOR MODE — tablet-first, Hindi-first, 3-tap floor surface.
   /floor/stations            → giant machine tiles (tablet setup / picker)
   /floor/station/:machineId  → the station screen (SHURU / ROK / KHATAM)
   Fullscreen (no sidebar) — App.tsx branches these routes outside AppLayout.
   Reuses existing APIs only: PATCH /job-routing/:id/status|pause|resume.
──────────────────────────────────────────────────────────────────────────── */

const HI = {
  pickStation: "अपनी मशीन चुनें",
  pickSub: "टैबलेट पर इस मशीन का पेज बुकमार्क कर लें",
  who: "कौन चला रहा है?",
  pickNameFirst: "पहले अपना नाम चुनें",
  idle: "कोई काम नहीं",
  idleSub: "अगला जॉब आने पर यहाँ दिखेगा",
  locked: "अभी शुरू नहीं कर सकते",
  waitingFor: "पहले पूरा होना है:",
  start: "शुरू",
  startSub: "START",
  pause: "रोकें",
  pauseSub: "PAUSE",
  done: "ख़तम",
  doneSub: "DONE",
  resume: "फिर शुरू",
  resumeSub: "RESUME",
  pausedBanner: "रुका हुआ",
  whyPause: "क्यों रोक रहे हैं?",
  howMany: "कितनी शीट हुईं?",
  confirm: "पक्का करें",
  cancel: "वापस",
  qty: "मात्रा",
  client: "पार्टी",
  material: "कागज़",
  queue: "अगले जॉब",
  allMachines: "सभी मशीनें",
  running: "चालू",
  sheets: "शीट",
};

const PAUSE_REASONS_HI = [
  { value: "plate-change", hi: "प्लेट बदलना", en: "Plate change", icon: Wrench },
  { value: "blanket-wash", hi: "ब्लैंकेट धुलाई", en: "Blanket wash", icon: Droplets },
  { value: "ink-change", hi: "इंक समस्या", en: "Ink issue", icon: Palette },
  { value: "paper-jam", hi: "पेपर जाम", en: "Paper jam", icon: FileWarning },
  { value: "breakdown", hi: "बिजली / ब्रेकडाउन", en: "Power / Breakdown", icon: Zap },
  { value: "break", hi: "चाय / ब्रेक", en: "Tea / Break", icon: Coffee },
] as const;

/* ── local mutations (same endpoints floor-monitor uses) ─────────────────── */
function usePauseRouting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, notes }: { id: number; reason: string; notes?: string }) =>
      fetch(`/api/job-routing/${id}/pause`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes }),
      }).then((r) => { if (!r.ok) throw new Error("Pause failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries(); },
  });
}
function useResumeRouting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      fetch(`/api/job-routing/${id}/resume`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => { if (!r.ok) throw new Error("Resume failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries(); },
  });
}

function useLiveElapsed(startedAt: string | null | undefined, pausedSec: number, frozen: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!startedAt || frozen) return;
    const tick = () => {
      const t = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) - (pausedSec ?? 0);
      setS(Math.max(0, t));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt, pausedSec, frozen]);
  return s;
}
const fmtHMS = (s: number) =>
  s < 3600 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* ══════════════════════════ STATION PICKER ══════════════════════════ */
export function StationsPicker() {
  const { data: machines } = useMachines();
  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="flex items-center gap-3 mb-2">
        <Factory className="text-primary" size={36} />
        <h1 className="text-4xl font-black tracking-tight">{HI.pickStation}</h1>
      </div>
      <p className="text-lg text-muted-foreground mb-8">{HI.pickSub}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {(machines ?? []).map((m) => (
          <Link key={m.id} href={`/floor/station/${m.id}`}>
            <a className="block rounded-2xl border-2 border-border bg-card p-6 hover:border-primary hover:shadow-lg transition-all min-h-[120px]">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-black leading-tight">{m.machineName}</p>
                  <p className="text-sm text-muted-foreground mt-1">{m.machineCode} · {m.machineType}</p>
                </div>
                <span className={cn(
                  "w-4 h-4 rounded-full mt-1 shrink-0",
                  m.status === "running" ? "bg-emerald-500 animate-pulse"
                    : m.status === "maintenance" ? "bg-rose-500" : "bg-slate-300",
                )} />
              </div>
            </a>
          </Link>
        ))}
      </div>
      <div className="mt-10">
        <Link href="/floor-monitor">
          <a className="text-sm text-muted-foreground underline">← Supervisor Floor Monitor</a>
        </Link>
      </div>
    </div>
  );
}

/* ══════════════════════════ STATION SCREEN ══════════════════════════ */
export default function OperatorStation() {
  const [, params] = useRoute("/floor/station/:machineId");
  const machineId = parseInt(params?.machineId ?? "0", 10);
  const [, navigate] = useLocation();

  const { data: machines } = useMachines();
  const { data: jobs, refetch } = useJobs();
  const updateStatus = useUpdateJobRoutingStatus();
  const pauseM = usePauseRouting();
  const resumeM = useResumeRouting();

  // gentle live refresh for a wall/station tablet
  useEffect(() => {
    const iv = setInterval(() => refetch(), 7000);
    return () => clearInterval(iv);
  }, [refetch]);

  const machine = (machines ?? []).find((m) => m.id === machineId);

  // operator chips: distinct operator names across machines
  const operatorNames = useMemo(() => {
    const s = new Set<string>();
    (machines ?? []).forEach((m) => m.operatorName && s.add(m.operatorName));
    return Array.from(s);
  }, [machines]);
  const opKey = `pf.station.${machineId}.operator`;
  const [operator, setOperator] = useState<string>(() => localStorage.getItem(opKey) ?? "");
  useEffect(() => { if (operator) localStorage.setItem(opKey, operator); }, [operator, opKey]);

  // derive this machine's steps
  const active = useMemo(() => {
    for (const job of jobs ?? []) {
      const step = job.routing?.find((r) => r.machineId === machineId && (r.status === "in-progress" || r.status === "paused"));
      if (step) return { job, step };
    }
    return null;
  }, [jobs, machineId]);

  const nexts = useMemo(() => {
    const list: Array<{ job: JobWithDetails; step: JobRouting }> = [];
    for (const job of jobs ?? []) {
      for (const step of job.routing ?? []) {
        if (step.machineId === machineId && (step.status === "pending" || step.status === "ready")) {
          list.push({ job, step });
        }
      }
    }
    // startable first
    list.sort((a, b) => Number(b.step.canStart === true) - Number(a.step.canStart === true));
    return list;
  }, [jobs, machineId]);

  const current = useMemo(() => {
    if (pinnedJobId != null) {
      const hit = (active && active.job.id === pinnedJobId ? active : null)
        ?? nexts.find((n) => n.job.id === pinnedJobId) ?? null;
      if (hit) return hit;
    }
    return active ?? nexts[0] ?? null;
  }, [active, nexts, pinnedJobId]);
  const queueRest = (active ? nexts : nexts.filter((n) => n !== current)).slice(0, 3);

  const isPaused = active?.step.status === "paused";
  const elapsed = useLiveElapsed(active?.step.startedAt, active?.step.totalPausedSeconds ?? 0, !!isPaused);

  const [showReasons, setShowReasons] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [count, setCount] = useState(0);
  const [pinnedJobId, setPinnedJobId] = useState<number | null>(null);

  const needName = !operator;
  const stamp = operator ? ` — by ${operator}` : "";

  function doStart(step: JobRouting) {
    if (needName) { toast.error(HI.pickNameFirst); return; }
    updateStatus.mutate(
      { id: step.id, data: { status: "in-progress", notes: `Shuru${stamp}` } },
      { onSuccess: () => toast.success(`${HI.start} ✓`) },
    );
  }
  function doPause(reason: string, hiLabel: string) {
    if (!active) return;
    pauseM.mutate(
      { id: active.step.id, reason, notes: `${hiLabel}${stamp}` },
      { onSuccess: () => { setShowReasons(false); toast.success(`${HI.pause}: ${hiLabel}`); } },
    );
  }
  function doResume() {
    if (!active) return;
    resumeM.mutate({ id: active.step.id }, { onSuccess: () => toast.success(HI.resume) });
  }
  function openCount() {
    if (!active) return;
    setCount(active.job.plannedSheets ?? active.job.qtySheets ?? 0);
    setShowCount(true);
  }
  function doComplete() {
    if (!active) return;
    updateStatus.mutate(
      { id: active.step.id, data: { status: "completed", actualQty: count, notes: `Khatam ${count} ${HI.sheets}${stamp}` } },
      { onSuccess: () => { setShowCount(false); toast.success(`${HI.done} ✓ ${count.toLocaleString("en-IN")} ${HI.sheets}`); } },
    );
  }

  function onScanned(text: string) {
    setShowScan(false);
    const m = text.match(/job[:/](\d+)/i) ?? text.match(/^(\d+)$/);
    const id = m ? parseInt(m[1], 10) : NaN;
    if (isNaN(id)) { toast.error("QR समझ नहीं आया"); return; }
    const job = (jobs ?? []).find((j) => j.id === id);
    if (!job) { toast.error(`Job #${id} नहीं मिला`); return; }
    const hasStepHere = job.routing?.some((r) => r.machineId === machineId && r.status !== "completed");
    if (!hasStepHere) { toast.error(`${job.jobCode} इस मशीन का काम नहीं`); return; }
    setPinnedJobId(id);
    toast.success(`${job.jobCode} खुल गया`);
  }

  if (!machine) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="text-center">
          <p className="text-2xl font-bold mb-4">Machine not found</p>
          <Link href="/floor/stations"><a className="text-primary underline text-lg">{HI.allMachines}</a></Link>
        </div>
      </div>
    );
  }

  const waitingNames = current && current.step.canStart !== true && current.step.status !== "in-progress" && current.step.status !== "paused"
    ? (current.job.routing ?? [])
        .filter((r) => r.status !== "completed" && r.id !== current.step.id)
        .map((r) => r.machineName || `M${r.machineId}`)
        .slice(0, 3)
    : [];

  return (
    <div className="min-h-screen bg-background flex flex-col select-none">
      {/* header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/floor/stations">
            <a className="p-3 -ml-2 rounded-xl hover:bg-muted"><ArrowLeft size={28} /></a>
          </Link>
          <span className={cn(
            "w-4 h-4 rounded-full shrink-0",
            machine.status === "running" ? "bg-emerald-500 animate-pulse"
              : machine.status === "maintenance" ? "bg-rose-500" : "bg-slate-300",
          )} />
          <h1 className="text-2xl md:text-3xl font-black truncate">{machine.machineName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowScan(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-primary text-primary font-black text-lg"
          >
            <QrCode size={24} /> स्कैन
          </button>
          <LiveClock />
        </div>
      </header>

      {/* WHO row */}
      <div className="px-5 py-3 border-b border-border bg-muted/20">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <User size={13} /> {HI.who}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {operatorNames.map((n) => (
            <button
              key={n}
              onClick={() => setOperator(n)}
              className={cn(
                "px-5 py-3 rounded-xl border-2 text-lg font-bold whitespace-nowrap min-h-[52px]",
                operator === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {needName && <p className="text-sm text-amber-600 font-semibold mt-1.5">☝️ {HI.pickNameFirst}</p>}
      </div>

      {/* NOW card */}
      <main className="flex-1 p-5 flex flex-col gap-5">
        {!current ? (
          <div className="flex-1 grid place-items-center rounded-3xl border-2 border-dashed border-border">
            <div className="text-center">
              <p className="text-4xl font-black text-muted-foreground">{HI.idle}</p>
              <p className="text-lg text-muted-foreground mt-2">{HI.idleSub}</p>
            </div>
          </div>
        ) : (
          <div className={cn(
            "rounded-3xl border-2 p-6 md:p-8",
            active
              ? isPaused
                ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
                : "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20"
              : current.step.canStart === true
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/20",
          )}>
            {/* job identity */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-5xl md:text-6xl font-black tracking-tight">{current.job.jobCode}</p>
                <p className="text-xl md:text-2xl font-semibold mt-1 truncate">
                  {HI.client}: {current.job.clientName}
                </p>
                <p className="text-lg text-muted-foreground mt-0.5 truncate">
                  {HI.material}: {current.job.materialName ?? "—"}{current.job.materialGsm ? ` · ${current.job.materialGsm} GSM` : ""}
                </p>
                <p className="text-lg text-muted-foreground">
                  {HI.qty}: <span className="font-bold text-foreground">{(current.job.plannedSheets ?? current.job.qtySheets).toLocaleString("en-IN")}</span> {HI.sheets}
                </p>
              </div>
              {active && (
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-end">
                    <Clock size={12} /> {isPaused ? HI.pausedBanner : HI.running}
                  </p>
                  <p className={cn("text-4xl font-black tabular-nums", isPaused ? "text-amber-600" : "text-emerald-600")}>
                    {fmtHMS(elapsed)}
                  </p>
                </div>
              )}
            </div>

            {/* action zone */}
            <div className="mt-7">
              {active ? (
                isPaused ? (
                  <BigButton color="emerald" onClick={doResume} icon={<Play size={40} />} hi={HI.resume} en={HI.resumeSub} />
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <BigButton color="amber" onClick={() => setShowReasons(true)} icon={<Pause size={40} />} hi={HI.pause} en={HI.pauseSub} />
                    <BigButton color="emerald" onClick={openCount} icon={<CheckCircle2 size={40} />} hi={HI.done} en={HI.doneSub} />
                  </div>
                )
              ) : current.step.canStart === true ? (
                <BigButton color="primary" disabled={needName} onClick={() => doStart(current.step)} icon={<Play size={44} />} hi={HI.start} en={HI.startSub} />
              ) : (
                <div className="rounded-2xl bg-muted/40 border border-border p-5 flex items-center gap-4">
                  <Lock size={36} className="text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-2xl font-bold">{HI.locked}</p>
                    {waitingNames.length > 0 && (
                      <p className="text-lg text-muted-foreground mt-0.5">{HI.waitingFor} <b>{waitingNames.join(", ")}</b></p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* queue */}
        {queueRest.length > 0 && (
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">{HI.queue}</p>
            <div className="space-y-2">
              {queueRest.map(({ job, step }) => (
                <div key={step.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold truncate">{job.jobCode} <span className="font-medium text-muted-foreground">· {job.clientName}</span></p>
                    <p className="text-sm text-muted-foreground truncate">
                      {(job.plannedSheets ?? job.qtySheets).toLocaleString("en-IN")} {HI.sheets}{job.materialName ? ` · ${job.materialName}` : ""}
                    </p>
                  </div>
                  {step.canStart === true
                    ? <span className="text-emerald-600 font-bold text-sm shrink-0">READY</span>
                    : <Lock size={20} className="text-muted-foreground shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ROK reason overlay */}
      {showReasons && (
        <Overlay onClose={() => setShowReasons(false)} title={HI.whyPause}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {PAUSE_REASONS_HI.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.value}
                  onClick={() => doPause(r.value, r.hi)}
                  className="rounded-2xl border-2 border-border bg-card p-6 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 min-h-[130px] flex flex-col items-center justify-center gap-2"
                >
                  <Icon size={36} className="text-amber-600" />
                  <span className="text-xl font-black text-center leading-tight">{r.hi}</span>
                  <span className="text-xs text-muted-foreground">{r.en}</span>
                </button>
              );
            })}
          </div>
        </Overlay>
      )}

      {/* KHATAM count overlay */}
      {showCount && (
        <Overlay onClose={() => setShowCount(false)} title={HI.howMany}>
          <div className="max-w-md mx-auto">
            <p className="text-7xl font-black text-center tabular-nums mb-6">{count.toLocaleString("en-IN")}</p>
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[+100, +10, -10, -100].map((d) => (
                <button
                  key={d}
                  onClick={() => setCount((c) => Math.max(0, c + d))}
                  className={cn(
                    "rounded-xl border-2 py-5 text-2xl font-black",
                    d > 0 ? "border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20"
                      : "border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/20",
                  )}
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setShowCount(false)} className="rounded-2xl border-2 border-border py-6 text-2xl font-bold">
                {HI.cancel}
              </button>
              <button
                onClick={doComplete}
                className="rounded-2xl bg-emerald-600 text-white py-6 text-2xl font-black flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={28} /> {HI.confirm}
              </button>
            </div>
          </div>
        </Overlay>
      )}
      {/* SCAN overlay */}
      {showScan && <ScanOverlay onResult={onScanned} onClose={() => setShowScan(false)} />}
    </div>
  );
}

/* camera QR scanner via html5-qrcode */
function ScanOverlay({ onResult, onClose }: { onResult: (t: string) => void; onClose: () => void }) {
  const boxId = "pf-qr-scan-box";
  useEffect(() => {
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let stopped = false;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (stopped) return;
      const s = new Html5Qrcode(boxId);
      scanner = s as unknown as { stop: () => Promise<void>; clear: () => void };
      s.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text: string) => {
          s.stop().then(() => s.clear()).catch(() => {});
          scanner = null;
          onResult(text);
        },
        () => {},
      ).catch(() => {
        onClose();
      });
    });
    return () => {
      stopped = true;
      if (scanner) scanner.stop().then(() => scanner?.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Overlay title="जॉब कार्ड स्कैन करें" onClose={onClose}>
      <div id={boxId} className="max-w-md mx-auto rounded-2xl overflow-hidden border-2 border-border" />
      <p className="text-center text-muted-foreground mt-4 text-lg">QR को कैमरे के सामने रखें</p>
    </Overlay>
  );
}

/* ── little pieces ── */
function BigButton({ color, onClick, icon, hi, en, disabled }: {
  color: "primary" | "amber" | "emerald";
  onClick: () => void; icon: React.ReactNode; hi: string; en: string; disabled?: boolean;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground",
    amber: "bg-amber-500 text-white",
    emerald: "bg-emerald-600 text-white",
  }[color];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full rounded-2xl py-7 md:py-9 flex items-center justify-center gap-4 shadow-lg active:scale-[0.99] transition-transform disabled:opacity-40",
        styles,
      )}
    >
      {icon}
      <span className="text-4xl md:text-5xl font-black">{hi}</span>
      <span className="text-lg font-bold opacity-70 self-end mb-1.5">{en}</span>
    </button>
  );
}

function Overlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-black">{title}</h2>
          <button onClick={onClose} className="px-5 py-3 rounded-xl border-2 border-border text-lg font-bold">
            {HI.cancel}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000 * 20);
    return () => clearInterval(iv);
  }, []);
  return (
    <p className="text-xl font-bold tabular-nums text-muted-foreground">
      {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
    </p>
  );
}
