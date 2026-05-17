import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, jobsTable, jobRoutingTable, jobMaterialsTable, jobTemplatesTable, materialsTable, machinesTable, wastageLogTable, jobInterruptionsTable } from "@workspace/db";
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

type DeductionInfo = { materialId: number; materialName: string; qty: number; unit: string };

// ─── Machine speeds (sheets per hour) ────────────────────────────────────────
const MACHINE_SPEEDS: Record<string, number> = {
  "Komori LA37": 12000,
  "Komori GL37": 13000,
  "Planeta Super Variant": 5000,
  "Bobst Die Cutter 1": 8000,
  "Bobst Die Cutter 2": 8000,
  "Bobst Folder Gluer": 15000,
  "DGM Folder Gluer": 12000,
  "Hyong Jung Folder Gluer": 10000,
  "Single Coater": 6000,
  "Wohlenberg Cutter": 3000,
};

// OEE factor — realistic efficiency for Indian sheetfed packaging
const OEE: Record<string, number> = {
  "Komori LA37": 0.65,
  "Komori GL37": 0.65,
  "Bobst Die Cutter 1": 0.70,
  "Bobst Die Cutter 2": 0.70,
  "Bobst Folder Gluer": 0.60,
  "DGM Folder Gluer": 0.60,
  "Hyong Jung Folder Gluer": 0.60,
  "Single Coater": 0.65,
  "Wohlenberg Cutter": 0.80,
  "Planeta Super Variant": 0.55,
};

