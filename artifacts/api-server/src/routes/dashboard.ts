import { Router, type IRouter } from "express";
import { eq, and, gte, lt } from "drizzle-orm";
import { db, jobsTable, machinesTable, materialsTable, jobRoutingTable, jobMaterialsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/metrics", async (_req, res): Promise<void> => {
  const allJobs = await db.select().from(jobsTable);
  const allMachines = await db.select().from(machinesTable);
  const allMaterials = await db.select().from(materialsTable);

  const activeJobs = allJobs.filter(j => j.status === "in-progress").length;
  const machinesRunning = allMachines.filter(m => m.status === "running").length;
  const lowStockAlerts = allMaterials.filter(m =>
    parseFloat(String(m.currentQty)) <= parseFloat(String(m.minReorderQty))
  ).length;

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const jobsCompletedToday = allJobs.filter(j => j.status === "completed").length;

  const recentJobs = allJobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const recentJobsWithDetails = await Promise.all(
    recentJobs.map(async (job) => {
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
        .where(eq(jobRoutingTable.jobId, job.id));

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
        .where(eq(jobMaterialsTable.jobId, job.id));

      const material = job.materialId
        ? await db.select().from(materialsTable).where(eq(materialsTable.id, job.materialId)).then(r => r[0])
        : null;

      return { ...job, materialName: material?.materialName ?? null, routing, materials };
    })
  );

  // Build machine list with current job
  const machineStatuses = await Promise.all(
    allMachines.map(async (machine) => {
      const activeRouting = await db
        .select({ jobName: jobsTable.jobName, jobCode: jobsTable.jobCode })
        .from(jobRoutingTable)
        .innerJoin(jobsTable, eq(jobRoutingTable.jobId, jobsTable.id))
        .where(eq(jobRoutingTable.machineId, machine.id))
        .limit(1);

      const currentJobName = activeRouting[0]
        ? `${activeRouting[0].jobCode} — ${activeRouting[0].jobName}`
        : null;

      return { ...machine, currentJobName };
    })
  );

  res.json({
    activeJobs,
    machinesRunning,
    lowStockAlerts,
    jobsCompletedToday,
    recentJobs: recentJobsWithDetails,
    machineStatuses,
  });
});

export default router;
