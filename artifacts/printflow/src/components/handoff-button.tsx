import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Split, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Modal } from "@/components/ui-elements";
import { cn } from "@/lib/utils";

/* SPLIT-RUN PARTIAL HANDOFF

   Prakash's die cutters are the plant bottleneck — printing and pasting are fast,
   die cutting cannot keep up and runs overtime and Sundays. So finished lifts walk
   downstream WHILE the press is still printing. That happens every day, not as an
   exception, and strict sequential routing would idle the bottleneck.

   This releases a partial quantity: the upstream step keeps running, the downstream
   step unlocks, and the event is logged so the timeline shows when lifts actually
   moved. */

const API = import.meta.env.VITE_API_URL ?? "";

const REASONS = [
  "Urgent dispatch",
  "Keep die cutter running",
  "Drying time",
  "Customer pickup",
  "Machine free now",
];

export function HandoffButton({
  routingId,
  stepName,
  plannedQty,
  doneSoFar,
  onDone,
}: {
  routingId: number;
  stepName?: string | null;
  plannedQty?: number | null;
  doneSoFar?: number | null;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(REASONS[1]);
  const [by, setBy] = useState("");

  const release = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/job-routing/${routingId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          qty: parseInt(qty, 10),
          reason,
          performedBy: by.trim() || undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not release");
      return r.json();
    },
    onSuccess: (d: { unlocked?: string[] }) => {
      const next = d.unlocked?.length ? d.unlocked.join(", ") : "next stage";
      toast.success(`${parseInt(qty, 10).toLocaleString("en-IN")} released — ${next} can start`);
      setOpen(false);
      setQty("");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["machines"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message, { duration: 7000 }),
  });

  const n = parseInt(qty, 10) || 0;
  const over = plannedQty ? n > plannedQty : false;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Release part of this run to the next stage"
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5
                   text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors
                   dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
      >
        <Split size={13} /> Release part
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Release part of this run">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {stepName ?? "This step"} keeps running. Whatever you release now can start
            at the next stage immediately.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">How many are ready to move?</Label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={doneSoFar ? String(doneSoFar) : "e.g. 4000"}
              className="text-lg h-12 font-bold tabular-nums"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[1000, 2000, 5000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setQty(String(v))}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                >
                  {v.toLocaleString("en-IN")}
                </button>
              ))}
              {plannedQty ? (
                <button
                  type="button"
                  onClick={() => setQty(String(Math.floor(plannedQty / 2)))}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                >
                  half
                </button>
              ) : null}
            </div>
            {over && (
              <p className="text-xs font-semibold text-rose-600">
                More than the whole job ({plannedQty?.toLocaleString("en-IN")}). Check the number.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Why</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-lg border px-2.5 py-2 text-xs font-semibold text-left transition-colors",
                    reason === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Released by</Label>
            <Input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Supervisor name" />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => release.mutate()}
              disabled={!n || over || release.isPending}
              className="flex items-center gap-2"
            >
              {release.isPending ? "Releasing…" : <>Release <ArrowRight size={15} /></>}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
