import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import type { SessionUser } from "../lib/session";

const router: IRouter = Router();

/* Login throttling — in memory, no dependency, no schema change.
   Counts consecutive failures per email+IP and locks that pair out for a spell.
   State is lost on restart, which is fine for a single-instance pilot; it stops
   credential stuffing, which is what we need before real data goes in. */
const MAX_ATTEMPTS = 6;
const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { n: number; first: number; lockedUntil?: number }>();

function throttleKey(email: string, ip: string) {
  return `${email}|${ip}`;
}

function checkLock(key: string): number | null {
  const rec = attempts.get(key);
  if (!rec) return null;
  if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
    return Math.ceil((rec.lockedUntil - Date.now()) / 1000);
  }
  if (rec.lockedUntil && rec.lockedUntil <= Date.now()) {
    attempts.delete(key);
  }
  return null;
}

function noteFailure(key: string) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { n: 1, first: now });
    return;
  }
  rec.n += 1;
  if (rec.n >= MAX_ATTEMPTS) rec.lockedUntil = now + LOCK_MS;
}

function clearFailures(key: string) {
  attempts.delete(key);
}

router.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const key = throttleKey(email, req.ip ?? "unknown");
  const lockedFor = checkLock(key);
  if (lockedFor !== null) {
    res.status(429).json({
      error: `Too many failed attempts. Try again in ${Math.ceil(lockedFor / 60)} minute(s).`,
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    noteFailure(key);
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  clearFailures(key);

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
