import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, machinesTable, jobRoutingTable, jobsTable } from "@workspace/db";
import {
  CreateMachineBody,
  UpdateMachineBody,
  GetMachineParams,
  UpdateMachineParams,
  PatchMachineStatusParams,
  PatchMachineStatusBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getMachinesWithCurrentJob() {
  const machines = await db.select().from(machinesTable).orderBy(machinesTable.id);
  const result = [];
  for (const machine of machines) {
    // Find current active job — only routing steps that are in-progress on an in-progress job
    const activeRouting = await db
      .select({ jobName: jobsTable.jobName, jobCode: jobsTable.jobCode })
      .from(jobRoutingTable)
      .innerJoin(jobsTable, eq(jobRoutingTable.jobId, jobsTable.id))
      .where(and(
        eq(jobRoutingTable.machineId, machine.id),
        eq(jobRoutingTable.status, 'in-progress'),
        eq(jobsTable.status, 'in-progress')
      ))
      .limit(1);

    const currentJobName = activeRouting[0]
      ? `${activeRouting[0].jobCode} — ${activeRouting[0].jobName}`
      : null;

    result.push({
      ...machine,
      currentQty: undefined,
      currentJobName,
    });
  }
  return result;
}

router.get("/machines", async (_req, res): Promise<void> => {
  const machines = await getMachinesWithCurrentJob();
  res.json(machines);
});

router.post("/machines", async (req, res): Promise<void> => {
  const parsed = CreateMachineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [machine] = await db.insert(machinesTable).values(parsed.data).returning();
  res.status(201).json({ ...machine, currentJobName: null });
});

router.get("/machines/:id", async (req, res): Promise<void> => {
  const params = GetMachineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, params.data.id));
  if (!machine) {
    res.status(404).json({ error: "Machine not found" });
    return;
  }
  res.json({ ...machine, currentJobName: null });
});

router.put("/machines/:id", async (req, res): Promise<void> => {
  const params = UpdateMachineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMachineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [machine] = await db.update(machinesTable).set(parsed.data).where(eq(machinesTable.id, params.data.id)).returning();
  if (!machine) {
    res.status(404).json({ error: "Machine not found" });
    return;
  }
  res.json({ ...machine, currentJobName: null });
});

router.patch("/machines/:id", async (req, res): Promise<void> => {
  const params = PatchMachineStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = PatchMachineStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [machine] = await db.update(machinesTable).set({ status: parsed.data.status }).where(eq(machinesTable.id, params.data.id)).returning();
  if (!machine) {
    res.status(404).json({ error: "Machine not found" });
    return;
  }
  res.json({ ...machine, currentJobName: null });
});

export default router;
