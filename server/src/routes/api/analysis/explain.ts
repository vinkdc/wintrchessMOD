import express, { Router } from "express";
import { StatusCodes } from "http-status-codes";
import Anthropic from "@anthropic-ai/sdk";
import {
    GoogleGenAI,
    ApiError as GeminiApiError,
    ThinkingLevel
} from "@google/genai";
import z from "zod";

import { evaluationSchema } from "shared/types/game/position/Evaluation";
import analysisAuthenticator from "@/lib/security/analysis";

const path = "/analysis/explain";

// Thrown when a provider responds but gives no usable explanation
class EmptyExplanationError extends Error {}

// Thrown when a provider rejects a request for exceeding its rate limit
class ExplanationRateLimitError extends Error {}

let anthropicClient: Anthropic | undefined;
let geminiClient: GoogleGenAI | undefined;

async function explainWithClaude(prompt: string) {
    anthropicClient ??= new Anthropic();

    try {
        const response = await anthropicClient.beta.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
            max_tokens: 4000,
            output_config: { effort: "low" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: systemPrompt,
            messages: [{ role: "user", content: prompt }]
        });

        if (response.stop_reason == "refusal")
            throw new EmptyExplanationError();

        return response.content
            .filter(block => block.type == "text")
            .map(block => block.text)
            .join("");
    } catch (err) {
        if (err instanceof Anthropic.RateLimitError)
            throw new ExplanationRateLimitError();

        throw err;
    }
}

async function explainWithGemini(prompt: string) {
    geminiClient ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    try {
        const response = await geminiClient.models.generateContent({
            model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
            contents: prompt,
            config: {
                systemInstruction: systemPrompt,
                // A few sentences need no reasoning, and thinking is the
                // bulk of the response time
                thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                maxOutputTokens: 400
            }
        });

        return response.text || "";
    } catch (err) {
        if (err instanceof GeminiApiError && err.status == 429)
            throw new ExplanationRateLimitError();

        throw err;
    }
}

/**
 * @description Returns the configured explanation provider, preferring
 * Gemini when both are configured. Checked on each use so that it runs
 * after environment variables have been loaded.
 */
function getExplainer() {
    if (process.env.GEMINI_API_KEY) return explainWithGemini;
    if (process.env.ANTHROPIC_API_KEY) return explainWithClaude;
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
    res.json({ enabled: !!getExplainer() });
});

router.use(path,
    analysisAuthenticator,
    express.json({ limit: "16kb" })
);

router.post(path, async (req, res) => {
    const explain = getExplainer();

    if (!explain) return res.sendStatus(StatusCodes.SERVICE_UNAVAILABLE);

    const parsedRequest = explainRequestSchema.safeParse(req.body);

    if (!parsedRequest.success)
        return res.sendStatus(StatusCodes.BAD_REQUEST);

    try {
        const explanation = (
            await explain(buildPrompt(parsedRequest.data))
        ).trim();

        if (!explanation) throw new EmptyExplanationError();

        res.json({ explanation });
    } catch (err) {
        if (err instanceof ExplanationRateLimitError) {
            return res.sendStatus(StatusCodes.TOO_MANY_REQUESTS);
        } else if (err instanceof EmptyExplanationError) {
            return res.sendStatus(StatusCodes.BAD_GATEWAY);
        }

        console.error("AI explanation failed:", err);
        res.sendStatus(StatusCodes.BAD_GATEWAY);
    }
});

export default router;
