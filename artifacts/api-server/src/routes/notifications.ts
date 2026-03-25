import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/notifications", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(notificationsTable)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(rows);
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
