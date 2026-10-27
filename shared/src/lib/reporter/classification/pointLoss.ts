import { WHITE } from "chess.js";

import {
    ExtractedCurrentNode,
    ExtractedPreviousNode
} from "../types/ExtractedNode";
import { Classification } from "@/constants/Classification";
import { adaptPieceColour } from "@/constants/PieceColour";
import {
    getExpectedPointsLoss,
    getRatingCentipawnGradient
} from "../expectedPoints";

/**
 * @description Classify using two evaluations and a move colour,
 * using expected point losses or mate losses. The rating of the player
 * who moved, if known, adjusts how costly an evaluation swing is.
 */
export function pointLossClassify(
    previous: ExtractedPreviousNode,
    current: ExtractedCurrentNode,
    rating?: number
) {
    const previousSubjectiveValue = previous.evaluation.value * (
        (current.playedMove.color == WHITE ? 1 : -1)
    );

    const subjectiveValue = current.subjectiveEvaluation.value;

    // Mate to mate evaluations
    if (
        previous.evaluation.type == "mate"
        && current.evaluation.type == "mate"
    ) {
        // Winning mate to losing mate
        if (previousSubjectiveValue > 0 && subjectiveValue < 0) {
            return subjectiveValue < -3
                ? Classification.MISTAKE
                : Classification.BLUNDER;
        }

        // For the losing side, making a move that keeps the mate the same
        // is best. Only the winning side expects a mate loss of -1.
        const mateLoss = (
            (current.evaluation.value - previous.evaluation.value)
            * (current.playedMove.color == WHITE ? 1 : -1)
        );

        if (mateLoss < 0 || (mateLoss == 0 && subjectiveValue < 0)) {
            return Classification.BEST;
        } else if (mateLoss < 2) {
            return Classification.EXCELLENT;
        } else if (mateLoss < 7) {
            return Classification.OKAY;
        } else {
            return Classification.INACCURACY;
        }
    }

    // Mate to centipawn evaluations
    if (
        previous.evaluation.type == "mate"
        && current.evaluation.type == "centipawn"
    ) {
        if (subjectiveValue >= 800) {
            return Classification.EXCELLENT;
        } else if (subjectiveValue >= 400) {
            return Classification.OKAY;
        } else if (subjectiveValue >= 200) {
            return Classification.INACCURACY;
        } else if (subjectiveValue >= 0) {
            return Classification.MISTAKE;
        } else {
            return Classification.BLUNDER;
        }
    }

    // Centipawn to mate evaluations
    if (
        previous.evaluation.type == "centipawn"
        && current.evaluation.type == "mate"
    ) {
        if (subjectiveValue > 0) {
            return Classification.BEST;
        } else if (subjectiveValue >= -2) {
            return Classification.BLUNDER;
        } else if (subjectiveValue >= -5) {
            return Classification.MISTAKE;
        } else {
            return Classification.INACCURACY;
        }
    }

    // Centipawn to centipawn evaluations
    const pointLoss = getExpectedPointsLoss(
        previous.evaluation,
        current.evaluation,
        adaptPieceColour(current.playedMove.color),
        getRatingCentipawnGradient(rating)
    );

    // Cutoffs follow Chess.com's published expected points table
    if (pointLoss < 0.005) {
        return Classification.BEST;
    } else if (pointLoss < 0.02) {
        return Classification.EXCELLENT;
    } else if (pointLoss < 0.05) {
        return Classification.OKAY;
    } else if (pointLoss < 0.1) {
        return Classification.INACCURACY;
    } else if (pointLoss < 0.2) {
        return Classification.MISTAKE;
    } else {
        return Classification.BLUNDER;
    }
}