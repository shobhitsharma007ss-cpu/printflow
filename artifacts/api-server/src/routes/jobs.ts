import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, jobsTable, jobRoutingTable, jobMaterialsTable, jobTemplatesTable, materialsTable, machinesTable, wastageLogTable } from "@workspace/db";
import {
  CreateJobBody,
  UpdateJobBody,
  GetJobParams,
  UpdateJobParams,
  UpdateJobStatusParams,
  UpdateJobStatusBody,
  UpdateJobRoutingStatusParams,
  UpdateJobRoutingStatusBody,
  UpdateJobRoutingNotesParams,
  UpdateJobRoutingNotesBody,
  GetJobMaterialsParams,
  AddJobMaterialParams,
  AddJobMaterialBody,
  ListJobsQueryParams,
  ListWastageLogsQueryParams,
  CreateWastageLogBody,
} from "@workspace/api-zod";
import { createNotification } from "./notifications";

const router: IRouter = Router();

async function buildJobWithDetails(jobId: number) {
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) return null;

  const routing = await db
    .select({
      id: jobRoutingTable.id,
      jobId: jobRoutingTable.jobId,
      stepNumber: jobRoutingTable.stepNumber,
      machineId: jobRoutingTable.machineId,
      machineName: machinesTable.machineName,
      machineType: machinesTable.machineType,
      operatorName: jobRoutingTable.operatorName,
      status: jobRoutingTable.status,
      startedAt: jobRoutingTable.startedAt,
      completedAt: jobRoutingTable.completedAt,
      notes: jobRoutingTable.notes,
    })
    .from(jobRoutingTable)
    .leftJoin(machinesTable, eq(jobRoutingTable.machineId, machinesTable.id))
    .where(eq(jobRoutingTable.jobId, jobId))
    .orderBy(jobRoutingTable.stepNumber);

  const materials = await db
    .select({
      id: jobMaterialsTable.id,
      jobId: jobMaterialsTable.jobId,
      materialId: jobMaterialsTable.materialId,
      materialName: materialsTable.materialName,
      plannedQty: jobMaterialsTable.plannedQty,
      actualQty: jobMaterialsTable.actualQty,
      unit: jobMaterialsTable.unit,
      costPerUnit: jobMaterialsTable.costPerUnit,
    })
    .from(jobMaterialsTable)
    .leftJoin(materialsTable, eq(jobMaterialsTable.materialId, materialsTable.id))
    .where(eq(jobMaterialsTable.jobId, jobId));

  const material = job.materialId
    ? await db.select().from(materialsTable).where(eq(materialsTable.id, job.materialId)).then(r => r[0])
    : null;

  return {
    ...job,
    materialName: material?.materialName ?? null,
    routing,
    materials,
  };
}

async function getNextJobCode(): Promise<string> {
  const jobs = await db.select({ jobCode: jobsTable.jobCode }).from(jobsTable).orderBy(jobsTable.id);
  let max = 0;
  for (const job of jobs) {
    const match = job.jobCode.match(/PF-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return `PF-${String(max + 1).padStart(3, "0")}`;
}

router.get("/jobs", async (req, res): Promise<void> => {
  const queryParams = ListJobsQueryParams.safeParse(req.query);
  const jobs = await db.select().from(jobsTable).orderBy(jobsTable.createdAt);

  const filtered = queryParams.success && queryParams.data.status
    ? jobs.filter(j => j.status === queryParams.data.status)
    : jobs;

  const result = await Promise.all(filtered.map(j => buildJobWithDetails(j.id)));
  res.json(result.filter(Boolean));
});

router.post("/jobs", async (req, res): Promise<void> => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const jobCode = await getNextJobCode();
  const { customRouting, materials: jobMats, templateId, ...jobData } = parsed.data;

  const [job] = await db.insert(jobsTable).values({
    ...jobData,
    jobCode,
    templateId: templateId ?? null,
    status: "pending",
  }).returning();

  // Determine routing steps
  let routingMachineIds: number[] = [];
  if (templateId) {
    const [template] = await db.select().from(jobTemplatesTable).where(eq(jobTemplatesTable.id, templateId));
    if (template) routingMachineIds = template.routingSteps;
  } else if (customRouting && customRouting.length > 0) {
    routingMachineIds = customRouting;
  }

  for (let i = 0; i < routingMachineIds.length; i++) {
    const machineId = routingMachineIds[i];
    const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, machineId));
    await db.insert(jobRoutingTable).values({
      jobId: job.id,
      stepNumber: i + 1,
      machineId,
      operatorName: machine?.operatorName ?? null,
      status: "pending",
    });
  }

  // Add job materials
  if (jobMats && jobMats.length > 0) {
    for (const mat of jobMats) {
      await db.insert(jobMaterialsTable).values({
        jobId: job.id,
        materialId: mat.materialId,
        plannedQty: String(mat.plannedQty),
        actualQty: mat.actualQty != null ? String(mat.actualQty) : null,
        unit: mat.unit,
        costPerUnit: mat.costPerUnit != null ? String(mat.costPerUnit) : null,
      });

      // Deduct from stock
      const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, mat.materialId));
      if (material) {
        const newQty = Math.max(0, parseFloat(String(material.currentQty)) - mat.plannedQty);
        await db.update(materialsTable).set({ currentQty: String(newQty) }).where(eq(materialsTable.id, mat.materialId));
      }
    }
  }

  const result = await buildJobWithDetails(job.id);
  res.status(201).json(result);
});

