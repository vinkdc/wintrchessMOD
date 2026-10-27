import Evaluation from "@/types/game/position/Evaluation";
import { PieceColour, flipPieceColour } from "@/constants/PieceColour";

interface ExpectedPointsOptions {
    moveColour: PieceColour;
    centipawnGradient?: number;
}

const defaultCentipawnGradient = 0.0035;

/**
 * @description Scales the evaluation curve by player rating. Lower rated
 * players convert advantages less reliably, so the same centipawn swing
 * costs them fewer expected points. Calibrated to 1.0x at 2000 rating.
 */
export function getRatingCentipawnGradient(rating?: number) {
    if (!rating) return defaultCentipawnGradient;

    const multiplier = Math.min(1.25, Math.max(0.6,
        1 + (rating - 2000) / 2500
    ));

    return defaultCentipawnGradient * multiplier;
}

export function getExpectedPoints(
    evaluation: Evaluation,
    options?: ExpectedPointsOptions
) {
    const opts = {
        centipawnGradient: defaultCentipawnGradient,
        ...options
    };

    if (evaluation.type == "mate") {
        if (evaluation.value == 0) {
            return Number(opts.moveColour == PieceColour.WHITE);
        }

        return Number(evaluation.value > 0);
    } else {
        return 1 / (1 + Math.exp(
            -opts.centipawnGradient * evaluation.value
        ));
    }
}

export function getExpectedPointsLoss(
    previousEvaluation: Evaluation,
    currentEvaluation: Evaluation,
    moveColour: PieceColour,
    centipawnGradient?: number
) {
    return Math.max(0,
        (
            getExpectedPoints(previousEvaluation, {
                moveColour: flipPieceColour(moveColour),
                centipawnGradient
            })
            - getExpectedPoints(currentEvaluation, {
                moveColour, centipawnGradient
            })
        )
        * (moveColour == PieceColour.WHITE ? 1 : -1)
    );
}