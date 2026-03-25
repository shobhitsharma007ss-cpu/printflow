import React, { useState } from "react";
import { useJobs, useCreateJob, useUpdateJobStatus } from "@/hooks/use-jobs";
import { Card, Button, Badge, Modal, Input, Label, Select } from "@/components/ui-elements";
import { format } from "date-fns";
import { Plus, Search, Filter, MoreVertical } from "lucide-react";
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
                <th className="px-6 py-4 font-bold">Date</th>
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
                    <td className="px-6 py-4 font-bold text-foreground">{job.jobCode}</td>
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
                    <td className="px-6 py-4 text-muted-foreground">
                      {job.createdAt ? format(new Date(job.createdAt), "MMM d, yyyy") : '-'}
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

function NewJobModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [formData, setFormData] = useState({
    jobName: '',
    clientName: '',
    qtySheets: '',
  });
  
  const createMutation = useCreateJob();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        jobName: formData.jobName,
        clientName: formData.clientName,
        qtySheets: parseInt(formData.qtySheets) || 0
      }
    }, {
      onSuccess: () => onClose()
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Production Job">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label>Client Name <span className="text-destructive">*</span></Label>
            <Input required value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} placeholder="e.g. Acme Corp" />
          </div>
          <div className="space-y-2">
            <Label>Job Name <span className="text-destructive">*</span></Label>
            <Input required value={formData.jobName} onChange={e => setFormData({...formData, jobName: e.target.value})} placeholder="e.g. Product Boxes" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Target Quantity (Sheets) <span className="text-destructive">*</span></Label>
          <Input type="number" required min="1" value={formData.qtySheets} onChange={e => setFormData({...formData, qtySheets: e.target.value})} placeholder="10000" />
        </div>
        
        <div className="bg-muted p-4 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-2"><span className="font-bold text-foreground">Note:</span> Material selection and routing template can be assigned after creation from the Job Details page.</p>
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-border mt-6">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Create Job</Button>
        </div>
      </form>
    </Modal>
  );
}
