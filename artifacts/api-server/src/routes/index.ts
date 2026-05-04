import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import sessionsRouter from "./sessions";
import entriesRouter from "./entries";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(sessionsRouter);
router.use(entriesRouter);
router.use(chatRouter);

export default router;