function calcEtaSeconds(sheets: number, machineName: string, makereadyMins = 30): number {
  const sph = MACHINE_SPEEDS[machineName] ?? 8000;
  const oee = OEE[machineName] ?? 0.65;
  const effectiveSph = sph * oee;
  const pressSeconds = (sheets / effectiveSph) * 3600;
  const makereadySeconds = makereadyMins * 60;
  return Math.round(pressSeconds + makereadySeconds);
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

async function canStartStep(jobId: number, prerequisiteCodes: string[]): Promise<{ canStart: boolean; waitingFor: string[] }> {
  if (!prerequisiteCodes || prerequisiteCodes.length === 0) {
    return { canStart: true, waitingFor: [] };
  }
  const prereqSteps = await db
    .select({ stepCode: jobRoutingTable.stepCode, status: jobRoutingTable.status })
    .from(jobRoutingTable)
    .where(eq(jobRoutingTable.jobId, jobId));
  const waitingFor: string[] = [];
  for (const code of prerequisiteCodes) {
    const step = prereqSteps.find(s => s.stepCode === code);
    if (!step || (step.status !== "completed" && step.status !== "skipped")) {
      waitingFor.push(code);
    }
  }
  return { canStart: waitingFor.length === 0, waitingFor };
}

async function deductJobMaterials(jobId: number): Promise<DeductionInfo[]> {
  const deductions: DeductionInfo[] = [];

  const jobMats = await db
    .select({ materialId: jobMaterialsTable.materialId, plannedQty: jobMaterialsTable.plannedQty })
    .from(jobMaterialsTable)
    .where(eq(jobMaterialsTable.jobId, jobId));

  const deductedMaterialIds = new Set<number>();

  for (const jm of jobMats) {
    const [mat] = await db.select().from(materialsTable).where(eq(materialsTable.id, jm.materialId));
    if (!mat) continue;
    const plannedQty = parseFloat(String(jm.plannedQty));
    const currentQty = parseFloat(String(mat.currentQty));
    const newQty = Math.max(0, currentQty - plannedQty);
    await db.update(materialsTable).set({ currentQty: String(newQty) }).where(eq(materialsTable.id, mat.id));
    deductions.push({ materialId: mat.id, materialName: mat.materialName, qty: plannedQty, unit: mat.unit });
    deductedMaterialIds.add(mat.id);
    if (newQty <= parseFloat(String(mat.minReorderQty))) {
      await createNotification({
        type: "low-stock",
        title: "Low Stock Alert",
        message: `${mat.materialName} is at ${newQty} ${mat.unit} (reorder level: ${mat.minReorderQty})`,
        relatedId: mat.id,
      });
    }
  }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (job?.materialId && job.qtySheets > 0 && !deductedMaterialIds.has(job.materialId)) {
    const [mat] = await db.select().from(materialsTable).where(eq(materialsTable.id, job.materialId));
    if (mat) {
      const currentQty = parseFloat(String(mat.currentQty));
      const newQty = Math.max(0, currentQty - job.qtySheets);
      await db.update(materialsTable).set({ currentQty: String(newQty) }).where(eq(materialsTable.id, mat.id));
      deductions.push({ materialId: mat.id, materialName: mat.materialName, qty: job.qtySheets, unit: mat.unit });
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

  return deductions;
}

async function buildJobWithDetails(jobId: number) {
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) return null;

  const routing = await db
    .select({
      id: jobRoutingTable.id,
      jobId: jobRoutingTable.jobId,
      stepNumber: jobRoutingTable.stepNumber,
      stepCode: jobRoutingTable.stepCode,
      machineId: jobRoutingTable.machineId,
      machineName: machinesTable.machineName,
      machineType: machinesTable.machineType,
      operatorName: jobRoutingTable.operatorName,
      status: jobRoutingTable.status,
      prerequisiteCodes: jobRoutingTable.prerequisiteCodes,
      startedAt: jobRoutingTable.startedAt,
      completedAt: jobRoutingTable.completedAt,
      pausedAt: jobRoutingTable.pausedAt,
      totalPausedSeconds: jobRoutingTable.totalPausedSeconds,
      estimatedMinutes: jobRoutingTable.estimatedMinutes,
      notes: jobRoutingTable.notes,
      speedPerHour: machinesTable.speedPerHour,
    })
    .from(jobRoutingTable)
    .leftJoin(machinesTable, eq(jobRoutingTable.machineId, machinesTable.id))
    .where(eq(jobRoutingTable.jobId, jobId))
    .orderBy(jobRoutingTable.stepNumber);

  const routingWithEta = await Promise.all(routing.map(async step => {
    const sheets = job.qtySheets ?? 0;
    const machineName = step.machineName ?? "";
    const etaSeconds = calcEtaSeconds(sheets, machineName);

    let elapsedSeconds = 0;
    let remainingSeconds = etaSeconds;

    if (step.startedAt) {
      const startTime = new Date(step.startedAt).getTime();
      const now = Date.now();
      const totalElapsed = Math.floor((now - startTime) / 1000);
      const pausedSecs = step.totalPausedSeconds ?? 0;
      elapsedSeconds = Math.max(0, totalElapsed - pausedSecs);
      remainingSeconds = Math.max(0, etaSeconds - elapsedSeconds);
    }

    // Check if this step can start
    const { canStart, waitingFor } = await canStartStep(jobId, step.prerequisiteCodes ?? []);

    return {
      ...step,
      etaSeconds,
      etaFormatted: formatEta(etaSeconds),
      elapsedSeconds,
      remainingSeconds,
      remainingFormatted: formatEta(remainingSeconds),
      canStart,
      waitingFor,
    };
  }));

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

  const wastageLogs = await db
    .select({
      id: wastageLogTable.id,
      jobId: wastageLogTable.jobId,
      materialId: wastageLogTable.materialId,
      materialName: materialsTable.materialName,
      plannedQty: wastageLogTable.plannedQty,
      actualQty: wastageLogTable.actualQty,
      wastageQty: wastageLogTable.wastageQty,
      wastagePct: wastageLogTable.wastagePct,
      reason: wastageLogTable.reason,
      notes: wastageLogTable.notes,
      loggedAt: wastageLogTable.loggedAt,
    })
    .from(wastageLogTable)
    .leftJoin(materialsTable, eq(wastageLogTable.materialId, materialsTable.id))
    .where(eq(wastageLogTable.jobId, jobId))
    .orderBy(wastageLogTable.loggedAt);

  const material = job.materialId
    ? await db.select().from(materialsTable).where(eq(materialsTable.id, job.materialId)).then(r => r[0])
    : null;

  return {
    ...job,
    materialName: material?.materialName ?? null,
    materialDimensions: material?.dimensions ?? null,
    materialGrain: material?.grain ?? null,
    routing: routingWithEta,
    materials,
    wastageLogs,
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

// ─── Routes ───────────────────────────────────────────────────────────────────

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
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const jobCode = await getNextJobCode();
  const { customRouting, materials: jobMats, templateId, coatingType, finishRequirements, ...jobData } = parsed.data;

  const [job] = await db.insert(jobsTable).values({
    ...jobData,
    jobCode,
    templateId: templateId ?? null,
    coatingType: coatingType ?? null,
    finishRequirements: finishRequirements ?? [],
    status: "pending",
  }).returning();

  let routingMachineIds: number[] = [];
  let templateStepMinutes: number[] = [];
  if (templateId) {
    const [template] = await db.select().from(jobTemplatesTable).where(eq(jobTemplatesTable.id, templateId));
    if (template) {
      routingMachineIds = template.routingSteps;
      templateStepMinutes = template.stepEstimatesMinutes ?? [];
    }
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
      estimatedMinutes: templateStepMinutes[i] ?? 0,
    });
  }

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
    }
  }

  const result = await buildJobWithDetails(job.id);
  res.status(201).json(result);
});

