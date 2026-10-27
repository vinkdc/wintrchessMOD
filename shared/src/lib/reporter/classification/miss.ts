import { StateTreeNode } from "@/types/game/position/StateTreeNode";
import { getTopEngineLine } from "@/types/game/position/EngineLine";
import { adaptPieceColour } from "@/constants/PieceColour";
import { getSubjectiveEvaluation } from "@/lib/utils/chess";
import {
    ExtractedCurrentNode,
    ExtractedPreviousNode
} from "../types/ExtractedNode";
import { getExpectedPoints } from "../expectedPoints";

/**
 * @description Whether an erroneous move should be considered a miss: a
 * forced mate that was not played, or an opponent's error that was not
 * punished, without the position becoming worse than before that error.
 */
export function considerMissClassification(
    node: StateTreeNode,
    previous: ExtractedPreviousNode,
    current: ExtractedCurrentNode
) {
    const moverColour = adaptPieceColour(current.playedMove.color);

    // Expected points from the perspective of the player who moved
    const getMoverPoints = (evaluation: ExtractedCurrentNode["evaluation"]) => (
        getExpectedPoints(
            getSubjectiveEvaluation(evaluation, moverColour),
            { moveColour: moverColour }
        )
    );

    const bestAvailablePoints = getMoverPoints(previous.evaluation);
    const playedPoints = getMoverPoints(current.evaluation);

    const previousSubjective = getSubjectiveEvaluation(
        previous.evaluation, moverColour
    );

    const hadForcedMate = previousSubjective.type == "mate"
        && previousSubjective.value > 0;

    const stillHasForcedMate = current.subjectiveEvaluation.type == "mate"
        && current.subjectiveEvaluation.value > 0;

    if (hadForcedMate && !stillHasForcedMate) {
        return playedPoints >= 0.4;
    }

    // Compare with the position before the opponent's last move
    const opponentPreviousLine = node.parent?.parent
        && getTopEngineLine(node.parent.parent.state.engineLines);

    if (!opponentPreviousLine) return false;

    const pointsBeforeOpponentMove = getMoverPoints(
        opponentPreviousLine.evaluation
    );

    // The opponent's move must have offered a real advantage, rather than
    // only recovering a position that had been losing
    const opponentGiftedAdvantage = (
        bestAvailablePoints - pointsBeforeOpponentMove >= 0.1
        && bestAvailablePoints >= 0.6
    );

    const noWorseThanBeforeGift = (
        playedPoints >= pointsBeforeOpponentMove - 0.05
    );

    return opponentGiftedAdvantage && noWorseThanBeforeGift;
}
