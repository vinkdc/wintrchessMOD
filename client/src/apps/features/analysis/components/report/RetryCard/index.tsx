import React from "react";
import { useTranslation } from "react-i18next";

import { Classification } from "shared/constants/Classification";
import PieceColour from "shared/constants/PieceColour";
import { pieceNames } from "shared/constants/utils";
import {
    classificationColours,
    classificationImages
} from "@analysis/constants/classifications";
import useRetry, { getRetryTopMove } from "@analysis/hooks/useRetry";
import * as styles from "../ClassifiedMoveCard/ClassifiedMoveCard.module.css";

// Laid out like the move card, so switching between them does not jump
function RetryCard() {
    const { t } = useTranslation("analysis");

    const {
        retry,
        showHint,
        showAnswer,
        finish
    } = useRetry();

    if (!retry) return null;

    const mistakeNode = retry.mistakeNode;
    const topMove = getRetryTopMove(retry);
    const attemptSan = retry.attemptNode?.state.move?.san;

    const finished = retry.status == "solved" || retry.status == "revealed";

    const colour = mistakeNode.state.moveColour == PieceColour.WHITE
        ? t("retry.white") : t("retry.black");

    const icon = {
        solving: classificationImages[mistakeNode.state.classification!],
        wrong: classificationImages[Classification.MISTAKE],
        solved: classificationImages[
            retry.attemptNode?.state.classification || Classification.BEST
        ],
        revealed: classificationImages[Classification.BEST]
    }[retry.status];

    const titleColour = {
        solving: "white",
        wrong: classificationColours[Classification.MISTAKE],
        solved: classificationColours[Classification.BEST],
        revealed: classificationColours[Classification.BEST]
    }[retry.status];

    const title = {
        solving: t("retry.title"),
        wrong: t("retry.wrongTitle"),
        solved: t("retry.solvedTitle"),
        revealed: t("retry.revealedTitle")
    }[retry.status];

    let message: string;

    if (retry.status == "solved") {
        message = retry.attemptNode?.state.classification == Classification.BEST
            ? t("retry.solvedBest", { move: attemptSan })
            : t("retry.solvedGood", { move: attemptSan, best: topMove?.san });
    } else if (retry.status == "revealed") {
        message = t("retry.revealed", { move: topMove?.san });
    } else if (retry.status == "wrong") {
        message = retry.wrongMove == mistakeNode.state.move?.san
            ? t("retry.sameMove", { move: retry.wrongMove })
            : t("retry.wrong", { move: retry.wrongMove });
    } else {
        message = t("retry.prompt", {
            move: mistakeNode.state.move?.san,
            colour
        });
    }

    const hintText = retry.hintShown && topMove && !finished
        ? t("retry.hintText", {
            piece: `${pieceNames[topMove.piece].toLowerCase()} on ${topMove.from}`
        })
        : undefined;

    return <div className={styles.wrapper}>
        <div className={styles.classificationSection}>
            <div className={styles.header}>
                <div className={styles.classification}>
                    <img src={icon}/>

                    <span
                        className={styles.classificationName}
                        style={{ color: titleColour }}
                    >
                        {title}
                    </span>
                </div>
            </div>

            <span className={styles.explanation}>
                {message}
                {hintText && <><br/>{hintText}</>}
            </span>

            <div className={styles.actions}>
                {!finished && <>
                    <button
                        className={styles.actionButton}
                        disabled={retry.hintShown}
                        onClick={showHint}
                    >
                        💡 {t("retry.hint")}
                    </button>

                    <button
                        className={styles.actionButton}
                        onClick={showAnswer}
                    >
                        ★ {t("retry.showAnswer")}
                    </button>
                </>}
            </div>

            <div className={styles.navigation}>
                <button
                    className={`${styles.actionButton} ${finished ? styles.primaryAction : ""}`}
                    onClick={finish}
                >
                    {finished
                        ? `${t("retry.continue")} →`
                        : `↩ ${t("retry.cancel")}`
                    }
                </button>
            </div>
        </div>
    </div>;
}

export default RetryCard;