router.get("/jobs/:id", async (req, res): Promise<void> => {
  const params = GetJobParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const result = await buildJobWithDetails(params.data.id);
  if (!result) { res.status(404).json({ error: "Job not found" }); return; }
  res.json(result);
});

router.put("/jobs/:id", async (req, res): Promise<void> => {
  const params = UpdateJobParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

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
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  const result = await buildJobWithDetails(job.id);
  res.json(result);
});

router.patch("/jobs/:id/status", async (req, res): Promise<void> => {
  const params = UpdateJobStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateJobStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [currentJob] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.id));
  if (!currentJob) { res.status(404).json({ error: "Job not found" }); return; }

  const [job] = await db.update(jobsTable).set({ status: parsed.data.status }).where(eq(jobsTable.id, params.data.id)).returning();

  if (parsed.data.status === "completed" || parsed.data.status === "on-hold") {
    const routing = await db.select().from(jobRoutingTable).where(eq(jobRoutingTable.jobId, job.id));
    for (const step of routing) {
      await db.update(machinesTable).set({ status: "idle" }).where(eq(machinesTable.id, step.machineId));
    }
  }

  let deductions: DeductionInfo[] = [];
  if (parsed.data.status === "in-progress" && currentJob.status === "pending") {
    deductions = await deductJobMaterials(job.id);
  }

  const result = await buildJobWithDetails(job.id);
  res.json({ ...result, deductions: deductions.length > 0 ? deductions : null });
});

