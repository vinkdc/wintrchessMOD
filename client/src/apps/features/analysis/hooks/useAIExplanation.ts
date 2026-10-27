import { useState, useEffect, useMemo, useRef } from "react";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { StatusCodes } from "http-status-codes";
import { WHITE } from "chess.js";

import { StateTreeNode } from "shared/types/game/position/StateTreeNode";
import { getTopEngineLine } from "shared/types/game/position/EngineLine";
import { explainMove } from "shared/lib/reporter/explain";
import { useAltcha } from "@/apps/features/analysis/hooks/useAltcha";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";

// Explanations already generated this session, keyed by node ID
const explanationCache = new Map<string, string>();

type AIExplanationStatus = "idle" | "loading" | "error";

function useAIExplanation(node: StateTreeNode) {
    const executeCaptcha = useAltcha();

    const players = useAnalysisGameStore(
        state => state.analysisGame.players
    );

    const queryClient = useMemo(() => new QueryClient(), []);

    const { data: aiStatus } = useQuery({
        queryKey: ["aiStatus"],
        queryFn: async () => {
            const statusResponse = await fetch("/api/analysis/ai-status");
            return await statusResponse.json() as { enabled: boolean };
        },
        retry: false,
        refetchOnWindowFocus: false
    }, queryClient);

    const [ explanation, setExplanation ] = useState<string>();
    const [ status, setStatus ] = useState<AIExplanationStatus>("idle");

    const currentNodeId = useRef(node.id);

    useEffect(() => {
        currentNodeId.current = node.id;
        setExplanation(explanationCache.get(node.id));
        setStatus("idle");
    }, [node]);

    async function requestExplanation() {
        if (!node.parent || !node.state.move || !node.state.classification)
            return;

        const previousTopLine = getTopEngineLine(node.parent.state.engineLines);
        const currentTopLine = getTopEngineLine(node.state.engineLines);

        if (!previousTopLine || !currentTopLine) return setStatus("error");

        setStatus("loading");

        const moverIsWhite = node.parent.state.fen.split(" ")[1] == WHITE;

        const explainResponse = await fetch("/api/analysis/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fen: node.parent.state.fen,
                move: node.state.move.san,
                classification: node.state.classification,
                rating: moverIsWhite
                    ? players.white.rating
                    : players.black.rating,
                evaluationBefore: previousTopLine.evaluation,
                evaluationAfter: currentTopLine.evaluation,
                bestLine: previousTopLine.moves.slice(0, 8).map(m => m.san),
                replyLine: currentTopLine.moves.slice(0, 8).map(m => m.san),
                facts: explainMove(node)
            })
        }).catch(() => undefined);

        const requestedNodeId = node.id;
        const isStale = () => currentNodeId.current != requestedNodeId;

        // An expired analysis session needs a new CAPTCHA solve first
        if (explainResponse?.status == StatusCodes.UNAUTHORIZED) {
            executeCaptcha();
            if (!isStale()) setStatus("error");
            return;
        }

        if (!explainResponse?.ok) {
            if (!isStale()) setStatus("error");
            return;
        }

        const { explanation: newExplanation } = await explainResponse.json();

        explanationCache.set(requestedNodeId, newExplanation);
        if (isStale()) return;

        setExplanation(newExplanation);
        setStatus("idle");
    }

    return {
        enabled: !!aiStatus?.enabled,
        explanation,
        status,
        requestExplanation
    };
}

export default useAIExplanation;
