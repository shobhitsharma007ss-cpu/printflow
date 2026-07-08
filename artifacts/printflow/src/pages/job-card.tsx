import React, { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import QRCode from "qrcode";
import { Printer, ArrowLeft } from "lucide-react";
import { useJob } from "@/hooks/use-jobs";
import { format } from "date-fns";

/* Printable A5 job card with QR (encodes "job:{id}").
   Route: /job-card/:id — fullscreen (outside AppLayout), print-friendly. */

export default function JobCard() {
  const [, params] = useRoute("/job-card/:id");
  const jobId = parseInt(params?.id ?? "0", 10);
  const { data: job, isLoading } = useJob(jobId);
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    if (!jobId) return;
    QRCode.toDataURL(`job:${jobId}`, { width: 220, margin: 1 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [jobId]);

  if (isLoading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!job) return <div className="min-h-screen grid place-items-center">Job not found</div>;

  return (
    <div className="min-h-screen bg-neutral-100 print:bg-white py-6 print:py-0">
      {/* toolbar — hidden on print */}
      <div className="max-w-[600px] mx-auto mb-4 flex items-center justify-between print:hidden px-2">
        <Link href="/jobs">
          <a className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
            <ArrowLeft size={16} /> Jobs
          </a>
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold shadow"
        >
          <Printer size={18} /> Print Card
        </button>
      </div>

      {/* the card */}
      <div className="max-w-[600px] mx-auto bg-white border border-neutral-300 print:border-0 rounded-xl print:rounded-none p-6 print:p-4 text-black">
        {/* header row */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">PrintFlow Job Card</p>
            <p className="text-5xl font-black tracking-tight mt-1">{job.jobCode}</p>
            <p className="text-lg font-semibold mt-1">{job.jobName}</p>
          </div>
          {qr && <img src={qr} alt="QR" className="w-[110px] h-[110px] shrink-0" />}
        </div>

        {/* info grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 py-4 text-[15px]">
          <Row k="Client / पार्टी" v={job.clientName} />
          <Row k="Date" v={job.scheduledDate ? format(new Date(job.scheduledDate), "dd MMM yyyy") : "—"} />
          <Row k="Material / कागज़" v={`${job.materialName ?? "—"}${job.materialGsm ? ` · ${job.materialGsm} GSM` : ""}`} />
          <Row k="Sheet size" v={job.materialDimensions ? `${job.materialDimensions}"` : "—"} />
          <Row k="Qty ordered" v={`${job.qtySheets.toLocaleString("en-IN")} sheets`} />
          <Row k="Planned (waste incl.)" v={`${(job.plannedSheets ?? job.qtySheets).toLocaleString("en-IN")} sheets`} />
          {job.coatingType && <Row k="Coating" v={job.coatingType} />}
          {job.materialGrain && <Row k="Grain" v={job.materialGrain === "long" ? "Long" : "Short"} />}
        </div>

        {/* routing steps */}
        {job.routing && job.routing.length > 0 && (
          <div className="border-t-2 border-black pt-3">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">
              Production Route / रूट
            </p>
            <div className="space-y-1.5">
              {job.routing.map((step, i) => (
                <div key={step.id} className="flex items-center gap-3 border border-neutral-300 rounded-lg px-3 py-2">
                  <span className="w-7 h-7 rounded-full bg-black text-white text-sm font-black grid place-items-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-bold text-[15px] flex-1">{step.machineName || `Machine ${step.machineId}`}</span>
                  <span className="text-xs text-neutral-500 w-28">Op: ____________</span>
                  <span className="text-xs text-neutral-500 w-24">Qty: ________</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-300 text-xs text-neutral-500">
          <span>Scan QR on station tablet to open this job · टैबलेट पर QR स्कैन करें</span>
          <span>job:{jobId}</span>
        </div>
      </div>

      <style>{`@media print { @page { size: A5 portrait; margin: 8mm; } }`}</style>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{k}</p>
      <p className="font-semibold">{v}</p>
    </div>
  );
}
