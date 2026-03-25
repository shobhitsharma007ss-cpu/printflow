import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, wastageLogTable, jobsTable, materialsTable, jobMaterialsTable } from "@workspace/db";
import { GetJobCostReportParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/reports/wastage", async (_req, res): Promise<void> => {
  // Fetch all wastage logs with job and material info
  const rows = await db
    .select({
      jobId: wastageLogTable.jobId,
      jobCode: jobsTable.jobCode,
      jobName: jobsTable.jobName,
      clientName: jobsTable.clientName,
      plannedQty: wastageLogTable.plannedQty,
      actualQty: wastageLogTable.actualQty,
      wastageQty: wastageLogTable.wastageQty,
      wastagePct: wastageLogTable.wastagePct,
      reason: wastageLogTable.reason,
      materialName: materialsTable.materialName,
    })
    .from(wastageLogTable)
    .leftJoin(jobsTable, eq(wastageLogTable.jobId, jobsTable.id))
    .leftJoin(materialsTable, eq(wastageLogTable.materialId, materialsTable.id))
    .orderBy(wastageLogTable.loggedAt);

  // Group by jobId and aggregate per job
  const grouped = new Map<number, {
    jobId: number;
    jobCode: string;
    jobName: string;
    clientName: string;
    totalWastageQty: number;
    totalPlannedQty: number;
    avgWastagePct: number;
    maxWastagePct: number;
    logs: typeof rows;
  }>();

  for (const row of rows) {
    if (!row.jobId) continue;
    const key = row.jobId;
    const existing = grouped.get(key);
    const wpct = parseFloat(String(row.wastagePct ?? 0));
    const wqty = parseFloat(String(row.wastageQty ?? 0));
    const pqty = parseFloat(String(row.plannedQty ?? 0));

    if (existing) {
      existing.logs.push(row);
      existing.totalWastageQty += wqty;
      existing.totalPlannedQty += pqty;
      existing.maxWastagePct = Math.max(existing.maxWastagePct, wpct);
    } else {
      grouped.set(key, {
        jobId: row.jobId,
        jobCode: row.jobCode ?? `Job ${row.jobId}`,
        jobName: row.jobName ?? '',
        clientName: row.clientName ?? '',
        totalWastageQty: wqty,
        totalPlannedQty: pqty,
        avgWastagePct: 0,
        maxWastagePct: wpct,
        logs: [row],
      });
    }
  }

  // Compute averages
  const result = Array.from(grouped.values()).map(g => {
    const avgPct = g.logs.reduce((sum, l) => sum + parseFloat(String(l.wastagePct ?? 0)), 0) / g.logs.length;
    const overallPct = g.totalPlannedQty > 0
      ? (g.totalWastageQty / g.totalPlannedQty) * 100
      : 0;
    return {
      jobId: g.jobId,
      jobCode: g.jobCode,
      jobName: g.jobName,
      clientName: g.clientName,
      totalWastageQty: parseFloat(g.totalWastageQty.toFixed(2)),
      totalPlannedQty: parseFloat(g.totalPlannedQty.toFixed(2)),
      avgWastagePct: parseFloat(avgPct.toFixed(2)),
      wastagePct: parseFloat(overallPct.toFixed(2)),
      actualQty: g.totalWastageQty,
      materialName: g.logs.map(l => l.materialName).filter(Boolean).join(', '),
    };
  });

  res.json(result);
});

router.get("/reports/stock-summary", async (_req, res): Promise<void> => {
  const materials = await db.select().from(materialsTable).orderBy(materialsTable.materialType, materialsTable.materialName);

  const result = materials.map(m => {
    const currentQty = parseFloat(String(m.currentQty));
    const minReorderQty = parseFloat(String(m.minReorderQty));
    const isLowStock = currentQty <= minReorderQty;
    const maxStock = minReorderQty * 5;
    const stockPct = maxStock > 0 ? Math.min(100, (currentQty / maxStock) * 100) : 0;

    return {
      id: m.id,
      materialName: m.materialName,
      materialType: m.materialType,
      subType: m.subType,
      gsm: m.gsm,
      unit: m.unit,
      currentQty,
      minReorderQty,
      isLowStock,
      stockPct,
    };
  });

  res.json(result);
});

router.get("/reports/job-cost/:jobId", async (req, res): Promise<void> => {
  const params = GetJobCostReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, params.data.jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const jobMaterials = await db
    .select({
      materialName: materialsTable.materialName,
      plannedQty: jobMaterialsTable.plannedQty,
      actualQty: jobMaterialsTable.actualQty,
      unit: jobMaterialsTable.unit,
      costPerUnit: jobMaterialsTable.costPerUnit,
    })
    .from(jobMaterialsTable)
    .leftJoin(materialsTable, eq(jobMaterialsTable.materialId, materialsTable.id))
    .where(eq(jobMaterialsTable.jobId, params.data.jobId));

  const materials = jobMaterials.map(m => {
    const qty = parseFloat(String(m.actualQty ?? m.plannedQty));
    const costPerUnit = parseFloat(String(m.costPerUnit ?? "0"));
    const totalCost = qty * costPerUnit;
    return {
      materialName: m.materialName ?? "Unknown",
      plannedQty: parseFloat(String(m.plannedQty)),
      actualQty: m.actualQty ? parseFloat(String(m.actualQty)) : null,
      unit: m.unit,
      costPerUnit: m.costPerUnit ? parseFloat(String(m.costPerUnit)) : null,
      totalCost,
    };
  });

  const totalCost = materials.reduce((sum, m) => sum + m.totalCost, 0);

  res.json({
    jobId: job.id,
    jobCode: job.jobCode,
    jobName: job.jobName,
    clientName: job.clientName,
    totalCost,
    materials,
  });
});

export default router;
