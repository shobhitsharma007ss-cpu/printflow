import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, jobsTable, jobRoutingTable, machinesTable } from "@workspace/db";
import { GetScheduleQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

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

const OEE_DEFAULTS: Record<string, number> = {
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

const MAKEREADY_HOURS = 0.5;
const AVAILABLE_HOURS_PER_DAY = 8;

function calcEtaHours(
  qtySheets: number,
  upsPerSheet: number | null,
  machineName: string,
  ratedSph: number | null,
  oeeDefault: string | null,
): number {
  const ups = Math.max(1, upsPerSheet ?? 1);
  const sheetsToRun = Math.ceil(qtySheets / ups);
  const sph = ratedSph ?? MACHINE_SPEEDS[machineName] ?? 8000;
  const oee = oeeDefault != null
    ? parseFloat(String(oeeDefault))
    : (OEE_DEFAULTS[machineName] ?? 0.65);
  const effectiveSph = sph * oee;
  if (effectiveSph <= 0) return MAKEREADY_HOURS;
  const runHours = sheetsToRun / effectiveSph;
  return runHours + MAKEREADY_HOURS;
}

function addDaysToIso(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function genDayRange(start: string, count: number): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i++) days.push(addDaysToIso(start, i));
  return days;
}

router.get("/schedule", async (req, res): Promise<void> => {
  const parsed = GetScheduleQueryParams.safeParse(req.query);
  const weeks = parsed.success ? (parsed.data.weeks ?? 4) : 4;
  const startDate = parsed.success && parsed.data.startDate
    ? parsed.data.startDate
    : new Date().toISOString().slice(0, 10);

  const days = genDayRange(startDate, weeks * 7);
  const endDate = days[days.length - 1];
  const daySet = new Set(days);

  const allJobs = await db.select().from(jobsTable);
  const activeJobs = allJobs.filter(j =>
    j.status === "pending" || j.status === "in-progress"
  );

  const scheduledJobs = activeJobs.filter(
    j => j.scheduledDate != null && daySet.has(j.scheduledDate)
  );
  const unscheduledJobs = activeJobs.filter(j => j.scheduledDate == null);

  const scheduledJobIds = scheduledJobs.map(j => j.id);
  type RoutingRow = {
    id: number; jobId: number; stepNumber: number; stepCode: string;
    machineId: number; status: string; machineName: string | null;
    machineType: string | null; ratedSph: number | null; oeeDefault: string | null;
  };
  let routingRows: RoutingRow[] = [];

  if (scheduledJobIds.length > 0) {
    routingRows = await db
      .select({
        id: jobRoutingTable.id,
        jobId: jobRoutingTable.jobId,
        stepNumber: jobRoutingTable.stepNumber,
        stepCode: jobRoutingTable.stepCode,
        machineId: jobRoutingTable.machineId,
        status: jobRoutingTable.status,
        machineName: machinesTable.machineName,
        machineType: machinesTable.machineType,
        ratedSph: machinesTable.ratedSph,
        oeeDefault: machinesTable.oeeDefault,
      })
      .from(jobRoutingTable)
      .leftJoin(machinesTable, eq(jobRoutingTable.machineId, machinesTable.id))
      .where(inArray(jobRoutingTable.jobId, scheduledJobIds));
  }

  const allMachines = await db.select().from(machinesTable).orderBy(machinesTable.id);
  const activeMachineIds = new Set(routingRows.map(r => r.machineId));

  const machineRows = [];
  for (const machine of allMachines) {
    if (!activeMachineIds.has(machine.id)) continue;

    const dayMap = new Map<string, { bookedHours: number; jobs: object[] }>();
    for (const day of days) dayMap.set(day, { bookedHours: 0, jobs: [] });

    const stepsOnMachine = routingRows.filter(
      r => r.machineId === machine.id &&
        r.status !== "completed" &&
        r.status !== "skipped"
    );

    for (const step of stepsOnMachine) {
      const job = scheduledJobs.find(j => j.id === step.jobId);
      if (!job?.scheduledDate) continue;
      const dayData = dayMap.get(job.scheduledDate);
      if (!dayData) continue;

      const estHours = calcEtaHours(
        job.qtySheets, job.upsPerSheet, machine.machineName, machine.ratedSph, machine.oeeDefault,
      );
      dayData.bookedHours += estHours;
      dayData.jobs.push({
        jobId: job.id,
        jobCode: job.jobCode,
        jobName: job.jobName,
        clientName: job.clientName,
        scheduledDate: job.scheduledDate,
        status: job.status,
        estimatedHours: Math.round(estHours * 100) / 100,
        stepCode: step.stepCode,
        stepNumber: step.stepNumber,
      });
    }

    const dayResults = days.map(date => {
      const d = dayMap.get(date)!;
      const bh = Math.round(d.bookedHours * 100) / 100;
      return {
        date,
        bookedHours: bh,
        availableHours: AVAILABLE_HOURS_PER_DAY,
        isOverloaded: bh > AVAILABLE_HOURS_PER_DAY,
        jobs: d.jobs,
      };
    });

    machineRows.push({
      machineId: machine.id,
      machineName: machine.machineName,
      machineType: machine.machineType,
      availableHoursPerDay: AVAILABLE_HOURS_PER_DAY,
      days: dayResults,
    });
  }

  res.json({
    startDate,
    endDate,
    days,
    machines: machineRows,
    unscheduledJobs: unscheduledJobs.map(j => ({
      jobId: j.id,
      jobCode: j.jobCode,
      jobName: j.jobName,
      clientName: j.clientName,
      status: j.status,
      qtySheets: j.qtySheets,
    })),
  });
});

export default router;
