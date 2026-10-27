import { Router } from "express";

import profileRouter from "./profile";
import linksRouter from "./links";

const router = Router();

router.use("/account", profileRouter, linksRouter);

export default router;