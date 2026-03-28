import { Router, type IRouter } from "express";
import healthRouter from "./health";
import metricsRouter from "./metrics";
import authRouter from "./auth";
import usersRouter from "./users";
import rolesRouter from "./roles";
import passwordPolicyRouter from "./password-policy";
import profileRouter from "./profile";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(rolesRouter);
router.use(passwordPolicyRouter);
router.use(profileRouter);
router.use(requireAuth, metricsRouter);

export default router;
