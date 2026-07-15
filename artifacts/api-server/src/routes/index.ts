import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vendorsRouter from "./vendors";
import materialsRouter from "./materials";
import stockRouter from "./stock";
import machinesRouter from "./machines";
import jobsRouter from "./jobs";
import templatesRouter from "./templates";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import notificationsRouter from "./notifications";
import quotesRouter from "./quotes";
import scheduleRouter from "./schedule";
import adminRouter from "./admin";
import authRouter from "./auth";
import usersRouter from "./users";
import { requireAuth, requireRole } from "../middlewares/require-auth";

const router: IRouter = Router();

// Public routes (no session required).
router.use(healthRouter);
router.use(authRouter);

// Everything below this line requires an authenticated session.
router.use(requireAuth);

router.use(vendorsRouter);
router.use(materialsRouter);
router.use(stockRouter);
router.use(machinesRouter);
router.use(jobsRouter);
router.use(templatesRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);
router.use(quotesRouter);
router.use(requireRole("owner", "supervisor"), scheduleRouter);

// Owner-only routes: Reports screen, user management, and destructive admin
// actions must not be reachable by supervisor/operator sessions (e.g. the
// shared operator tablet), even though the frontend already hides them.
router.use(requireRole("owner"), reportsRouter);
router.use(requireRole("owner"), usersRouter);
router.use(requireRole("owner"), adminRouter);

export default router;