router.patch("/job-routing/:id/status", async (req, res): Promise<void> => {
  const params = UpdateJobRoutingStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateJobRoutingStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [currentRouting] = await db.select().from(jobRoutingTable).where(eq(jobRoutingTable.id, params.data.id));
  if (!currentRouting) { res.status(404).json({ error: "Routing step not found" }); return; }

  if (parsed.data.status === "in-progress") {
    const { canStart, waitingFor } = await canStartStep(currentRouting.jobId, currentRouting.prerequisiteCodes ?? []);
    if (!canStart) {
      res.status(409).json({ error: `Cannot start — waiting for: ${waitingFor.join(", ")}`, waitingFor });
      return;
    }
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

  const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, routing.machineId));
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, routing.jobId));

  let deductions: DeductionInfo[] = [];

  if (parsed.data.status === "in-progress") {
    await db.update(machinesTable).set({ status: "running" }).where(eq(machinesTable.id, routing.machineId));
    if (job && job.status === "pending") {
      await db.update(jobsTable).set({ status: "in-progress" }).where(eq(jobsTable.id, job.id));
      deductions = await deductJobMaterials(job.id);
    }
    await createNotification({
      type: "step-started",
      title: "Step Started",
      message: `${job?.jobCode ?? ''} — ${routing.stepCode} started on ${machine?.machineName ?? 'Unknown'}`,
      relatedId: routing.jobId,
    });
  }

  if (parsed.data.status === "completed") {
    await db.update(machinesTable).set({ status: "idle" }).where(eq(machinesTable.id, routing.machineId));

    const allSteps = await db.select().from(jobRoutingTable).where(eq(jobRoutingTable.jobId, routing.jobId));
    const allDone = allSteps.every(s => s.id === routing.id ? true : s.status === "completed");

    if (allDone && job) {
      await db.update(jobsTable).set({ status: "completed" }).where(eq(jobsTable.id, job.id));
      await createNotification({
        type: "job-completed",
        title: "Job Completed",
        message: `${job.jobCode} — ${job.jobName} completed`,
        relatedId: job.id,
      });
    } else {
      // ─── Unlock next steps whose prerequisites are now met ────────────
      // DO NOT auto-start. Just mark them as "ready" so they appear in queue.
      for (const step of allSteps) {
        if (step.status === "pending" && step.id !== routing.id) {
          const { canStart } = await canStartStep(routing.jobId, step.prerequisiteCodes ?? []);
          if (canStart) {
            await db.update(jobRoutingTable)
              .set({ status: "ready" })
              .where(eq(jobRoutingTable.id, step.id));
          }
        }
      }

      await createNotification({
        type: "step-completed",
        title: "Step Complete",
        message: `${job?.jobCode ?? ''} — ${routing.stepCode} done on ${machine?.machineName ?? 'Unknown'}`,
        relatedId: routing.jobId,
      });
      for (const step of allSteps) {
        if (step.status === "pending" && step.id !== routing.id) {
          const { canStart } = await canStartStep(routing.jobId, step.prerequisiteCodes ?? []);
          if (canStart) {
            await db.update(jobRoutingTable).set({ status: "ready" }).where(eq(jobRoutingTable.id, step.id));
          }
        }
      }
    }
  }

  res.json({
    ...routing,
    machineName: machine?.machineName ?? null,
    machineType: machine?.machineType ?? null,
    operatorName: routing.operatorName ?? machine?.operatorName ?? null,
    deductions: deductions.length > 0 ? deductions : null,
  });
});

// ─── PAUSE endpoint ───────────────────────────────────────────────────────────
router.patch("/job-routing/:id/pause", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { reason, notes } = req.body as { reason?: string; notes?: string };
  if (!reason || typeof reason !== "string") {
    res.status(400).json({ error: "reason is required" });
    return;
  }

  const [routing] = await db.select().from(jobRoutingTable).where(eq(jobRoutingTable.id, id));
  if (!routing) { res.status(404).json({ error: "Routing step not found" }); return; }
  if (routing.status !== "in-progress") {
    res.status(400).json({ error: "Can only pause an in-progress step" });
    return;
  }

  const now = new Date().toISOString();
  const [updated] = await db
    .update(jobRoutingTable)
    .set({ status: "paused", pausedAt: now })
    .where(eq(jobRoutingTable.id, id))
    .returning();

  await db.update(machinesTable).set({ status: "idle" }).where(eq(machinesTable.id, routing.machineId));

  await db.insert(jobInterruptionsTable).values({
    jobRoutingId: routing.id,
    jobId: routing.jobId,
    machineId: routing.machineId,
    reason,
    notes: notes ?? null,
  });

  const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, routing.machineId));

  await createNotification({
    type: "step-started",
    title: "Machine Paused",
    message: `${machine?.machineName ?? 'Machine'} paused — ${reason.replace(/-/g, ' ')}`,
    relatedId: routing.jobId,
  });

  res.json({ ...updated, machineName: machine?.machineName ?? null });
});

