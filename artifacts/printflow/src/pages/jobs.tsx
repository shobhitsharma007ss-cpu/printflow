import React, { useState } from "react";
import { useJobs, useCreateJob, useUpdateJobStatus } from "@/hooks/use-jobs";
import { useMaterials } from "@/hooks/use-inventory";
import { useJobTemplates } from "@/hooks/use-templates";
import { Card, Button, Badge, Modal, Input, Label, Select } from "@/components/ui-elements";
import { format } from "date-fns";
import { Plus, Search, Filter, MoreVertical, ChevronRight, ArrowRight } from "lucide-react";
import { getStatusColor } from "@/lib/utils";

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: jobs, isLoading } = useJobs(statusFilter || undefined);
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Job Management</h1>
          <p className="text-muted-foreground mt-1">Track and schedule production orders</p>
        </div>
        <Button onClick={() => setIsNewJobOpen(true)} className="flex items-center gap-2 shadow-lg hover:shadow-primary/25">
          <Plus size={18} strokeWidth={3} />
          Create New Job
        </Button>
      </div>

      <Card className="overflow-hidden border border-border">
        <div className="p-4 border-b border-border bg-muted/30 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input className="pl-9 bg-background" placeholder="Search job code or client..." />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={16} className="text-muted-foreground" />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background w-full sm:w-40"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-bold">Job Code</th>
                <th className="px-6 py-4 font-bold">Client / Name</th>
                <th className="px-6 py-4 font-bold">Material Details</th>
                <th className="px-6 py-4 font-bold">Qty (Sheets)</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4 font-bold">Scheduled Date</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center"><div className="inline-block animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></td></tr>
              ) : jobs?.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No jobs found matching criteria.</td></tr>
              ) : (
                jobs?.map((job) => (
                  <tr key={job.id} className="bg-card border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground whitespace-nowrap">{job.jobCode}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold">{job.clientName}</div>
                      <div className="text-muted-foreground text-xs mt-0.5">{job.jobName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium">{job.materialName || 'Not specified'}</span>
                      {job.materialGsm && <span className="text-muted-foreground ml-1">({job.materialGsm} GSM)</span>}
                    </td>
                    <td className="px-6 py-4 font-mono font-medium">{job.qtySheets.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {job.scheduledDate ? format(new Date(job.scheduledDate), "dd MMM yyyy") : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors">
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <NewJobModal isOpen={isNewJobOpen} onClose={() => setIsNewJobOpen(false)} />
    </div>
  );
}

function NewJobModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: materials } = useMaterials();
  const { data: templates } = useJobTemplates();
  const createMutation = useCreateJob();

  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    clientName: '',
    jobName: '',
    materialId: '',
    qtySheets: '',
    templateId: '',
    scheduledDate: today,
  });

  const selectedTemplate = templates?.find(t => t.id === parseInt(form.templateId)) ?? null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        clientName: form.clientName,
        jobName: form.jobName,
        materialId: form.materialId ? parseInt(form.materialId) : undefined,
        materialGsm: form.materialId ? (materials?.find(m => m.id === parseInt(form.materialId))?.gsm ?? undefined) : undefined,
        qtySheets: parseInt(form.qtySheets) || 0,
        plannedSheets: Math.ceil((parseInt(form.qtySheets) || 0) * 1.04),
        templateId: form.templateId ? parseInt(form.templateId) : undefined,
        scheduledDate: form.scheduledDate || undefined,
      }
    }, {
      onSuccess: () => {
        onClose();
        setForm({ clientName: '', jobName: '', materialId: '', qtySheets: '', templateId: '', scheduledDate: today });
      }
    });
  };

  const handleClose = () => {
    onClose();
    setForm({ clientName: '', jobName: '', materialId: '', qtySheets: '', templateId: '', scheduledDate: today });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Production Job">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Client & Job Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Client Name <span className="text-destructive">*</span></Label>
            <Input
              required
              value={form.clientName}
              onChange={e => setForm({ ...form, clientName: e.target.value })}
              placeholder="e.g. Tiranga Packaging"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Job Name <span className="text-destructive">*</span></Label>
            <Input
              required
              value={form.jobName}
              onChange={e => setForm({ ...form, jobName: e.target.value })}
              placeholder="e.g. Carton Box 350gsm"
            />
          </div>
        </div>

        {/* Material & Qty */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Material</Label>
            <Select
              value={form.materialId}
              onChange={e => setForm({ ...form, materialId: e.target.value })}
            >
              <option value="">— No material selected —</option>
              {materials?.map(m => (
                <option key={m.id} value={m.id}>
                  {m.materialName}{m.gsm ? ` (${m.gsm}gsm)` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity (Sheets) <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              required
              min="1"
              value={form.qtySheets}
              onChange={e => setForm({ ...form, qtySheets: e.target.value })}
              placeholder="e.g. 5000"
            />
          </div>
        </div>

        {/* Template */}
        <div className="space-y-1.5">
          <Label>Job Template (Routing)</Label>
          <Select
            value={form.templateId}
            onChange={e => setForm({ ...form, templateId: e.target.value })}
          >
            <option value="">— Custom (no template) —</option>
            {templates?.map(t => (
              <option key={t.id} value={t.id}>{t.templateName}</option>
            ))}
          </Select>
        </div>

        {/* Template routing preview */}
        {selectedTemplate && (selectedTemplate as any).machineNames && (
          <div className="bg-muted/50 rounded-xl p-4 border border-border">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Routing Steps</p>
            <div className="flex flex-wrap items-center gap-2">
              {((selectedTemplate as any).machineNames as string[]).map((name: string, idx: number) => (
                <React.Fragment key={idx}>
                  <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-3 py-1.5 shadow-sm">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <span className="text-sm font-semibold">{name}</span>
                  </div>
                  {idx < (selectedTemplate as any).machineNames.length - 1 && (
                    <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
            {selectedTemplate.description && (
              <p className="text-xs text-muted-foreground mt-3">{selectedTemplate.description}</p>
            )}
          </div>
        )}

        {/* Scheduled Date */}
        <div className="space-y-1.5">
          <Label>Scheduled Date</Label>
          <Input
            type="date"
            value={form.scheduledDate}
            onChange={e => setForm({ ...form, scheduledDate: e.target.value })}
          />
        </div>

        {/* Planned sheets info */}
        {form.qtySheets && (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-400">
            Planned sheets (with 4% setup wastage): <strong>{Math.ceil(parseInt(form.qtySheets) * 1.04).toLocaleString()}</strong>
          </div>
        )}

        <div className="pt-2 flex justify-end gap-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Create Job</Button>
        </div>
      </form>
    </Modal>
  );
}
