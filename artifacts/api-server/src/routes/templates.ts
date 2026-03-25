import { Router, type IRouter } from "express";
import { db, jobTemplatesTable, machinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateJobTemplateBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function buildTemplateWithMachines(id: number) {
  const [template] = await db.select().from(jobTemplatesTable).where(eq(jobTemplatesTable.id, id));
  if (!template) return null;

  const machineNames: string[] = [];
  for (const machineId of template.routingSteps) {
    const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, machineId));
    machineNames.push(machine?.machineName ?? `Machine ${machineId}`);
  }

  return { ...template, machineNames };
}

router.get("/job-templates", async (_req, res): Promise<void> => {
  const templates = await db.select().from(jobTemplatesTable).orderBy(jobTemplatesTable.id);
  const result = await Promise.all(templates.map(t => buildTemplateWithMachines(t.id)));
  res.json(result.filter(Boolean));
});

router.post("/job-templates", async (req, res): Promise<void> => {
  const parsed = CreateJobTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [template] = await db.insert(jobTemplatesTable).values(parsed.data).returning();
  const result = await buildTemplateWithMachines(template.id);
  res.status(201).json(result);
});

export default router;
