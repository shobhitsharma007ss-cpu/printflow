import { Router, type IRouter } from "express";
import { eq, gt, sql } from "drizzle-orm";
import { db, wastageLogTable, jobsTable, materialsTable, jobMaterialsTable, jobRoutingTable, machinesTable, stockInwardTable } from "@workspace/db";
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
  const [materials, batchAges] = await Promise.all([
    db.select().from(materialsTable).orderBy(materialsTable.materialType, materialsTable.materialName),
    db.select({
      materialId: stockInwardTable.materialId,
      oldestDate: sql<string>`MIN(${stockInwardTable.receivedDate})`,
    })
    .from(stockInwardTable)
    .groupBy(stockInwardTable.materialId),
  ]);

  const batchAgeMap = new Map(batchAges.map(b => [b.materialId, b.oldestDate]));

  const result = materials.map(m => {
    const currentQty = parseFloat(String(m.currentQty));
    const minReorderQty = parseFloat(String(m.minReorderQty));
    // Only flag low stock when a reorder threshold is actually set (> 0)
    const isLowStock = minReorderQty > 0 && currentQty <= minReorderQty;
    const maxStock = minReorderQty * 5;
    const rawPct = maxStock > 0 ? (currentQty / maxStock) * 100 : 0;
    const stockPct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0;

    const oldestDateStr = batchAgeMap.get(m.id);
    const oldestBatchDays = oldestDateStr
      ? Math.floor((Date.now() - new Date(oldestDateStr).getTime()) / 86_400_000)
      : null;

    return {
      id: m.id,
      materialName: m.materialName,
      materialType: m.materialType,
      subType: m.subType,
      gsm: m.gsm,
      unit: m.unit,
      currentQty,
      minReorderQty,
      dimensions: m.dimensions,
      grain: m.grain,
      isLowStock,
      stockPct,
      oldestBatchDays,
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

router.get("/reports/machine-downtime", async (_req, res): Promise<void> => {
  // Fetch all machines so chart always shows full fleet (even machines with 0 downtime)
  const allMachines = await db.select().from(machinesTable).orderBy(machinesTable.id);

  // Only fetch routing rows that have actually been paused (total_paused_seconds > 0)
  const pausedRows = await db
    .select({
      machineId: jobRoutingTable.machineId,
      totalPausedSeconds: jobRoutingTable.totalPausedSeconds,
      pauseReason: jobRoutingTable.pauseReason,
    })
    .from(jobRoutingTable)
    .where(gt(jobRoutingTable.totalPausedSeconds, 0));

  // Aggregate per machine
  const aggMap = new Map<number, { totalPausedSeconds: number; reasonCounts: Map<string, number> }>();

  for (const row of pausedRows) {
    const entry = aggMap.get(row.machineId) ?? { totalPausedSeconds: 0, reasonCounts: new Map() };
    entry.totalPausedSeconds += row.totalPausedSeconds ?? 0;
    if (row.pauseReason) {
      entry.reasonCounts.set(row.pauseReason, (entry.reasonCounts.get(row.pauseReason) ?? 0) + 1);
    }
    aggMap.set(row.machineId, entry);
  }

  const result = allMachines.map(m => {
    const agg = aggMap.get(m.id);
    return {
      machineId: m.id,
      machineName: m.machineName,
      machineType: m.machineType,
      totalPausedMinutes: agg ? parseFloat((agg.totalPausedSeconds / 60).toFixed(1)) : 0,
      reasonBreakdown: agg
        ? Array.from(agg.reasonCounts.entries())
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count)
        : [],
    };
  }).sort((a, b) => b.totalPausedMinutes - a.totalPausedMinutes);

  res.json(result);
});

export default router;
