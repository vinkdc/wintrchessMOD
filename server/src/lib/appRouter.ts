import { Request, RequestHandler, Response } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";

type PlaceholderGenerator = (req: Request, res: Response) => (
    Promise<Record<string, string>>
);

function appRouter(
    filepath: string,
    getPlaceholders?: PlaceholderGenerator
): RequestHandler {
    // Pages reference fixed bundle names, so always revalidate them
    if (!getPlaceholders) {
        return async (req, res) => res.sendFile(
            resolve(`client/public/apps/${filepath}`),
            { headers: { "Cache-Control": "no-cache" } }
        );
    }

    return async (req, res) => {
        const placeholders = Object.entries(
            await getPlaceholders(req, res)
        );

        let htmlContent = readFileSync(
            `client/public/apps/${filepath}`, "utf-8"
        );

        for (const [ key, value ] of placeholders) {
            htmlContent = htmlContent.replace(
                new RegExp(`\\\${${key}}`, "gi"), value
            );
        }

        res.setHeader("Content-Type", "text/html");
        res.setHeader("Cache-Control", "no-cache");

        res.send(htmlContent);
    };
}

export default appRouter;