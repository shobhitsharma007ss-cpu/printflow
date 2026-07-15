import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import type { SessionUser } from "../lib/session";

const router: IRouter = Router();

router.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (user.isActive === false) {
    res.status(403).json({ error: "Your account has been deactivated. Contact your owner." });
    return;
  }

  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
  req.session.user = sessionUser;
  res.json({ user: sessionUser });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", (req, res) => {
  if (req.session?.user) {
    res.json({ user: req.session.user });
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
});

export default router;
