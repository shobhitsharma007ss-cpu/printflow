import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button, Modal } from "@/components/ui-elements";
import { cn } from "@/lib/utils";

/* Move a step to another machine of the same type.
   Bobst 1 breaks down mid-run; Bobst 2's operator takes the job over.
   Only same-type machines are offered — the API enforces that too. */

const API = import.meta.env.VITE_API_URL ?? "";

type Alternative = {
  id: number; machineName: string; machineCode: string | null; status: string;
};

const STATUS_TONE: Record<string, string> = {
  idle: "text-emerald-600",
  running: "text-amber-600",
  maintenance: "text-rose-600",
};

export function ReassignMachineButton({
  routingId,
  currentMachineName,
  disabled,
  onDone,
}: {
  routingId: number;
  currentMachineName?: string | null;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: alternatives, isLoading } = useQuery<Alternative[]>({
    queryKey: ["routing-alternatives", routingId],
    queryFn: async () =>
      (await fetch(`${API}/api/job-routing/${routingId}/alternatives`, { credentials: "include" })).json(),
    enabled: open,
  });

  const reassign = useMutation({
    mutationFn: async (machineId: number) => {
      const r = await fetch(`${API}/api/job-routing/${routingId}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ machineId }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not move the step");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Step moved to the other machine");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["machines"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message, { duration: 7000 }),
  });

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Move to another machine"
        className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Repeat size={14} className="text-muted-foreground" />
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Move to another machine">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Currently on <span className="font-semibold text-foreground">{currentMachineName ?? "—"}</span>.
            Pick where this step should run instead.
          </p>

          {isLoading && <p className="text-sm text-muted-foreground">Loading machines…</p>}

          {alternatives && alternatives.length === 0 && (
            <p className="text-sm text-muted-foreground rounded-lg bg-muted/40 p-3">
              No other machine of this type — nothing to move to.
            </p>
          )}

          <div className="space-y-1.5">
            {(alternatives ?? []).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => reassign.mutate(m.id)}
                disabled={reassign.isPending}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-left hover:border-primary hover:bg-muted/40 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{m.machineName}</span>
                  <span className={cn("text-[11px] font-bold uppercase", STATUS_TONE[m.status] ?? "text-muted-foreground")}>
                    {m.status}
                  </span>
                </div>
                {m.machineCode && <p className="text-[11px] text-muted-foreground font-mono">{m.machineCode}</p>}
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
