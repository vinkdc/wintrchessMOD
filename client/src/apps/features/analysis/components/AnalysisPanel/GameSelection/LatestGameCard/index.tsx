import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

import PieceColour, { flipPieceColour } from "shared/constants/PieceColour";
import { GameResult } from "shared/constants/game/GameResult";
import AnalysisStatus from "@analysis/constants/AnalysisStatus";
import useLatestGameStore from "@analysis/stores/LatestGameStore";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useAnalysisProgressStore from "@analysis/stores/AnalysisProgressStore";
import prepareLatestGame from "@analysis/lib/prepareLatestGame";

import * as styles from "./LatestGameCard.module.css";

const resultColours: Record<GameResult, string> = {
    [GameResult.WIN]: "#98bc49",
    [GameResult.DRAW]: "#b3b6bb",
    [GameResult.LOSE]: "#e05a4f",
    [GameResult.UNKNOWN]: "#b3b6bb"
};

function LatestGameCard() {
    const { t } = useTranslation("analysis");

    const latest = useLatestGameStore();

    const { setAnalysisGame, setGameAnalysisOpen } = useAnalysisGameStore();

    const {
        setCurrentStateTreeNode,
        setBoardFlipped
    } = useAnalysisBoardStore();

    const {
        setAnalysisStatus,
        setEvaluationProgress,
        setEvaluationController
    } = useAnalysisProgressStore();

    useEffect(() => {
        prepareLatestGame();
    }, []);

    if (
        !latest.game
        || !latest.playerColour
        || !["evaluating", "ready"].includes(latest.status)
    ) return null;

    const player = latest.game.players[latest.playerColour];
    const opponent = latest.game.players[flipPieceColour(latest.playerColour)];
    const result = player.result || GameResult.UNKNOWN;

    function openReview() {
        if (!latest.game) return;

        setAnalysisGame(latest.game);
        setCurrentStateTreeNode(latest.game.stateTree);
        setBoardFlipped(latest.playerColour == PieceColour.BLACK);
        setGameAnalysisOpen(true);

        if (latest.status == "ready") {
            // Evaluations are done, so go straight to classification
            setAnalysisStatus(AnalysisStatus.AWAITING_CAPTCHA);
        } else {
            // Continue the background evaluation in the main view
            latest.update({ handedOver: true });
            setEvaluationController(latest.controller);
            setEvaluationProgress(latest.progress);
            setAnalysisStatus(AnalysisStatus.EVALUATING);
        }
    }

    return <div className={styles.wrapper}>
        <span className={styles.title}>
            {t("latestGame.title")}
        </span>

        <div className={styles.matchup}>
            <span>
                {t("latestGame.versus", {
                    opponent: opponent.username || "?",
                    rating: opponent.rating ? ` (${opponent.rating})` : ""
                })}
            </span>

            <b style={{ color: resultColours[result] }}>
                {t(`latestGame.results.${result}`)}
            </b>
        </div>

        <span className={styles.status}>
            {latest.status == "ready"
                ? t("latestGame.ready")
                : t("latestGame.preparing", {
                    progress: Math.round(latest.progress * 100)
                })
            }
        </span>

        <div className={styles.progressTrack}>
            <div
                className={styles.progressFill}
                style={{ width: `${Math.round(latest.progress * 100)}%` }}
            />
        </div>

        <button className={styles.reviewButton} onClick={openReview}>
            {t("latestGame.review")}
        </button>
    </div>;
}

export default LatestGameCard;