router.get("/jobs/:id", async (req, res): Promise<void> => {
  const params = GetJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await buildJobWithDetails(params.data.id);
  if (!result) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(result);
});

router.put("/jobs/:id", async (req, res): Promise<void> => {
  const params = UpdateJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.jobName !== undefined) updates.jobName = parsed.data.jobName;
  if (parsed.data.clientName !== undefined) updates.clientName = parsed.data.clientName;
  if (parsed.data.materialId !== undefined) updates.materialId = parsed.data.materialId;
  if (parsed.data.materialGsm !== undefined) updates.materialGsm = parsed.data.materialGsm;
  if (parsed.data.qtySheets !== undefined) updates.qtySheets = parsed.data.qtySheets;
  if (parsed.data.plannedSheets !== undefined) updates.plannedSheets = parsed.data.plannedSheets;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.scheduledDate !== undefined) updates.scheduledDate = parsed.data.scheduledDate;

  const [job] = await db.update(jobsTable).set(updates).where(eq(jobsTable.id, params.data.id)).returning();
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const result = await buildJobWithDetails(job.id);
  res.json(result);
});

router.patch("/jobs/:id/status", async (req, res): Promise<void> => {
  const params = UpdateJobStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateJobStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [currentJob] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.id));
  if (!currentJob) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const [job] = await db.update(jobsTable).set({ status: parsed.data.status }).where(eq(jobsTable.id, params.data.id)).returning();

  // Update machine status based on job status
  if (parsed.data.status === "in-progress") {
    const routing = await db.select().from(jobRoutingTable).where(eq(jobRoutingTable.jobId, job.id));
    for (const step of routing) {
      await db.update(machinesTable).set({ status: "running" }).where(eq(machinesTable.id, step.machineId));
    }
  } else if (parsed.data.status === "completed" || parsed.data.status === "on-hold") {
    const routing = await db.select().from(jobRoutingTable).where(eq(jobRoutingTable.jobId, job.id));
    for (const step of routing) {
      await db.update(machinesTable).set({ status: "idle" }).where(eq(machinesTable.id, step.machineId));
    }
  }

  // Auto-deduct primary material when job goes from pending → in-progress
  const deductions: { materialId: number; materialName: string; qty: number; unit: string }[] = [];
  if (parsed.data.status === "in-progress" && currentJob.status === "pending" && currentJob.materialId && currentJob.qtySheets > 0) {
    const [mat] = await db.select().from(materialsTable).where(eq(materialsTable.id, currentJob.materialId));
    if (mat) {
      const currentQty = parseFloat(String(mat.currentQty));
      const deductQty = currentJob.qtySheets;
      const newQty = Math.max(0, currentQty - deductQty);
      await db.update(materialsTable).set({ currentQty: String(newQty) }).where(eq(materialsTable.id, mat.id));
      deductions.push({ materialId: mat.id, materialName: mat.materialName, qty: deductQty, unit: mat.unit });

      // Low-stock alert if needed
      if (newQty <= parseFloat(String(mat.minReorderQty))) {
        await createNotification({
          type: "low-stock",
          title: "Low Stock Alert",
          message: `${mat.materialName} is at ${newQty} ${mat.unit} (reorder level: ${mat.minReorderQty})`,
          relatedId: mat.id,
        });
      }
    }
  }

  const result = await buildJobWithDetails(job.id);
  res.json({ ...result, deductions: deductions.length > 0 ? deductions : null });
});

