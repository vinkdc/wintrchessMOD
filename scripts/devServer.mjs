// Restarted by `node --watch` whenever shared or server source changes
import cluster from "cluster";
import { execSync } from "child_process";

// Only the primary process builds; cluster workers reuse its output
if (cluster.isPrimary) {
    execSync(
        "npm run build -w shared && npm run build -w server",
        { stdio: "inherit" }
    );
}

await import("../server/dist/index.js");