// ─── RESUME endpoint ──────────────────────────────────────────────────────────
router.patch("/job-routing/:id/resume", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [routing] = await db.select().from(jobRoutingTable).where(eq(jobRoutingTable.id, id));
  if (!routing) { res.status(404).json({ error: "Routing step not found" }); return; }
  if (routing.status !== "paused") {
    res.status(400).json({ error: "Can only resume a paused step" });
    return;
  }

  const now = new Date();
  const pausedAt = routing.pausedAt ? new Date(routing.pausedAt) : now;
  const pauseDurationSeconds = Math.floor((now.getTime() - pausedAt.getTime()) / 1000);
  const newTotalPaused = (routing.totalPausedSeconds ?? 0) + pauseDurationSeconds;

  const openInterruptions = await db
    .select()
    .from(jobInterruptionsTable)
    .where(and(
      eq(jobInterruptionsTable.jobRoutingId, routing.id),
      eq(jobInterruptionsTable.jobId, routing.jobId)
    ));

  const openInterruption = openInterruptions.find(i => !i.endedAt);
  if (openInterruption) {
    await db
      .update(jobInterruptionsTable)
      .set({ endedAt: now, durationSeconds: pauseDurationSeconds })
      .where(eq(jobInterruptionsTable.id, openInterruption.id));
  }

  const [updated] = await db
    .update(jobRoutingTable)
    .set({ status: "in-progress", pausedAt: null, totalPausedSeconds: newTotalPaused })
    .where(eq(jobRoutingTable.id, id))
    .returning();

  await db.update(machinesTable).set({ status: "running" }).where(eq(machinesTable.id, routing.machineId));

  const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, routing.machineId));

  await createNotification({
    type: "step-started",
    title: "Machine Resumed",
    message: `${machine?.machineName ?? 'Machine'} resumed after ${Math.round(pauseDurationSeconds / 60)}m pause`,
    relatedId: routing.jobId,
  });

  res.json({ ...updated, machineName: machine?.machineName ?? null, pauseDurationSeconds });
});

// ─── GET interruptions ────────────────────────────────────────────────────────
router.get("/job-routing/:id/interruptions", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select()
    .from(jobInterruptionsTable)
    .where(eq(jobInterruptionsTable.jobRoutingId, id))
    .orderBy(jobInterruptionsTable.startedAt);
  res.json(rows);
});

// ─── Check if step can start ──────────────────────────────────────────────────
router.get("/job-routing/:id/can-start", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [routing] = await db.select().from(jobRoutingTable).where(eq(jobRoutingTable.id, id));
  if (!routing) { res.status(404).json({ error: "Routing step not found" }); return; }
  const result = await canStartStep(routing.jobId, routing.prerequisiteCodes ?? []);
  res.json(result);
});

router.patch("/job-routing/:id/notes", async (req, res): Promise<void> => {
  const params = UpdateJobRoutingNotesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateJobRoutingNotesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [routing] = await db
    .update(jobRoutingTable)
    .set({ notes: parsed.data.notes })
    .where(eq(jobRoutingTable.id, params.data.id))
    .returning();

  if (!routing) { res.status(404).json({ error: "Routing step not found" }); return; }
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
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
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
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = AddJobMaterialBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
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
      notes: wastageLogTable.notes,
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
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [job] = await db.select({ status: jobsTable.status }).from(jobsTable).where(eq(jobsTable.id, parsed.data.jobId)).limit(1);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  if (job.status !== "completed") { res.status(409).json({ error: "Wastage can only be logged for completed jobs" }); return; }

  const wastageQty = Math.max(0, parsed.data.actualQty - parsed.data.plannedQty);
  const wastagePct = parsed.data.plannedQty > 0 ? (wastageQty / parsed.data.plannedQty) * 100 : 0;

  const [row] = await db.insert(wastageLogTable).values({
    jobId: parsed.data.jobId,
    materialId: parsed.data.materialId,
    plannedQty: String(parsed.data.plannedQty),
    actualQty: String(parsed.data.actualQty),
    wastageQty: String(wastageQty.toFixed(2)),
    wastagePct: String(wastagePct.toFixed(2)),
    reason: parsed.data.reason,
    notes: parsed.data.notes ?? null,
  }).returning();

  res.status(201).json(row);
});

export default router;
