import { Router, type IRouter } from "express";
import { eq, max, isNull, desc } from "drizzle-orm";
import { db, jobQuotesTable, jobsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/job-quotes", async (req, res): Promise<void> => {
  const { jobId, costingSnapshot, preGstTotal, finalTotal, per1000Rate } = req.body as {
    jobId?: number | null;
    costingSnapshot: Record<string, unknown>;
    preGstTotal: number;
    finalTotal: number;
    per1000Rate: number;
  };

  if (!costingSnapshot || typeof costingSnapshot !== "object") {
    res.status(400).json({ error: "costingSnapshot is required" });
    return;
  }

  const resolvedJobId = typeof jobId === "number" ? jobId : null;

  const [{ maxVer }] = await db
    .select({ maxVer: max(jobQuotesTable.version) })
    .from(jobQuotesTable)
    .where(resolvedJobId != null
      ? eq(jobQuotesTable.jobId, resolvedJobId)
      : isNull(jobQuotesTable.jobId)
    );

  const nextVersion = (maxVer ?? 0) + 1;

  const [quote] = await db
    .insert(jobQuotesTable)
    .values({
      jobId: resolvedJobId,
      version: nextVersion,
      costingSnapshot,
      preGstTotal: preGstTotal != null ? String(preGstTotal) : null,
      finalTotal: finalTotal != null ? String(finalTotal) : null,
      per1000Rate: per1000Rate != null ? String(per1000Rate) : null,
    })
    .returning();

  res.status(201).json({ id: quote.id, version: quote.version, createdAt: quote.createdAt });
});

router.get("/job-quotes", async (_req, res): Promise<void> => {
  const quotes = await db
    .select({
      id: jobQuotesTable.id,
      jobId: jobQuotesTable.jobId,
      version: jobQuotesTable.version,
      preGstTotal: jobQuotesTable.preGstTotal,
      finalTotal: jobQuotesTable.finalTotal,
      per1000Rate: jobQuotesTable.per1000Rate,
      isConverted: jobQuotesTable.isConverted,
      convertedJobId: jobQuotesTable.convertedJobId,
      createdAt: jobQuotesTable.createdAt,
    })
    .from(jobQuotesTable)
    .orderBy(desc(jobQuotesTable.createdAt));

  res.json(quotes);
});

router.post("/job-quotes/:id/convert", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { jobName, clientName } = req.body as { jobName?: string; clientName?: string };
  if (!jobName?.trim()) { res.status(400).json({ error: "jobName is required" }); return; }
  if (!clientName?.trim()) { res.status(400).json({ error: "clientName is required" }); return; }

  const [quote] = await db.select().from(jobQuotesTable).where(eq(jobQuotesTable.id, id));
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  if (quote.isConverted) {
    res.status(409).json({ error: "Quote has already been converted to a job" });
    return;
  }

  const snapshot = quote.costingSnapshot as Record<string, unknown>;
  const inputs = (snapshot?.inputs ?? {}) as Record<string, unknown>;
  const outputs = (snapshot?.outputs ?? {}) as Record<string, unknown>;

  const existingJobs = await db.select({ jobCode: jobsTable.jobCode }).from(jobsTable).orderBy(jobsTable.id);
  let maxNum = 0;
  for (const j of existingJobs) {
    const match = j.jobCode.match(/PF-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const jobCode = `PF-${String(maxNum + 1).padStart(3, "0")}`;

  const qtySheets = Math.max(1, Math.round(Number(inputs.qtyRequired) || 0));
  const plannedSheets = Math.max(1, Math.round(Number(outputs.planSheets) || qtySheets));

  let newJob: typeof jobsTable.$inferSelect;
  try {
    newJob = await db.transaction(async (tx) => {
      const [fresh] = await tx.select({ isConverted: jobQuotesTable.isConverted })
        .from(jobQuotesTable).where(eq(jobQuotesTable.id, id));
      if (!fresh || fresh.isConverted) throw Object.assign(new Error("ALREADY_CONVERTED"), { code: 409 });

      const [inserted] = await tx.insert(jobsTable).values({
        jobCode,
        jobName: jobName.trim(),
        clientName: clientName.trim(),
        qtySheets,
        plannedSheets,
        materialId: inputs.materialId ? Number(inputs.materialId) : null,
        materialGsm: inputs.gsm ? parseInt(String(inputs.gsm)) : null,
        processColors: inputs.processColors ? parseInt(String(inputs.processColors)) : 4,
        spotColors: inputs.spotColors ? parseInt(String(inputs.spotColors)) : 0,
        printPassCount: inputs.printPassCount ? parseInt(String(inputs.printPassCount)) : 1,
        coatingType: inputs.coatingType ? String(inputs.coatingType) : null,
        cartonStyle: inputs.cartonStyle ? String(inputs.cartonStyle) : "straight_tuck",
        isNewDie: inputs.isNewDie === true || inputs.isNewDie === "true",
        dieCost: inputs.dieFabCost && Number(inputs.dieFabCost) > 0 ? String(Number(inputs.dieFabCost)) : null,
        upsPerSheet: inputs.upsPerSheet ? parseInt(String(inputs.upsPerSheet)) : null,
        quoteBudgetId: quote.id,
        status: "pending",
      }).returning();

      await tx.update(jobQuotesTable)
        .set({ isConverted: true, convertedJobId: inserted.id })
        .where(eq(jobQuotesTable.id, id));

      return inserted;
    });
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 409) {
      res.status(409).json({ error: "Quote has already been converted to a job" });
    } else {
      res.status(500).json({ error: "Conversion failed" });
    }
    return;
  }

  res.status(201).json({ jobId: newJob.id, jobCode: newJob.jobCode, quoteId: quote.id });
});

export default router;
