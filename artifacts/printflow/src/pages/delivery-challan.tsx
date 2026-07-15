import React, { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Printer, ArrowLeft, Package, Truck } from "lucide-react";
import { useGetDispatch } from "@workspace/api-client-react";
import { format } from "date-fns";

export default function DeliveryChallan() {
  const [, params] = useRoute("/delivery-challan/:dispatchId");
  const dispatchId = parseInt(params?.dispatchId ?? "0", 10);
  const { data: dispatch, isLoading } = useGetDispatch(dispatchId);

  if (isLoading) return <div className="min-h-screen grid place-items-center text-black">Loading…</div>;
  if (!dispatch) return <div className="min-h-screen grid place-items-center text-black">Challan not found</div>;

  const challanNo = `CH-${String(dispatch.id).padStart(5, "0")}`;
  const dateStr = dispatch.dispatchDate
    ? format(new Date(dispatch.dispatchDate), "dd MMM yyyy")
    : format(new Date(dispatch.createdAt), "dd MMM yyyy");

  return (
    <div className="min-h-screen bg-neutral-100 print:bg-white py-6 print:py-0">
      {/* toolbar — hidden on print */}
      <div className="max-w-[700px] mx-auto mb-4 flex items-center justify-between print:hidden px-2">
        <Link href="/jobs">
          <a className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
            <ArrowLeft size={16} /> Jobs
          </a>
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold shadow"
        >
          <Printer size={18} /> Print Challan
        </button>
      </div>

      {/* Challan document */}
      <div className="max-w-[700px] mx-auto bg-white border border-neutral-300 print:border-0 rounded-xl print:rounded-none text-black">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b-2 border-black">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Delivery Challan</p>
            <p className="text-3xl font-black tracking-tight mt-1">PrintFlow</p>
            <p className="text-sm text-neutral-500 mt-0.5">Plant Management System</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500 uppercase tracking-wider">Challan No.</p>
            <p className="text-2xl font-black font-mono">{challanNo}</p>
            <p className="text-sm text-neutral-600 mt-1">{dateStr}</p>
          </div>
        </div>

        {/* Party / Job Info */}
        <div className="grid grid-cols-2 gap-6 p-6 border-b border-neutral-200">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Delivered To</p>
            <p className="text-lg font-black">{dispatch.clientName}</p>
            <p className="text-sm text-neutral-600 mt-0.5">— Client</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Job Reference</p>
            <p className="font-mono font-black text-lg">{dispatch.jobCode}</p>
            <p className="text-sm text-neutral-600 mt-0.5">{dispatch.jobName}</p>
          </div>
        </div>

        {/* Items table */}
        <div className="p-6 border-b border-neutral-200">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">Items Dispatched</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="pb-2 text-left font-bold text-neutral-500 text-xs uppercase">Description</th>
                <th className="pb-2 text-right font-bold text-neutral-500 text-xs uppercase">Qty (Sheets)</th>
                <th className="pb-2 text-right font-bold text-neutral-500 text-xs uppercase">Job Qty</th>
                <th className="pb-2 text-right font-bold text-neutral-500 text-xs uppercase">Total Dispatched</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-100">
                <td className="py-3 font-semibold">{dispatch.jobName}</td>
                <td className="py-3 text-right font-black text-xl font-mono">
                  {dispatch.dispatchQty.toLocaleString("en-IN")}
                </td>
                <td className="py-3 text-right text-neutral-500 font-mono">
                  {dispatch.qtySheets.toLocaleString("en-IN")}
                </td>
                <td className="py-3 text-right font-semibold font-mono">
                  {dispatch.totalDispatched.toLocaleString("en-IN")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Transport details */}
        {(dispatch.vehicleNumber || dispatch.lrNumber || dispatch.transporterName) && (
          <div className="p-6 border-b border-neutral-200">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">Transport Details</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {dispatch.vehicleNumber && (
                <div>
                  <p className="text-xs text-neutral-400 uppercase tracking-wider mb-0.5">Vehicle No.</p>
                  <p className="font-bold font-mono">{dispatch.vehicleNumber}</p>
                </div>
              )}
              {dispatch.lrNumber && (
                <div>
                  <p className="text-xs text-neutral-400 uppercase tracking-wider mb-0.5">LR No.</p>
                  <p className="font-bold font-mono">{dispatch.lrNumber}</p>
                </div>
              )}
              {dispatch.transporterName && (
                <div>
                  <p className="text-xs text-neutral-400 uppercase tracking-wider mb-0.5">Transporter</p>
                  <p className="font-bold">{dispatch.transporterName}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {dispatch.notes && (
          <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Notes</p>
            <p className="text-sm text-neutral-600">{dispatch.notes}</p>
          </div>
        )}

        {/* Signature row */}
        <div className="grid grid-cols-3 gap-6 p-6">
          <div>
            <div className="h-14 border-b border-neutral-400" />
            <p className="text-xs text-neutral-500 mt-1.5 text-center">Prepared By</p>
          </div>
          <div>
            <div className="h-14 border-b border-neutral-400" />
            <p className="text-xs text-neutral-500 mt-1.5 text-center">Checked By</p>
          </div>
          <div>
            <div className="h-14 border-b border-neutral-400" />
            <p className="text-xs text-neutral-500 mt-1.5 text-center">Receiver's Signature &amp; Stamp</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-4 text-[10px] text-neutral-400">
          <span>PrintFlow · {challanNo} · {dateStr}</span>
          <span>dispatch:{dispatch.id} · job:{dispatch.jobId}</span>
        </div>
      </div>

      <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } }`}</style>
    </div>
  );
}