router.patch("/job-routing/:id/status", async (req, res): Promise<void> => {
  const params = UpdateJobRoutingStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateJobRoutingStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.notes) updates.notes = parsed.data.notes;
  if (parsed.data.status === "in-progress") updates.startedAt = new Date().toISOString();
  if (parsed.data.status === "completed") updates.completedAt = new Date().toISOString();

  const [routing] = await db
    .update(jobRoutingTable)
    .set(updates)
    .where(eq(jobRoutingTable.id, params.data.id))
    .returning();

  if (!routing) {
    res.status(404).json({ error: "Routing step not found" });
    return;
  }

  const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, routing.machineId));
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, routing.jobId));

  if (parsed.data.status === "in-progress") {
    await db.update(machinesTable).set({ status: "running" }).where(eq(machinesTable.id, routing.machineId));
    if (job && job.status === "pending") {
      await db.update(jobsTable).set({ status: "in-progress" }).where(eq(jobsTable.id, job.id));
    }
    await createNotification({
      type: "step-started",
      title: "Step Started",
      message: `${job?.jobCode ?? ''} — Step ${routing.stepNumber} started on ${machine?.machineName ?? 'Unknown'}`,
      relatedId: routing.jobId,
    });
  }

  if (parsed.data.status === "completed") {
    await db.update(machinesTable).set({ status: "idle" }).where(eq(machinesTable.id, routing.machineId));

    const allSteps = await db.select().from(jobRoutingTable).where(eq(jobRoutingTable.jobId, routing.jobId));
    const allDone = allSteps.every(s => s.id === routing.id ? true : s.status === "completed");

    if (allDone && job) {
      await db.update(jobsTable).set({ status: "completed" }).where(eq(jobsTable.id, job.id));

      const jobMats = await db.select().from(jobMaterialsTable).where(eq(jobMaterialsTable.jobId, job.id));
      for (const jm of jobMats) {
        const [mat] = await db.select().from(materialsTable).where(eq(materialsTable.id, jm.materialId));
        if (mat) {
          const currentQty = parseFloat(String(mat.currentQty));
          const minQty = parseFloat(String(mat.minReorderQty));
          if (currentQty <= minQty) {
            await createNotification({
              type: "low-stock",
              title: "Low Stock Alert",
              message: `${mat.materialName} is at ${currentQty} ${mat.unit} (reorder level: ${minQty})`,
              relatedId: mat.id,
            });
          }
        }
      }

      await createNotification({
        type: "job-completed",
        title: "Job Completed",
        message: `${job.jobCode} — ${job.jobName} has been completed`,
        relatedId: job.id,
      });
    } else {
      await createNotification({
        type: "step-completed",
        title: "Step Completed",
        message: `${job?.jobCode ?? ''} — Step ${routing.stepNumber} completed on ${machine?.machineName ?? 'Unknown'}`,
        relatedId: routing.jobId,
      });

      const nextStep = allSteps.find(s => s.stepNumber === routing.stepNumber + 1);
      if (nextStep && nextStep.status === "pending") {
        await db.update(jobRoutingTable).set({ status: "in-progress", startedAt: new Date().toISOString() }).where(eq(jobRoutingTable.id, nextStep.id));
        await db.update(machinesTable).set({ status: "running" }).where(eq(machinesTable.id, nextStep.machineId));
      }
    }
  }

  res.json({
    ...routing,
    machineName: machine?.machineName ?? null,
    machineType: machine?.machineType ?? null,
    operatorName: routing.operatorName ?? machine?.operatorName ?? null,
  });
});

