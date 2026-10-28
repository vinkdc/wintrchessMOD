import React from "react";
import { useTranslation } from "react-i18next";

import { StateTreeNode } from "shared/types/game/position/StateTreeNode";
import { getGameAccuracy } from "shared/lib/reporter/accuracy";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useReviewStore from "@analysis/stores/ReviewStore";
import playBoardSound from "@/lib/boardSounds";
import AccuraciesCard from "@analysis/components/report/AccuraciesCard";
import ClassificationCountCard from "@analysis/components/report/ClassificationCountCard";
import TimeUsageCard from "@analysis/components/report/TimeUsageCard";
import EvaluationGraphArea from "@analysis/components/AnalysisPanel/GameReport/EvaluationGraphArea";

import * as styles from "./ReviewOverview.module.css";

function ReviewOverview() {
    const { t } = useTranslation("analysis");

    const analysisGame = useAnalysisGameStore(state => state.analysisGame);

    const {
        setCurrentStateTreeNode,
        setAutoplayEnabled
    } = useAnalysisBoardStore();

    useAnalysisBoardStore(state => state.currentStateTreeNodeUpdate);

    const startReview = useReviewStore(state => state.startReview);

    const accuracies = getGameAccuracy(analysisGame.stateTree);

    function reviewFrom(node: StateTreeNode) {
        startReview(analysisGame.stateTree);
        setAutoplayEnabled(false);

        setCurrentStateTreeNode(node);
        playBoardSound(node);
    }

    function onStartReview() {
        // Begin at the first move, so the move card and its controls show
        const firstMove = analysisGame.stateTree.children.find(
            child => child.mainline
        ) || analysisGame.stateTree.children.at(0);

        reviewFrom(firstMove || analysisGame.stateTree);
    }

    return <>
        <div className={styles.intro}>
            {t("review.intro")}
        </div>

        <EvaluationGraphArea/>

        <AccuraciesCard accuracies={accuracies} />

        <ClassificationCountCard analysisGame={analysisGame} />

        <TimeUsageCard
            rootNode={analysisGame.stateTree}
            onSelectMove={reviewFrom}
        />

        <button className={styles.startButton} onClick={onStartReview}>
            {t("review.start")}
        </button>
    </>;
}

export default ReviewOverview;
