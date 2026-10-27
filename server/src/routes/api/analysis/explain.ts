import express, { Router } from "express";
import { StatusCodes } from "http-status-codes";
import Anthropic from "@anthropic-ai/sdk";
import z from "zod";

import { evaluationSchema } from "shared/types/game/position/Evaluation";
import analysisAuthenticator from "@/lib/security/analysis";

const path = "/analysis/explain";

let anthropicClient: Anthropic | undefined;

// Created on first use, after environment variables have been loaded
function getClient() {
    if (!process.env.ANTHROPIC_API_KEY) return;

    return anthropicClient ??= new Anthropic();
}

const systemPrompt = "You are a friendly chess coach explaining one move from"
    + " a game review to the player who made it. You are given the position,"
    + " the move, its classification and verified engine output. Explain in"
    + " 2 to 4 short sentences why the move deserves its classification and"
    + " what the key idea is. Only mention moves and variations that appear"
    + " in the engine output or facts provided - never invent lines. Use"
    + " standard algebraic notation, address the player as \"you\", and do"
    + " not use markdown or headings.";

const explainRequestSchema = z.object({
    fen: z.string().max(100),
    move: z.string().max(10),
    classification: z.string().max(20),
    rating: z.number().optional(),
    evaluationBefore: evaluationSchema,
    evaluationAfter: evaluationSchema,
    bestLine: z.array(z.string().max(10)).max(12),
    replyLine: z.array(z.string().max(10)).max(12),
    facts: z.array(z.string().max(300)).max(10)
});

type ExplainRequest = z.infer<typeof explainRequestSchema>;

function formatEvaluation(evaluation: ExplainRequest["evaluationBefore"]) {
    if (evaluation.type == "mate") return `mate in ${evaluation.value}`;

    return (evaluation.value / 100).toFixed(2);
}

function buildPrompt(request: ExplainRequest) {
    return [
        `Position before the move (FEN): ${request.fen}`,
        `Move played: ${request.move}`,
        `Classification: ${request.classification}`,
        request.rating ? `Player rating: ${request.rating}` : "",
        "Engine evaluation (from White's perspective) before the move: "
            + formatEvaluation(request.evaluationBefore),
        "Engine evaluation (from White's perspective) after the move: "
            + formatEvaluation(request.evaluationAfter),
        `Engine best line before the move: ${request.bestLine.join(" ")}`,
        `Engine best line after the move: ${request.replyLine.join(" ")}`,
        request.facts.length > 0
            ? `Facts: ${request.facts.join(" ")}`
            : ""
    ].filter(line => line.length > 0).join("\n");
}

const router = Router();

router.get("/analysis/ai-status", (req, res) => {
    res.json({ enabled: !!getClient() });
});

router.use(path,
    analysisAuthenticator,
    express.json({ limit: "16kb" })
);

router.post(path, async (req, res) => {
    const client = getClient();

    if (!client) return res.sendStatus(StatusCodes.SERVICE_UNAVAILABLE);

    const parsedRequest = explainRequestSchema.safeParse(req.body);

    if (!parsedRequest.success)
        return res.sendStatus(StatusCodes.BAD_REQUEST);

    try {
        const response = await client.beta.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
            max_tokens: 4000,
            output_config: { effort: "low" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: systemPrompt,
            messages: [{
                role: "user",
                content: buildPrompt(parsedRequest.data)
            }]
        });

        if (response.stop_reason == "refusal")
            return res.sendStatus(StatusCodes.BAD_GATEWAY);

        const explanation = response.content
            .filter(block => block.type == "text")
            .map(block => block.text)
            .join("")
            .trim();

        if (!explanation) return res.sendStatus(StatusCodes.BAD_GATEWAY);

        res.json({ explanation });
    } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
            return res.sendStatus(StatusCodes.TOO_MANY_REQUESTS);
        } else if (err instanceof Anthropic.APIError) {
            console.error(`AI explanation failed (${err.status}):`, err.message);
            return res.sendStatus(StatusCodes.BAD_GATEWAY);
        }

        console.error("AI explanation failed:", err);
        res.sendStatus(StatusCodes.INTERNAL_SERVER_ERROR);
    }
});

export default router;
