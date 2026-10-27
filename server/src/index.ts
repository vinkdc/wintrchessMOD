import express from "express";
import cluster from "cluster";
import os from "os";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";

import connectDatabase from "@/database/connect";
import hostnameWhitelist from "@/lib/security/whitelist";
import getAuth from "@/lib/auth";
import mainRouter from "./routes";

dotenv.config();

const port = process.env.PORT || 8080;
const nodeEnv = process.env.NODE_ENV || "production";

const coreCount = os.cpus().length;

// Retired engine files mapped to their replacements, for clients still
// running a cached bundle from before the upgrade
const retiredEngineFiles: Record<string, string> = {
    "/stockfish-17-lite-single.js": "/engines/stockfish-19-lite-single.js",
    "/stockfish-17-single.js": "/engines/stockfish-19-single.js",
    "/stockfish-17-asm.js": "/engines/stockfish-19-asm.js"
};

// Bundles and pages keep fixed names, so browsers must revalidate them
// to pick up new deployments
function setStaticCacheHeaders(res: express.Response, filePath: string) {
    if (/\.(bundle\.js|html)$/.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache");
    }
}

async function main() {
    if (cluster.isPrimary) {
        console.log("starting server...");
        for (let i = 0; i < coreCount; i++) cluster.fork();

        return;
    }

    await connectDatabase();

    const app = express();

    app.use(cookieParser());
    app.use(hostnameWhitelist);

    app.use("/engines", (req, res, next) => {
        const replacement = retiredEngineFiles[req.path];
        if (replacement) return res.redirect(301, replacement);

        next();
    });

    // Static assets
    app.use("/",
        express.static("client/dist", { setHeaders: setStaticCacheHeaders }),
        express.static("client/public", { setHeaders: setStaticCacheHeaders })
    );

    // Missing engine files must not fall through to an HTML page
    app.use("/engines", (req, res) => res.sendStatus(404));

    // Normal endpoints
    app.all("/auth/account/*", toNodeHandler(getAuth()));
    app.use("/", mainRouter);

    // Start listening for requests
    app.listen(port, () => {
        if (cluster.worker?.id != 1) return;

        console.log(
            `server running on port ${port} `
            + `(${nodeEnv} mode, ${coreCount} thread`
            + (coreCount > 1 ? "s)" : ")")
        );
    });
}

main();