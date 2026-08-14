import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Building2, CheckCircle2, Clock, AlertTriangle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, Button, Input, Label, Select, Modal } from "@/components/ui-elements";
import { useVendors } from "@/hooks/use-vendors";
import { cn } from "@/lib/utils";

/* Work that leaves the plant — lamination, foiling, embossing.
   An outsourced step has a vendor instead of a machine. It uses the same
   status field as any other routing step, so receiving stock back completes
   it and unlocks the next step through the normal prerequisite lock. */

const API = import.meta.env.VITE_API_URL ?? "";

type OutsourcedStep = {
  id: number; jobId: number; jobCode: string | null; jobName: string | null;
  clientName: string | null; stepCode: string; status: string;
  vendorId: number | null; vendorName: string | null; vendorPhone: string | null;
  sentAt: string | null; expectedReturnAt: string | null; returnedAt: string | null;
  outsourceCost: string | null; qtySheets: number | null;
};

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

export function OutsourcedWorkPanel() {
  const qc = useQueryClient();
  const { data: vendors } = useVendors();
  const [receiveFor, setReceiveFor] = useState<OutsourcedStep | null>(null);
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  const { data: steps } = useQuery<OutsourcedStep[]>({
    queryKey: ["outsourced-steps"],
    queryFn: async () => (await fetch(`${API}/api/outsourced-steps`, { credentials: "include" })).json(),
    refetchInterval: 60000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["outsourced-steps"] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  };

  const setVendor = useMutation({
    mutationFn: async ({ id, vendorId, expectedReturnAt }: { id: number; vendorId: number; expectedReturnAt?: string }) => {
      const r = await fetch(`${API}/api/job-routing/${id}/outsource`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isOutsourced: true, vendorId, expectedReturnAt }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not update");
      return r.json();
    },
    onSuccess: () => { toast.success("Vendor set"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendOut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/api/job-routing/${id}/send-to-vendor`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not send");
      return r.json();
    },
    onSuccess: () => { toast.success("Marked as sent to vendor"); invalidate(); },
    onError: (e: Error) => toast.error(e.message, { duration: 7000 }),
  });

  const receiveBack = useMutation({
    mutationFn: async ({ id, outsourceCost, notes }: { id: number; outsourceCost?: number; notes?: string }) => {
      const r = await fetch(`${API}/api/job-routing/${id}/receive-from-vendor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ outsourceCost, notes }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not receive");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Stock received — next step unlocked");
      setReceiveFor(null); setCost(""); setNotes("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chaseOnWhatsApp = (s: OutsourcedStep) => {
    if (!s.vendorPhone) { toast.error("Vendor has no phone number"); return; }
    const clean = s.vendorPhone.replace(/\D/g, "");
    const wa = clean.length === 10 ? `91${clean}` : clean;
    const msg = `Namaste, ${s.jobCode ?? "job"} (${s.jobName ?? ""}) ka ${s.stepCode.toLowerCase()} kaam kab tak ho jayega? Expected: ${s.expectedReturnAt ? new Date(s.expectedReturnAt).toLocaleDateString("en-IN") : "—"}.\n\n— PrintFlow`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const pending = (steps ?? []).filter((s) => s.status !== "completed");
  if (!steps || steps.length === 0) return null;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Building2 size={14} className="text-primary" />
            At Vendor
          </h3>
          <span className="text-xs text-muted-foreground">
            {pending.length} outstanding
          </span>
        </div>

        <div className="divide-y divide-border">
          {steps.map((s) => {
            const sent = s.sentAt ? new Date(s.sentAt) : null;
            const due = s.expectedReturnAt ? new Date(s.expectedReturnAt) : null;
            const overdue = due && !s.returnedAt && due < new Date();
            const daysOut = sent && !s.returnedAt ? daysBetween(sent, new Date()) : null;

            return (
              <div key={s.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold font-mono text-sm">{s.jobCode ?? `#${s.jobId}`}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {s.stepCode}
                      </span>
                      {s.status === "completed" ? (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 size={10} /> back
                        </span>
                      ) : s.sentAt ? (
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1",
                          overdue
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                        )}>
                          {overdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
                          {overdue ? "overdue" : "at vendor"}
                          {daysOut != null ? ` · ${daysOut}d` : ""}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          not sent
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.jobName ?? ""}{s.clientName ? ` · ${s.clientName}` : ""}
                      {s.qtySheets ? ` · ${s.qtySheets.toLocaleString("en-IN")} sheets` : ""}
                    </p>
                    <p className="text-xs mt-0.5">
                      <span className="text-muted-foreground">Vendor: </span>
                      <span className="font-semibold">{s.vendorName ?? "not set"}</span>
                      {due && <span className="text-muted-foreground"> · due {due.toLocaleDateString("en-IN")}</span>}
                      {s.outsourceCost && (
                        <span className="text-muted-foreground"> · ₹{Number(s.outsourceCost).toLocaleString("en-IN")}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {s.status !== "completed" && s.vendorPhone && (
                      <button
                        onClick={() => chaseOnWhatsApp(s)}
                        title="Chase on WhatsApp"
                        className="rounded-lg border border-border p-1.5 hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-950/30 transition-colors"
                      >
                        <MessageCircle size={14} className="text-emerald-600" />
                      </button>
                    )}
                    {s.status !== "completed" && !s.sentAt && s.vendorId && (
                      <Button
                        variant="secondary"
                        onClick={() => sendOut.mutate(s.id)}
                        disabled={sendOut.isPending}
                        className="text-xs h-8 flex items-center gap-1.5"
                      >
                        <Truck size={13} /> Send out
                      </Button>
                    )}
                    {s.status !== "completed" && s.sentAt && (
                      <Button
                        onClick={() => { setReceiveFor(s); setCost(s.outsourceCost ?? ""); }}
                        className="text-xs h-8 flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={13} /> Received
                      </Button>
                    )}
                  </div>
                </div>

                {/* Vendor picker before the stock goes out */}
                {s.status !== "completed" && !s.sentAt && (
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={s.vendorId ? String(s.vendorId) : ""}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (v) setVendor.mutate({ id: s.id, vendorId: v });
                      }}
                      className="h-8 text-xs"
                    >
                      <option value="">Pick vendor…</option>
                      {(vendors ?? []).map((v) => (
                        <option key={v.id} value={v.id}>{v.vendorName}</option>
                      ))}
                    </Select>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={s.expectedReturnAt ? new Date(s.expectedReturnAt).toISOString().slice(0, 10) : ""}
                      onChange={(e) => {
                        if (s.vendorId) {
                          setVendor.mutate({ id: s.id, vendorId: s.vendorId, expectedReturnAt: e.target.value });
                        } else {
                          toast.error("Pick a vendor first");
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Modal isOpen={!!receiveFor} onClose={() => setReceiveFor(null)} title="Receive from vendor">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {receiveFor?.jobCode} — {receiveFor?.stepCode.toLowerCase()} back from {receiveFor?.vendorName ?? "vendor"}.
            This completes the step and unlocks whatever comes next.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Vendor charge (₹)</Label>
            <Input type="number" step="any" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 4500" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 200 sheets damaged, replaced" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReceiveFor(null)}>Cancel</Button>
            <Button
              onClick={() => receiveFor && receiveBack.mutate({
                id: receiveFor.id,
                outsourceCost: cost ? parseFloat(cost) : undefined,
                notes: notes.trim() || undefined,
              })}
              disabled={receiveBack.isPending}
            >
              {receiveBack.isPending ? "Saving…" : "Confirm received"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
