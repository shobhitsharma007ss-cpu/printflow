import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, notificationsTable, materialsTable, jobsTable, jobRoutingTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/notifications", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const [allMaterials, allJobs, routingSteps] = await Promise.all([
    db.select({
      id: materialsTable.id,
      materialName: materialsTable.materialName,
      currentQty: materialsTable.currentQty,
      minReorderQty: materialsTable.minReorderQty,
      unit: materialsTable.unit,
    }).from(materialsTable),
    db.select({
      id: jobsTable.id,
      jobCode: jobsTable.jobCode,
      jobName: jobsTable.jobName,
      clientName: jobsTable.clientName,
      status: jobsTable.status,
      createdAt: jobsTable.createdAt,
    }).from(jobsTable),
    db.select({
      jobId: jobRoutingTable.jobId,
      completedAt: jobRoutingTable.completedAt,
    }).from(jobRoutingTable).where(eq(jobRoutingTable.status, "completed")),
  ]);

  const lowStock = allMaterials
    .filter(m => parseFloat(String(m.minReorderQty)) > 0 && parseFloat(String(m.currentQty)) <= parseFloat(String(m.minReorderQty)))
    .map(m => ({
      id: m.id,
      materialName: m.materialName,
      currentQty: parseFloat(String(m.currentQty)),
      minReorderQty: parseFloat(String(m.minReorderQty)),
      unit: m.unit,
    }));

  const overdueJobs = allJobs
    .filter(j => j.status === "pending" && new Date(j.createdAt) < twoDaysAgo)
    .map(j => {
      const diffDays = Math.floor((now.getTime() - new Date(j.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      const daysOverdue = diffDays - 2;
      return {
        id: j.id,
        jobCode: j.jobCode,
        jobName: j.jobName,
        clientName: j.clientName,
        daysOverdue: Math.max(0, daysOverdue),
      };
    });

  const completedTodayJobIds = new Set(
    routingSteps
      .filter(r => r.completedAt && r.completedAt.startsWith(todayStr))
      .map(r => r.jobId)
  );

  const completedToday = allJobs
    .filter(j => j.status === "completed" && completedTodayJobIds.has(j.id))
    .map(j => ({
      id: j.id,
      jobCode: j.jobCode,
      jobName: j.jobName,
      clientName: j.clientName,
    }));

  res.json({ lowStock, overdueJobs, completedToday });
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.post("/notifications/mark-all-read", async (_req, res): Promise<void> => {
  const result = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.isRead, false))
    .returning();
  res.json({ count: result.length });
});

export default router;

export async function createNotification(data: {
  type: string;
  title: string;
  message: string;
  relatedId?: number;
}) {
  const [row] = await db
    .insert(notificationsTable)
    .values({
      type: data.type,
      title: data.title,
      message: data.message,
      relatedId: data.relatedId ?? null,
    })
    .returning();
  return row;
}