router.patch("/job-routing/:id/notes", async (req, res): Promise<void> => {
  const params = UpdateJobRoutingNotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateJobRoutingNotesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [routing] = await db
    .update(jobRoutingTable)
    .set({ notes: parsed.data.notes })
    .where(eq(jobRoutingTable.id, params.data.id))
    .returning();

  if (!routing) {
    res.status(404).json({ error: "Routing step not found" });
    return;
  }

  const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, routing.machineId));

  res.json({
    ...routing,
    machineName: machine?.machineName ?? null,
    machineType: machine?.machineType ?? null,
    operatorName: routing.operatorName ?? machine?.operatorName ?? null,
  });
});

router.get("/jobs/:id/materials", async (req, res): Promise<void> => {
  const params = GetJobMaterialsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select({
      id: jobMaterialsTable.id,
      jobId: jobMaterialsTable.jobId,
      materialId: jobMaterialsTable.materialId,
      materialName: materialsTable.materialName,
      plannedQty: jobMaterialsTable.plannedQty,
      actualQty: jobMaterialsTable.actualQty,
      unit: jobMaterialsTable.unit,
      costPerUnit: jobMaterialsTable.costPerUnit,
    })
    .from(jobMaterialsTable)
    .leftJoin(materialsTable, eq(jobMaterialsTable.materialId, materialsTable.id))
    .where(eq(jobMaterialsTable.jobId, params.data.id));
  res.json(rows);
});

router.post("/jobs/:id/materials", async (req, res): Promise<void> => {
  const params = AddJobMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddJobMaterialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(jobMaterialsTable).values({
    jobId: params.data.id,
    materialId: parsed.data.materialId,
    plannedQty: String(parsed.data.plannedQty),
    actualQty: parsed.data.actualQty != null ? String(parsed.data.actualQty) : null,
    unit: parsed.data.unit,
    costPerUnit: parsed.data.costPerUnit != null ? String(parsed.data.costPerUnit) : null,
  }).returning();
  res.status(201).json(row);
});

// Wastage log routes also live here
router.get("/wastage-log", async (req, res): Promise<void> => {
  const queryParams = ListWastageLogsQueryParams.safeParse(req.query);
  const rows = await db
    .select({
      id: wastageLogTable.id,
      jobId: wastageLogTable.jobId,
      jobCode: jobsTable.jobCode,
      materialId: wastageLogTable.materialId,
      materialName: materialsTable.materialName,
      plannedQty: wastageLogTable.plannedQty,
      actualQty: wastageLogTable.actualQty,
      wastageQty: wastageLogTable.wastageQty,
      wastagePct: wastageLogTable.wastagePct,
      reason: wastageLogTable.reason,
      loggedAt: wastageLogTable.loggedAt,
    })
    .from(wastageLogTable)
    .leftJoin(jobsTable, eq(wastageLogTable.jobId, jobsTable.id))
    .leftJoin(materialsTable, eq(wastageLogTable.materialId, materialsTable.id))
    .orderBy(wastageLogTable.loggedAt);

  const filtered = queryParams.success && queryParams.data.jobId
    ? rows.filter(r => r.jobId === queryParams.data.jobId)
    : rows;

  res.json(filtered);
});

router.post("/wastage-log", async (req, res): Promise<void> => {
  const parsed = CreateWastageLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const wastageQty = parsed.data.actualQty - parsed.data.plannedQty;
  const wastagePct = parsed.data.plannedQty > 0 ? (wastageQty / parsed.data.plannedQty) * 100 : 0;

  const [row] = await db.insert(wastageLogTable).values({
    jobId: parsed.data.jobId,
    materialId: parsed.data.materialId,
    plannedQty: String(parsed.data.plannedQty),
    actualQty: String(parsed.data.actualQty),
    wastageQty: String(Math.abs(wastageQty)),
    wastagePct: String(Math.abs(wastagePct).toFixed(2)),
    reason: parsed.data.reason,
  }).returning();

  res.status(201).json(row);
});

export default router;
