import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, and, ne, sql } from "drizzle-orm";
import { db, usersTable, pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/users", async (_req, res): Promise<void> => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(usersTable.createdAt);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/users", async (req, res): Promise<void> => {
  const { name, email, password, role } = req.body ?? {};
  if (!name || !email || !password || !role) {
    res.status(400).json({ error: "name, email, password and role are required." });
    return;
  }
  const validRoles = ["owner", "supervisor", "operator"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "role must be owner, supervisor, or operator." });
    return;
  }
  const normalEmail = String(email).trim().toLowerCase();
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalEmail))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "A user with this email already exists." });
    return;
  }
  const passwordHash = await bcrypt.hash(String(password), 12);
  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        name: String(name).trim(),
        email: normalEmail,
        passwordHash,
        role: String(role),
        isActive: true,
      })
      .returning({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
      });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user id." });
    return;
  }

  const requestingUserId = req.session?.user?.id;
  const { role, isActive } = req.body ?? {};

  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  if (id === requestingUserId && (isActive === false || (role && role !== "owner"))) {
    res.status(403).json({ error: "You cannot deactivate or demote your own account." });
    return;
  }

  if (target.role === "owner" && (isActive === false || (role && role !== "owner"))) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.role, "owner"), eq(usersTable.isActive, true), ne(usersTable.id, id)));
    if (count === 0) {
      res.status(403).json({ error: "Cannot deactivate or demote the last active owner." });
      return;
    }
  }

  const updateData: Partial<typeof usersTable.$inferInsert> = {};
  if (role !== undefined) {
    const validRoles = ["owner", "supervisor", "operator"];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: "role must be owner, supervisor, or operator." });
      return;
    }
    updateData.role = String(role);
  }
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "Provide role or isActive to update." });
    return;
  }

  try {
    const [updated] = await db
      .update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, id))
      .returning({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
      });

    if (updateData.isActive === false) {
      await pool.query(
        "DELETE FROM user_sessions WHERE (sess->'user'->>'id')::integer = $1",
        [id],
      );
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/users/:id/reset-password", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user id." });
    return;
  }
  const { password } = req.body ?? {};
  if (!password || String(password).length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }

  const [target] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  try {
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, id));

    await pool.query(
      "DELETE FROM user_sessions WHERE (sess->'user'->>'id')::integer = $1",
      [id],
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
