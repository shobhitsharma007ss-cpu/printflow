import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, X } from "lucide-react";
import { toast } from "sonner";

/* TAKE WHAT IS READY  ·  जो तैयार है वो ले लें

   The floor works by pull, not push. The die cutter operator sees the press
   running, sees his own machine standing free, and walks over for the finished
   lifts. Nobody goes to the press to ask permission, and the supervisor is not
   consulted for something that happens twenty times a day.

   The original build had this backwards: the upstream step "released" work from
   a menu three levels inside the job screen. This is the same operation from the
   side that actually initiates it — the operator who wants the work.

   It records the same event either way, so the audit trail is unchanged. */

const API = import.meta.env.VITE_API_URL ?? "";

const REASONS = [
  { hi: "मेरी मशीन खाली है",   en: "My machine is free" },
  { hi: "अर्जेंट डिस्पैच",      en: "Urgent dispatch" },
  { hi: "माल तैयार पड़ा है",    en: "Sheets are ready" },
  { hi: "सुखाने का समय",        en: "Drying time" },
];

export function TakeReadyButton({
  upstreamRoutingId,
  upstreamName,
  jobQty,
  onTaken,
  compact = false,
}: {
  upstreamRoutingId: number;
  upstreamName: string;
  jobQty?: number | null;
  onTaken?: () => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState(REASONS[0].en);
  const [by, setBy] = useState("");

  const take = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/job-routing/${upstreamRoutingId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ qty, reason, performedBy: by.trim() || undefined }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not take the sheets");
      return r.json();
    },
    onSuccess: () => {
      toast.success(`${qty?.toLocaleString("en-IN")} sheets taken — you can start now`);
      setOpen(false);
      setQty(null);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      onTaken?.();
    },
    onError: (e: Error) => toast.error(e.message, { duration: 7000 }),
  });

  const quick = [500, 1000, 2000, 5000].filter((n) => !jobQty || n < jobQty);
  if (jobQty && jobQty > 1000) quick.push(Math.floor(jobQty / 2));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
            : "w-full rounded-2xl bg-amber-500 hover:bg-amber-600 text-white px-6 py-6 flex items-center justify-center gap-4 transition-colors active:scale-[.99]"
        }
      >
        <ArrowDownToLine size={compact ? 13 : 40} />
        {compact ? (
          "Take ready sheets"
        ) : (
          <span className="text-left">
            <span className="block text-3xl font-black leading-tight">जो तैयार है वो लें</span>
            <span className="block text-base opacity-90 mt-0.5">Take the sheets that are ready</span>
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3"
          onMouseDown={(e) => e.currentTarget === e.target && setOpen(false)}
        >
          <div className="bg-background rounded-3xl w-full max-w-lg p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black leading-tight">कितनी शीट ले रहे हैं?</h2>
                <p className="text-muted-foreground text-sm mt-0.5">
                  How many sheets are you taking from {upstreamName}?
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-muted shrink-0">
                <X size={22} />
              </button>
            </div>

            {/* Big taps. An operator on a tablet must not have to type. */}
            <div className="grid grid-cols-3 gap-2">
              {quick.map((n) => (
                <button
                  key={n}
                  onClick={() => setQty(n)}
                  className={`rounded-2xl py-5 text-2xl font-black tabular-nums border-2 transition-colors ${
                    qty === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {n.toLocaleString("en-IN")}
                </button>
              ))}
            </div>

            <div>
              <p className="text-sm font-bold text-muted-foreground mb-1.5">क्यों / Why</p>
              <div className="grid grid-cols-2 gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.en}
                    onClick={() => setReason(r.en)}
                    className={`rounded-xl px-3 py-3 text-left border-2 transition-colors ${
                      reason === r.en ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                    }`}
                  >
                    <span className="block text-base font-bold">{r.hi}</span>
                    <span className="block text-xs text-muted-foreground">{r.en}</span>
                  </button>
                ))}
              </div>
            </div>

            <input
              value={by}
              onChange={(e) => setBy(e.target.value)}
              placeholder="आपका नाम / Your name"
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-lg"
            />

            <button
              onClick={() => take.mutate()}
              disabled={!qty || take.isPending}
              className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40
                         text-white py-5 text-2xl font-black transition-colors"
            >
              {take.isPending ? "…" : "ले लिया · Taken"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
