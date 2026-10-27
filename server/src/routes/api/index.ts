import { Router } from "express";

import publicApiRouter from "./public";
import accountRouter from "./account";
import analyseRouter from "./analysis/analyse";
import archiveRouter from "./analysis/archive";
import explainRouter from "./analysis/explain";

const router = Router();

router.use("/api",
    publicApiRouter,
    accountRouter,
    analyseRouter,
    archiveRouter,
    explainRouter
);

export default router;