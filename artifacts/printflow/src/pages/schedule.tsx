import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Grid3X3,
  AlertTriangle,
  Loader2,
  X,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useGetSchedule,
  useRescheduleJob,
  getGetScheduleQueryKey,
} from "@workspace/api-client-react";
import type { ScheduleJobBlock, ScheduleMachineRow } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ─── Date helpers ─────────────────────────────────────────────────────────────

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isToday(isoStr: string): boolean {
  return isoStr === isoDate(new Date());
}

function fmtDayName(isoStr: string): string {
  return SHORT_DAY[new Date(isoStr + "T00:00:00").getDay()];
}

function fmtShortDate(isoStr: string): string {
  const d = new Date(isoStr + "T00:00:00");
  return `${d.getDate()} ${SHORT_MONTH[d.getMonth()]}`;
}

function fmtMonthYear(year: number, month: number): string {
  return `${SHORT_MONTH[month]} ${year}`;
}

function weekLabel(days7: string[]): string {
  const start = new Date(days7[0] + "T00:00:00");
  const end = new Date(days7[6] + "T00:00:00");
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${SHORT_MONTH[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${fmtShortDate(days7[0])} – ${fmtShortDate(days7[6])} ${end.getFullYear()}`;
}

// ─── Color palette ────────────────────────────────────────────────────────────

const PALETTE = [
  { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-300", border: "border-blue-200 dark:border-blue-700" },
  { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-800 dark:text-violet-300", border: "border-violet-200 dark:border-violet-700" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-700" },
  { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-300", border: "border-amber-200 dark:border-amber-700" },
  { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-800 dark:text-rose-300", border: "border-rose-200 dark:border-rose-700" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-800 dark:text-cyan-300", border: "border-cyan-200 dark:border-cyan-700" },
  { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-300", border: "border-orange-200 dark:border-orange-700" },
  { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-800 dark:text-teal-300", border: "border-teal-200 dark:border-teal-700" },
];

function jobColor(jobId: number) {
  return PALETTE[jobId % PALETTE.length];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RescheduleTarget {
  jobId: number;
  jobCode: string;
  jobName: string;
  currentDate: string;
}

// ─── Reschedule modal ─────────────────────────────────────────────────────────

function RescheduleModal({ target, onClose, onSuccess }: {
  target: RescheduleTarget;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [date, setDate] = useState(target.currentDate);
  const { mutate: reschedule, isPending } = useRescheduleJob({
    mutation: {
      onSuccess: () => {
        toast.success("Job rescheduled", {
          description: `${target.jobCode} moved to ${fmtShortDate(date)}`,
        });
        onSuccess();
        onClose();
      },
      onError: () => {
        toast.error("Failed to reschedule job");
      },
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-base">Reschedule Job</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-mono text-primary">{target.jobCode}</span> — {target.jobName}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">New scheduled date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>
          {date && date !== target.currentDate && (
            <p className="text-xs text-muted-foreground text-center">
              Moving from {fmtShortDate(target.currentDate)} → {fmtShortDate(date)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={!date || isPending}
              onClick={() => reschedule({ id: target.jobId, data: { scheduledDate: date } })}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving…" : "Reschedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Load bar ─────────────────────────────────────────────────────────────────

function LoadBar({ booked, available, isOverloaded }: {
  booked: number;
  available: number;
  isOverloaded: boolean;
}) {
  const pct = Math.min((booked / available) * 100, 100);
  return (
    <div className="mt-1.5">
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isOverloaded ? "bg-rose-500" : pct > 70 ? "bg-amber-400" : "bg-emerald-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={cn(
        "text-[10px] text-center mt-0.5 font-medium",
        isOverloaded ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
      )}>
        {booked.toFixed(1)}/{available}h{isOverloaded ? " ⚠ overloaded" : ""}
      </div>
    </div>
  );
}

// ─── Job chip ─────────────────────────────────────────────────────────────────

function JobChip({ job, onClick }: {
  job: ScheduleJobBlock;
  onClick: (j: ScheduleJobBlock) => void;
}) {
  const col = jobColor(job.jobId);
  return (
    <button
      onClick={() => onClick(job)}
      title={`${job.jobName} — ${job.clientName}\n${job.estimatedHours.toFixed(1)}h est. on ${job.stepCode || "step " + job.stepNumber}\nClick to reschedule`}
      className={cn(
        "w-full text-left px-2 py-1 rounded-md border text-xs font-medium transition-opacity hover:opacity-80 active:scale-95",
        col.bg, col.text, col.border
      )}
    >
      <div className="font-mono truncate leading-tight">{job.jobCode}</div>
      <div className="text-[10px] opacity-70 truncate leading-tight">{job.estimatedHours.toFixed(1)}h · {job.stepCode || "step " + job.stepNumber}</div>
    </button>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({ days7, machines, onReschedule }: {
  days7: string[];
  machines: ScheduleMachineRow[];
  onReschedule: (target: RescheduleTarget) => void;
}) {
  if (machines.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <CalendarDays size={44} className="mx-auto mb-3 opacity-20" />
        <p className="font-semibold text-base">No jobs scheduled this week</p>
        <p className="text-sm mt-1 opacity-60">
          Set scheduled dates on jobs to see machine load here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[700px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-[160px] min-w-[160px] text-left px-4 py-3 bg-muted/60 border-b border-r border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Machine
            </th>
            {days7.map(date => (
              <th
                key={date}
                className={cn(
                  "px-2 py-3 border-b border-r border-border text-center min-w-[110px]",
                  isToday(date) ? "bg-primary/5" : "bg-muted/30"
                )}
              >
                <div className={cn("text-xs font-medium", isToday(date) ? "text-primary" : "text-muted-foreground")}>
                  {fmtDayName(date)}
                </div>
                <div className={cn("text-sm font-bold mt-0.5", isToday(date) ? "text-primary" : "text-foreground")}>
                  {fmtShortDate(date)}
                </div>
                {isToday(date) && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mx-auto mt-1" />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {machines.map((machine, mi) => {
            const rowDays = days7.map(date => machine.days.find(d => d.date === date));
            const hasAnyJob = rowDays.some(d => d && d.jobs.length > 0);
            if (!hasAnyJob) return null;

            return (
              <tr key={machine.machineId} className={cn("border-b border-border", mi % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                <td className="sticky left-0 z-10 px-4 py-3 border-r border-border bg-inherit">
                  <div className="text-sm font-semibold leading-tight truncate max-w-[148px]" title={machine.machineName}>
                    {machine.machineName}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize mt-0.5">{machine.machineType}</div>
                </td>
                {rowDays.map((day, di) => {
                  if (!day) return (
                    <td key={di} className="px-2 py-2 border-r border-border" />
                  );
                  return (
                    <td
                      key={day.date}
                      className={cn(
                        "px-2 py-2 border-r border-border align-top",
                        day.isOverloaded && "bg-rose-50 dark:bg-rose-950/20",
                        isToday(day.date) && !day.isOverloaded && "bg-primary/3"
                      )}
                    >
                      <div className="space-y-1 min-h-[36px]">
                        {day.jobs.map(job => (
                          <JobChip
                            key={`${job.jobId}-${job.stepCode}-${job.stepNumber}`}
                            job={job}
                            onClick={j => onReschedule({
                              jobId: j.jobId,
                              jobCode: j.jobCode,
                              jobName: j.jobName,
                              currentDate: j.scheduledDate,
                            })}
                          />
                        ))}
                      </div>
                      {day.bookedHours > 0 && (
                        <LoadBar
                          booked={day.bookedHours}
                          available={day.availableHours}
                          isOverloaded={day.isOverloaded}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({ year, month, data, onDayClick }: {
  year: number;
  month: number;
  data: { days: string[]; machines: ScheduleMachineRow[] } | undefined;
  onDayClick: (date: string) => void;
}) {
  const firstDayOfMonth = new Date(year, month, 1);
  const gridStart = getMonday(firstDayOfMonth);

  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(isoDate(addDays(gridStart, w * 7 + d)));
    }
    weeks.push(week);
  }

  function getDayLoad(date: string) {
    if (!data) return { totalJobs: 0, isOverloaded: false, maxPct: 0 };
    let totalJobs = 0;
    let isOverloaded = false;
    let maxPct = 0;
    for (const machine of data.machines) {
      const day = machine.days.find(d => d.date === date);
      if (day) {
        totalJobs += day.jobs.length;
        if (day.isOverloaded) isOverloaded = true;
        const pct = day.availableHours > 0 ? (day.bookedHours / day.availableHours) * 100 : 0;
        if (pct > maxPct) maxPct = pct;
      }
    }
    return { totalJobs, isOverloaded, maxPct };
  }

  const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {dayHeaders.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map(date => {
          const inMonth = new Date(date + "T00:00:00").getMonth() === month;
          const { totalJobs, isOverloaded, maxPct } = getDayLoad(date);
          const today = isToday(date);

          return (
            <button
              key={date}
              onClick={() => onDayClick(date)}
              title={totalJobs > 0 ? `${fmtShortDate(date)}: ${totalJobs} job(s) — click to view week` : `${fmtShortDate(date)}: no jobs`}
              className={cn(
                "rounded-xl p-2 text-left min-h-[76px] border transition-all hover:shadow-sm active:scale-95",
                !inMonth && "opacity-35",
                today && "ring-2 ring-primary ring-offset-1",
                isOverloaded
                  ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 hover:bg-rose-100"
                  : totalJobs > 0
                    ? maxPct > 70
                      ? "bg-amber-50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900 hover:bg-amber-100"
                      : "bg-emerald-50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100"
                    : "bg-background border-border hover:bg-muted/50"
              )}
            >
              <div className={cn(
                "text-sm font-bold leading-tight",
                today ? "text-primary" : !inMonth ? "text-muted-foreground/50" : "text-foreground"
              )}>
                {new Date(date + "T00:00:00").getDate()}
              </div>
              {totalJobs > 0 && inMonth && (
                <div className="mt-1.5 space-y-0.5">
                  <div className={cn(
                    "text-xs font-semibold leading-tight",
                    isOverloaded ? "text-rose-600 dark:text-rose-400" : maxPct > 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {totalJobs} job{totalJobs !== 1 ? "s" : ""}
                  </div>
                  {isOverloaded && (
                    <div className="text-[10px] text-rose-500 flex items-center gap-0.5 font-medium">
                      <AlertTriangle size={9} /> Overloaded
                    </div>
                  )}
                  <div className="w-full h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mt-1">
                    <div
                      className={cn("h-full rounded-full", isOverloaded ? "bg-rose-500" : maxPct > 70 ? "bg-amber-400" : "bg-emerald-400")}
                      style={{ width: `${Math.min(maxPct, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Schedule() {
  const queryClient = useQueryClient();
  const today = new Date();

  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(() => getMonday(today));
  const [monthOffset, setMonthOffset] = useState(0);
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);

  const currentMonthDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const monthYear = { year: currentMonthDate.getFullYear(), month: currentMonthDate.getMonth() };

  const weekDays7 = Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i)));

  // Week query
  const weekQueryKey = { startDate: isoDate(weekStart), weeks: 1 };
  const { data: weekData, isLoading: weekLoading, isError: weekError } = useGetSchedule(
    weekQueryKey,
    { query: { staleTime: 30_000, enabled: viewMode === "week" } }
  );

  // Month query (6 weeks from Monday before month start)
  const monthGridStart = getMonday(new Date(monthYear.year, monthYear.month, 1));
  const monthQueryKey = { startDate: isoDate(monthGridStart), weeks: 6 };
  const { data: monthData, isLoading: monthLoading } = useGetSchedule(
    monthQueryKey,
    { query: { staleTime: 30_000, enabled: viewMode === "month" } }
  );

  const isLoading = viewMode === "week" ? weekLoading : monthLoading;

  // Filter machines for week view: only those with jobs in the window
  const weekMachines = (weekData?.machines ?? []).filter(m =>
    m.days.some(d => weekDays7.includes(d.date) && d.jobs.length > 0)
  );

  // Unscheduled jobs: from whichever data is loaded
  const unscheduled = (viewMode === "week" ? weekData : monthData)?.unscheduledJobs ?? [];

  function goToWeekOf(date: string) {
    setWeekStart(getMonday(new Date(date + "T00:00:00")));
    setViewMode("week");
  }

  function handleRescheduleSuccess() {
    queryClient.invalidateQueries({ queryKey: getGetScheduleQueryKey(weekQueryKey) });
    queryClient.invalidateQueries({ queryKey: getGetScheduleQueryKey(monthQueryKey) });
    // Also invalidate the jobs list to reflect the new date there
    queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
  }

  function navPrev() {
    if (viewMode === "week") setWeekStart(prev => addDays(prev, -7));
    else setMonthOffset(o => o - 1);
  }
  function navNext() {
    if (viewMode === "week") setWeekStart(prev => addDays(prev, 7));
    else setMonthOffset(o => o + 1);
  }
  function navToday() {
    if (viewMode === "week") setWeekStart(getMonday(today));
    else setMonthOffset(0);
  }

  return (
    <div className="max-w-full space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Machine load & capacity planning
          </p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setViewMode("week")}
            className={cn(
              "px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors",
              viewMode === "week" ? "bg-primary text-white" : "hover:bg-muted text-muted-foreground"
            )}
          >
            <Grid3X3 size={14} />
            Week
          </button>
          <button
            onClick={() => setViewMode("month")}
            className={cn(
              "px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors",
              viewMode === "month" ? "bg-primary text-white" : "hover:bg-muted text-muted-foreground"
            )}
          >
            <Calendar size={14} />
            Month
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={navPrev}
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={navToday}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
        >
          Today
        </button>
        <button
          onClick={navNext}
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ChevronRight size={16} />
        </button>
        <span className="text-base font-semibold ml-1">
          {viewMode === "week"
            ? weekLabel(weekDays7)
            : fmtMonthYear(monthYear.year, monthYear.month)}
        </span>
        {isLoading && (
          <Loader2 size={15} className="animate-spin text-muted-foreground ml-1" />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
          Under capacity
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
          Near capacity (70%+)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
          Overloaded (&gt;8 h/day)
        </span>
        <span className="opacity-50">· Click a job block to reschedule</span>
      </div>

      {/* Error */}
      {weekError && viewMode === "week" && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          Failed to load schedule data. Please refresh.
        </div>
      )}

      {/* Main grid */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={30} />
          </div>
        ) : viewMode === "week" ? (
          <WeekView
            days7={weekDays7}
            machines={weekMachines}
            onReschedule={setRescheduleTarget}
          />
        ) : (
          <div className="p-5">
            <MonthView
              year={monthYear.year}
              month={monthYear.month}
              data={monthData}
              onDayClick={goToWeekOf}
            />
          </div>
        )}
      </div>

      {/* Unscheduled jobs panel */}
      {unscheduled.length > 0 && (
        <div className="bg-card rounded-2xl border border-amber-200 dark:border-amber-800 p-5">
          <h2 className="font-semibold text-sm mb-3 text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle size={15} />
            {unscheduled.length} Unscheduled Job{unscheduled.length !== 1 ? "s" : ""}
            <span className="font-normal text-muted-foreground text-xs">— no date set yet</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {unscheduled.map(job => (
              <div
                key={job.jobId}
                className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/10"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-primary">{job.jobCode}</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                      job.status === "in-progress"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {job.status}
                    </span>
                  </div>
                  <div className="text-sm font-medium truncate mt-0.5 leading-tight">{job.jobName}</div>
                  <div className="text-xs text-muted-foreground truncate">{job.clientName}</div>
                </div>
                <button
                  onClick={() => setRescheduleTarget({
                    jobId: job.jobId,
                    jobCode: job.jobCode,
                    jobName: job.jobName,
                    currentDate: isoDate(today),
                  })}
                  title="Set scheduled date"
                  className="shrink-0 p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 transition-colors"
                >
                  <Calendar size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {rescheduleTarget && (
        <RescheduleModal
          target={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={handleRescheduleSuccess}
        />
      )}
    </div>
  );
}
