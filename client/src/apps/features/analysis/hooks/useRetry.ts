import { useEffect } from "react";
import { Chess, Move } from "chess.js";

import {
    StateTreeNode,
    addChildMove
} from "shared/types/game/position/StateTreeNode";
import { getTopEngineLine } from "shared/types/game/position/EngineLine";
import { Classification } from "shared/constants/Classification";
import { adaptPieceColour } from "shared/constants/PieceColour";
import { getExpectedPointsLoss } from "shared/lib/reporter/expectedPoints";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useReviewStore, { RetryState } from "@analysis/stores/ReviewStore";
import playBoardSound from "@/lib/boardSounds";

// Moves that can be retried from the move card
export const retryableClassifications = [
    Classification.MISTAKE,
    Classification.MISS,
    Classification.BLUNDER
];

// Expected points that a move may lose and still count as a solution
const solutionPointLossLimit = 0.02;

// How long a wrong attempt stays on the board before being taken back
const wrongMoveMilliseconds = 900;

export function getRetryPosition(retry: RetryState) {
    return retry.mistakeNode.parent!;
}

export function getRetryTopMove(retry: RetryState) {
    const position = getRetryPosition(retry);

    const topUci = getTopEngineLine(position.state.engineLines)
        ?.moves.at(0)?.uci;

    if (!topUci) return;

    try {
        return new Chess(position.state.fen).move(topUci);
    } catch {
        return;
    }
}

/**
 * @description Whether a move is the best move, or close enough to it,
 * according to the engine lines of the position it was played from.
 */
function judgeAttempt(position: StateTreeNode, move: Move) {
    const lines = position.state.engineLines;
    const topLine = getTopEngineLine(lines);

    if (!topLine) return;

    if (topLine.moves.at(0)?.uci == move.lan) return Classification.BEST;

    const attemptLine = lines.find(line => (
        line.depth == topLine.depth
        && line.source == topLine.source
        && line.moves.at(0)?.uci == move.lan
    ));

    if (!attemptLine) return;

    const pointLoss = getExpectedPointsLoss(
        topLine.evaluation,
        attemptLine.evaluation,
        adaptPieceColour(move.color)
    );

    return pointLoss < solutionPointLossLimit
        ? Classification.EXCELLENT
        : undefined;
}

function useRetry() {
    const {
        currentStateTreeNode,
        setCurrentStateTreeNode,
        setAutoplayEnabled
    } = useAnalysisBoardStore();

    const {
        retry,
        startRetry,
        updateRetry,
        endRetry,
        setResumeNode
    } = useReviewStore();

    const active = !!retry && (
        currentStateTreeNode == getRetryPosition(retry)
        || currentStateTreeNode == retry.attemptNode
    );

    // Leaving the retry position by any other means ends the retry
    useEffect(() => {
        if (retry && !active) endRetry();
    }, [currentStateTreeNode, active]);

    function goTo(node: StateTreeNode) {
        setCurrentStateTreeNode(node);
        playBoardSound(node);
    }

    function start(mistakeNode: StateTreeNode) {
        if (!mistakeNode.parent) return;

        if (mistakeNode.mainline) setResumeNode(mistakeNode);

        setAutoplayEnabled(false);
        startRetry(mistakeNode);
        goTo(mistakeNode.parent);
    }

    /**
     * @description Handles a move made on the board during a retry.
     * Returns false when there is no retry for the move to answer.
     */
    function attemptMove(move: Move) {
        if (!retry || !active) return false;
        if (retry.status == "solved" || retry.status == "revealed") return false;

        const position = getRetryPosition(retry);
        if (currentStateTreeNode != position) return false;

        const existed = position.children.some(
            child => child.state.move?.san == move.san
        );

        const attemptNode = addChildMove(position, move.san);
        const classification = judgeAttempt(position, move);

        if (classification) {
            attemptNode.state.classification = classification;

            updateRetry({ status: "solved", attemptNode });
            goTo(attemptNode);

            return true;
        }

        updateRetry({ status: "wrong", attemptNode, wrongMove: move.san });
        goTo(attemptNode);

        // Take the wrong move back, and forget it unless it was already
        // part of the game
        setTimeout(() => {
            const boardNode = useAnalysisBoardStore.getState()
                .currentStateTreeNode;

            if (boardNode != attemptNode) return;

            if (!existed) {
                position.children = position.children.filter(
                    child => child != attemptNode
                );
            }

            setCurrentStateTreeNode(position);
            useReviewStore.getState().updateRetry({ attemptNode: undefined });
        }, wrongMoveMilliseconds);

        return true;
    }

    function showHint() {
        updateRetry({ hintShown: true });
    }

    function showAnswer() {
        if (!retry) return;

        const topMove = getRetryTopMove(retry);
        if (!topMove) return;

        const answerNode = addChildMove(getRetryPosition(retry), topMove.san);
        answerNode.state.classification = Classification.BEST;

        updateRetry({ status: "revealed", attemptNode: answerNode });
        goTo(answerNode);
    }

    // Returns to the move that was retried
    function finish() {
        if (!retry) return;

        const mistakeNode = retry.mistakeNode;

        endRetry();
        setResumeNode(undefined);
        goTo(mistakeNode);
    }

    return {
        retry,
        active,
        start,
        attemptMove,
        showHint,
        showAnswer,
        finish
    };
}

export default useRetry;
