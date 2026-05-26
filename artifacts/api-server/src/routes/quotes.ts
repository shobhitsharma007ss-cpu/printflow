import { Router, type IRouter } from "express";
import { eq, max, isNull } from "drizzle-orm";
import { db, jobQuotesTable } from "@workspace/db";

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
      createdAt: jobQuotesTable.createdAt,
    })
    .from(jobQuotesTable)
    .orderBy(jobQuotesTable.createdAt);

  res.json(quotes);
});

export default router;
