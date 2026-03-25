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

const router: IRouter = Router();

router.use(healthRouter);
router.use(vendorsRouter);
router.use(materialsRouter);
router.use(stockRouter);
router.use(machinesRouter);
router.use(jobsRouter);
router.use(templatesRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(notificationsRouter);

export default router;
