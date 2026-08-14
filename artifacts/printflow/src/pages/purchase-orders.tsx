import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Mail, MessageCircle, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, Button, Input, Label, Select, Modal } from "@/components/ui-elements";
import { useVendors } from "@/hooks/use-vendors";
import { useMaterials } from "@/hooks/use-inventory";
import { cn } from "@/lib/utils";

/* Purchase Orders.
   Raise an order against a vendor, then hand it over on WhatsApp or email.
   Sending uses a wa.me link / mailto — the owner's own number and inbox — so
   no gateway credentials or Meta approval are needed to place an order. */

const API = import.meta.env.VITE_API_URL ?? "";

type PoLine = {
  materialId: number | null;
  description: string;
  qty: string;
  unit: string;
  ratePerUnit: string;
};

type PoListRow = {
  id: number; poNumber: string; vendorName: string | null; status: string;
  orderDate: string; expectedDate: string | null; totalAmount: string;
  sentAt: string | null; sentVia: string | null;
};

type LowStockRow = {
  id: number; materialName: string; currentQty: string;
  reorderLevel: string; unit: string; ratePerUnit: string | null;
};

const emptyLine = (): PoLine => ({ materialId: null, description: "", qty: "", unit: "kg", ratePerUnit: "" });

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  received: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

export default function PurchaseOrders() {
  const qc = useQueryClient();
  const { data: vendors } = useVendors();
  const { data: materials } = useMaterials();

  const { data: pos } = useQuery<PoListRow[]>({
    queryKey: ["purchase-orders"],
    queryFn: async () => (await fetch(`${API}/api/purchase-orders`, { credentials: "include" })).json(),
  });

  const { data: lowStock } = useQuery<LowStockRow[]>({
    queryKey: ["po-suggestions"],
    queryFn: async () => (await fetch(`${API}/api/purchase-orders-suggestions`, { credentials: "include" })).json(),
  });

  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [gstPercent, setGstPercent] = useState("18");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PoLine[]>([emptyLine()]);

  const totals = useMemo(() => {
    const sub = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.ratePerUnit) || 0), 0);
    const gst = sub * ((parseFloat(gstPercent) || 0) / 100);
    return { sub, gst, total: sub + gst };
  }, [lines, gstPercent]);

  const createPo = useMutation({
    mutationFn: async () => {
      const body = {
        vendorId: parseInt(vendorId, 10),
        orderDate,
        expectedDate: expectedDate || undefined,
        gstPercent: parseFloat(gstPercent) || 0,
        notes: notes.trim() || undefined,
        items: lines
          .filter((l) => l.description.trim() && parseFloat(l.qty) > 0)
          .map((l) => ({
            materialId: l.materialId,
            description: l.description.trim(),
            qty: parseFloat(l.qty),
            unit: l.unit,
            ratePerUnit: parseFloat(l.ratePerUnit) || 0,
          })),
      };
      const r = await fetch(`${API}/api/purchase-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not create PO");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Purchase order created");
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setOpen(false);
      setLines([emptyLine()]); setVendorId(""); setNotes(""); setExpectedDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markSent = useMutation({
    mutationFn: async ({ id, via }: { id: number; via: string }) => {
      const r = await fetch(`${API}/api/purchase-orders/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ via }),
      });
      if (!r.ok) throw new Error("Could not mark as sent");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });

  /** Build the vendor-facing message. Hindi-first — the vendor reads it on a phone. */
  async function poMessage(id: number): Promise<{ text: string; phone?: string; email?: string }> {
    const r = await fetch(`${API}/api/purchase-orders/${id}`, { credentials: "include" });
    const po = await r.json();
    const lines: string[] = [
      `*Purchase Order ${po.poNumber}*`,
      `Dinaank: ${po.orderDate}`,
      po.expectedDate ? `Chahiye: ${po.expectedDate}` : "",
      "",
      "*Saamaan:*",
      ...po.items.map((it: { description: string; qty: string; unit: string; ratePerUnit: string }, i: number) =>
        `${i + 1}. ${it.description} — ${Number(it.qty).toLocaleString("en-IN")} ${it.unit} @ ₹${Number(it.ratePerUnit).toLocaleString("en-IN")}`),
      "",
      `Total (GST ke saath): ₹${Number(po.totalAmount).toLocaleString("en-IN")}`,
      po.notes ? `\nNote: ${po.notes}` : "",
      "",
      "— PrintFlow",
    ].filter(Boolean);
    return { text: lines.join("\n"), phone: po.vendor?.phone, email: po.vendor?.email };
  }

  async function sendWhatsApp(id: number) {
    const { text, phone } = await poMessage(id);
    if (!phone) { toast.error("Vendor has no phone number — add it in Settings"); return; }
    const clean = phone.replace(/\D/g, "");
    const wa = clean.length === 10 ? `91${clean}` : clean;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, "_blank");
    markSent.mutate({ id, via: "whatsapp" });
  }

  async function sendEmail(id: number) {
    const { text, email } = await poMessage(id);
    if (!email) { toast.error("Vendor has no email — add it in Settings"); return; }
    const subject = text.split("\n")[0].replace(/\*/g, "");
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text.replace(/\*/g, ""))}`;
    markSent.mutate({ id, via: "email" });
  }

  const addFromLowStock = (m: LowStockRow) => {
    const need = Math.max(0, Number(m.reorderLevel) * 2 - Number(m.currentQty));
    setLines((prev) => {
      const next = prev.filter((l) => l.description.trim() || parseFloat(l.qty) > 0);
      next.push({
        materialId: m.id,
        description: m.materialName,
        qty: need > 0 ? String(Math.ceil(need)) : "",
        unit: m.unit,
        ratePerUnit: m.ratePerUnit ? String(Number(m.ratePerUnit)) : "",
      });
      return next;
    });
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Raise an order, send it to the vendor on WhatsApp or email</p>
        </div>
        <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
          <Plus size={16} /> New PO
        </Button>
      </div>

      {/* Low stock → order suggestions */}
      {lowStock && lowStock.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-500" />
            <h3 className="font-bold text-sm">Running low — {lowStock.length} material{lowStock.length !== 1 ? "s" : ""}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((m) => (
              <button
                key={m.id}
                onClick={() => addFromLowStock(m)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-left hover:bg-muted transition-colors"
              >
                <p className="text-xs font-semibold">{m.materialName}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {Number(m.currentQty).toLocaleString("en-IN")} / {Number(m.reorderLevel).toLocaleString("en-IN")} {m.unit} · add to PO
                </p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* PO list */}
      <Card className="overflow-hidden">
        {!pos || pos.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <Package size={30} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No purchase orders yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pos.map((po) => (
              <div key={po.id} className="px-4 py-3 flex items-center gap-3 flex-wrap hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold font-mono text-sm">{po.poNumber}</span>
                    <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded", STATUS_STYLE[po.status] ?? STATUS_STYLE.draft)}>
                      {po.status}
                    </span>
                    {po.sentVia && (
                      <span className="text-[10px] text-muted-foreground">via {po.sentVia}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {po.vendorName ?? "—"} · {po.orderDate}
                    {po.expectedDate ? ` · expected ${po.expectedDate}` : ""}
                  </p>
                </div>
                <span className="font-bold tabular-nums text-sm">
                  ₹{Number(po.totalAmount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => sendWhatsApp(po.id)}
                    title="Send on WhatsApp"
                    className="rounded-lg border border-border p-1.5 hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-950/30 transition-colors"
                  >
                    <MessageCircle size={14} className="text-emerald-600" />
                  </button>
                  <button
                    onClick={() => sendEmail(po.id)}
                    title="Send by email"
                    className="rounded-lg border border-border p-1.5 hover:bg-blue-50 hover:border-blue-300 dark:hover:bg-blue-950/30 transition-colors"
                  >
                    <Mail size={14} className="text-blue-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create PO */}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="New Purchase Order">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Vendor *</Label>
              <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Select vendor…</option>
                {(vendors ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.vendorName}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">GST %</Label>
              <Input type="number" step="any" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Order date</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expected delivery</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Items</Label>
              <button
                type="button"
                onClick={() => setLines((p) => [...p, emptyLine()])}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <Plus size={12} /> Add line
              </button>
            </div>

            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={l.materialId ? String(l.materialId) : ""}
                    onChange={(e) => {
                      const id = e.target.value ? parseInt(e.target.value, 10) : null;
                      const m = (materials ?? []).find((x) => x.id === id);
                      setLines((p) => p.map((x, j) => j === i ? {
                        ...x,
                        materialId: id,
                        description: m?.materialName ?? x.description,
                        unit: m?.unit ?? x.unit,
                        ratePerUnit: m?.ratePerUnit ? String(Number(m.ratePerUnit)) : x.ratePerUnit,
                      } : x));
                    }}
                    className="flex-1"
                  >
                    <option value="">Free text / pick material…</option>
                    {(materials ?? []).map((m) => (
                      <option key={m.id} value={m.id}>{m.materialName}</option>
                    ))}
                  </Select>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                      className="rounded-lg border border-border p-1.5 hover:bg-rose-50 hover:border-rose-300 transition-colors"
                    >
                      <Trash2 size={13} className="text-rose-600" />
                    </button>
                  )}
                </div>
                <Input
                  placeholder="Description"
                  value={l.description}
                  onChange={(e) => setLines((p) => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Qty" type="number" step="any" value={l.qty}
                    onChange={(e) => setLines((p) => p.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                  <Input placeholder="Unit" value={l.unit}
                    onChange={(e) => setLines((p) => p.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                  <Input placeholder="Rate" type="number" step="any" value={l.ratePerUnit}
                    onChange={(e) => setLines((p) => p.map((x, j) => j === i ? { ...x, ratePerUnit: e.target.value } : x))} />
                </div>
                {(parseFloat(l.qty) > 0 && parseFloat(l.ratePerUnit) > 0) && (
                  <p className="text-[11px] text-muted-foreground text-right tabular-nums">
                    line total ₹{(parseFloat(l.qty) * parseFloat(l.ratePerUnit)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes to vendor</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. deliver before 5pm, gate 2" />
          </div>

          <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">₹{totals.sub.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GST {gstPercent}%</span><span className="tabular-nums">₹{totals.gst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between font-bold border-t border-border pt-1 mt-1"><span>Total</span><span className="tabular-nums">₹{totals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createPo.mutate()}
              disabled={!vendorId || createPo.isPending || !lines.some((l) => l.description.trim() && parseFloat(l.qty) > 0)}
            >
              {createPo.isPending ? "Creating…" : "Create PO"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
