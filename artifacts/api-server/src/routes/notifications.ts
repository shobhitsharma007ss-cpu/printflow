import { Router, type IRouter } from "express";
import { eq, desc, lte, and, lt, sql } from "drizzle-orm";
import { db, notificationsTable, materialsTable, jobsTable, jobRoutingTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/notifications", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const twoDaysAgoIso = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const [lowStockRows, overdueRows, completedRoutingRows] = await Promise.all([
    // Low stock: current_qty <= min_reorder_qty (only when min_reorder_qty > 0 — materials with 0 reorder threshold never alert)
    db.select({
      id: materialsTable.id,
      materialName: materialsTable.materialName,
      currentQty: materialsTable.currentQty,
      minReorderQty: materialsTable.minReorderQty,
      unit: materialsTable.unit,
    })
      .from(materialsTable)
      .where(
        and(
          sql`${materialsTable.minReorderQty} > 0`,
          lte(materialsTable.currentQty, materialsTable.minReorderQty)
        )
      ),

    // Overdue pending: status=pending and created_at older than 2 days
    db.select({
      id: jobsTable.id,
      jobCode: jobsTable.jobCode,
      jobName: jobsTable.jobName,
      clientName: jobsTable.clientName,
      createdAt: jobsTable.createdAt,
    })
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.status, "pending"),
          lt(jobsTable.createdAt, new Date(twoDaysAgoIso))
        )
      ),

    // Completed today: routing steps completed today, joined with completed jobs
    db.select({
      jobId: jobRoutingTable.jobId,
      completedAt: jobRoutingTable.completedAt,
      jobCode: jobsTable.jobCode,
      jobName: jobsTable.jobName,
      clientName: jobsTable.clientName,
    })
      .from(jobRoutingTable)
      .innerJoin(jobsTable, eq(jobRoutingTable.jobId, jobsTable.id))
      .where(
        and(
          eq(jobRoutingTable.status, "completed"),
          eq(jobsTable.status, "completed"),
          sql`${jobRoutingTable.completedAt} LIKE ${todayStr + "%"}`
        )
      ),
  ]);

  const lowStock = lowStockRows.map(m => ({
    id: m.id,
    materialName: m.materialName,
    currentQty: parseFloat(String(m.currentQty)),
    minReorderQty: parseFloat(String(m.minReorderQty)),
    unit: m.unit,
  }));

  const overdueJobs = overdueRows.map(j => {
    const diffDays = Math.floor((now.getTime() - new Date(j.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    return {
      id: j.id,
      jobCode: j.jobCode,
      jobName: j.jobName,
      clientName: j.clientName,
      daysOverdue: Math.max(0, diffDays - 2),
    };
  });

  // De-duplicate completed-today by jobId
  const completedTodayMap = new Map<number, { id: number; jobCode: string; jobName: string; clientName: string }>();
  for (const r of completedRoutingRows) {
    if (!completedTodayMap.has(r.jobId)) {
      completedTodayMap.set(r.jobId, {
        id: r.jobId,
        jobCode: r.jobCode,
        jobName: r.jobName,
        clientName: r.clientName,
      });
    }
  }
  const completedToday = Array.from(completedTodayMap.values());

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
