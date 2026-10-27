import { Move } from "chess.js";

import { StateTreeNode } from "@/types/game/position/StateTreeNode";
import Evaluation from "@/types/game/position/Evaluation";
import { Classification } from "@/constants/Classification";
import { adaptPieceColour } from "@/constants/PieceColour";
import { pieceNames } from "@/constants/utils";
import { getSubjectiveEvaluation } from "@/lib/utils/chess";
import { BoardPiece } from "./types/BoardPiece";
import {
    extractPreviousStateTreeNode,
    extractCurrentStateTreeNode
} from "./utils/extractNode";
import { getOpeningName } from "./utils/opening";
import { getUnsafePieces } from "./utils/pieceSafety";

const errorClassifications = [
    Classification.INACCURACY,
    Classification.MISTAKE,
    Classification.MISS,
    Classification.BLUNDER
];

function describePiece(piece: Pick<BoardPiece, "type" | "square">) {
    return `${pieceNames[piece.type].toLowerCase()} on ${piece.square}`;
}

/**
 * @description Describes an evaluation from the perspective of the
 * player that it is subjective to.
 */
function describeEvaluation(evaluation: Evaluation) {
    if (evaluation.type == "mate") {
        return evaluation.value > 0
            ? `a forced mate in ${evaluation.value}`
            : `being mated in ${Math.abs(evaluation.value)}`;
    }

    const pawns = (evaluation.value / 100).toFixed(1);
    const signedPawns = evaluation.value > 0 ? `+${pawns}` : pawns;

    if (evaluation.value >= 300) return `winning (${signedPawns})`;
    if (evaluation.value >= 100) return `better (${signedPawns})`;
    if (evaluation.value > -100) return `roughly equal (${signedPawns})`;
    if (evaluation.value > -300) return `worse (${signedPawns})`;

    return `losing (${signedPawns})`;
}

function describeReply(reply: Move) {
    if (reply.san.endsWith("#")) {
        return `Your opponent can reply ${reply.san}, which is checkmate.`;
    }

    if (reply.captured) {
        return `Your opponent can reply ${reply.san}, winning your `
            + `${describePiece({ type: reply.captured, square: reply.to })}.`;
    }

    return `Your opponent's best reply is ${reply.san}.`;
}

/**
 * @description Generates plain-language sentences explaining why a move
 * received its classification, using the board and engine lines.
 * Returns an empty list if there is not enough analysis data.
 */
export function explainMove(node: StateTreeNode): string[] {
    if (!node.parent) return [];

    const classification = node.state.classification;
    if (!classification) return [];

    if (classification == Classification.FORCED) {
        return ["This was the only legal move."];
    }

    if (classification == Classification.THEORY) {
        const openingName = getOpeningName(node.state.fen);

        return [openingName
            ? `A known opening move in the ${openingName}.`
            : "A known opening move."
        ];
    }

    const previous = extractPreviousStateTreeNode(node.parent);
    const current = extractCurrentStateTreeNode(node);

    if (!previous || !current) return [];

    const moverColour = adaptPieceColour(current.playedMove.color);
    const playedMove = current.playedMove;

    if (current.board.isCheckmate()) {
        return ["Checkmate! This move ends the game."];
    }

    const sentences: string[] = [];

    if (playedMove.captured) {
        sentences.push(`Captures the ${describePiece({
            type: playedMove.captured,
            square: playedMove.to
        })}.`);
    }

    const previousEvaluation = getSubjectiveEvaluation(
        previous.evaluation, moverColour
    );
    const currentEvaluation = current.subjectiveEvaluation;

    const previousUnsafePieces = getUnsafePieces(previous.board, moverColour);
    const unsafePieces = getUnsafePieces(
        current.board, moverColour, playedMove
    );

    const newlyUnsafePieces = unsafePieces.filter(piece => (
        !previousUnsafePieces.some(previousPiece => (
            previousPiece.square == piece.square
        ))
        || piece.square == playedMove.to
    ));

    if (classification == Classification.BRILLIANT) {
        const sacrificedPiece = newlyUnsafePieces.at(0) || unsafePieces.at(0);

        sentences.push(sacrificedPiece
            ? `A sacrifice! Your ${describePiece(sacrificedPiece)} can be `
                + "taken, but accepting it is bad for your opponent."
            : "A sacrifice that your opponent cannot profitably accept."
        );
    } else if (classification == Classification.CRITICAL) {
        sentences.push(
            "A great find: this was the only move that keeps your position"
            + " - the alternatives are clearly worse."
        );
    } else if (errorClassifications.includes(classification)) {
        if (classification == Classification.MISS) {
            sentences.push(
                "You missed a chance to punish your opponent's last move."
            );
        }

        // Missed forced mate
        if (
            previousEvaluation.type == "mate"
            && previousEvaluation.value > 0
            && !(currentEvaluation.type == "mate" && currentEvaluation.value > 0)
        ) {
            sentences.push(
                `You missed ${describeEvaluation(previousEvaluation)},`
                + ` starting with ${previous.topMove.san}.`
            );
        }

        // Allowing a forced mate
        if (currentEvaluation.type == "mate" && currentEvaluation.value < 0) {
            sentences.push(
                "This allows your opponent to force checkmate in "
                + `${Math.abs(currentEvaluation.value)}.`
            );
        } else if (
            newlyUnsafePieces.length > 0
            // The reply sentence already covers a piece that gets captured
            && current.topMove?.to != newlyUnsafePieces[0].square
        ) {
            sentences.push(
                `This leaves your ${describePiece(newlyUnsafePieces[0])}`
                + " undefended."
            );
        }

        if (current.topMove) {
            sentences.push(describeReply(current.topMove));
        }

        sentences.push(
            `Your position goes from ${describeEvaluation(previousEvaluation)}`
            + ` to ${describeEvaluation(currentEvaluation)}.`
        );
    } else {
        sentences.push(
            `Your position is ${describeEvaluation(currentEvaluation)}.`
        );
    }

    return sentences;
}
