import React, { lazy } from "react";
import { useTranslation } from "react-i18next";

import AnalysisTab from "@analysis/constants/AnalysisTab";
import AnalysisStatus from "@analysis/constants/AnalysisStatus";
import useSettingsStore from "@/stores/SettingsStore";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useAnalysisTabStore from "@analysis/stores/AnalysisTabStore";
import useAnalysisProgressStore from "@analysis/stores/AnalysisProgressStore";
import useReviewStore from "@analysis/stores/ReviewStore";
import useRetry from "@analysis/hooks/useRetry";
import ClassifiedMoveCard from "@analysis/components/report/ClassifiedMoveCard";
import ReviewOverview from "@analysis/components/report/ReviewOverview";
import RetryCard from "@analysis/components/report/RetryCard";
import StateTreeTraverser from "@/components/chess/StateTreeTraverser";

import TabBar from "./TabBar";
import AnalysisProgress from "./AnalysisProgress";
import RealtimeEngineArea from "./RealtimeEngineArea";

import GameSelection from "./GameSelection";
import GameReport from "./GameReport";
import EvaluationGraphArea from "./GameReport/EvaluationGraphArea";
import GameAnalysis from "./GameAnalysis";

import AnalysisPanelProps from "./AnalysisPanelProps";
import * as styles from "./AnalysisPanel.module.css";

const OptionsToolbar = lazy(() => import("@analysis/components/OptionsToolbar"));

function AnalysisPanel({
    className,
    style
}: AnalysisPanelProps) {
    const { t } = useTranslation("analysis");

    const settings = useSettingsStore(state => state.settings.analysis);

    const gameAnalysisOpen = useAnalysisGameStore(
        state => state.gameAnalysisOpen
    );

    const currentNode = useAnalysisBoardStore(
        state => state.currentStateTreeNode
    );

    const { activeTab } = useAnalysisTabStore();

    const analysisRoot = useAnalysisGameStore(
        state => state.analysisGame.stateTree
    );

    const scanning = useAnalysisProgressStore(
        state => state.analysisStatus != AnalysisStatus.INACTIVE
    );

    const reviewStarted = useReviewStore(
        state => state.reviewedRoot == analysisRoot
    );

    // The report tab moves from scanning, to an overview, to the review
    const retryActive = useRetry().active;

    const reportStage = scanning
        ? "scanning"
        : (reviewStarted ? "review" : "overview");

    const reviewing = activeTab != AnalysisTab.REPORT || reportStage == "review";
    
    return <div
        className={`${styles.wrapper} ${className}`}
        style={style}
    >
        <div className={styles.components}>
            <div className={styles.title}>
                {t("title")}
            </div>

            <OptionsToolbar/>

            {gameAnalysisOpen && <TabBar/>}

            <AnalysisProgress/>

            {(gameAnalysisOpen && settings.engine.enabled && reviewing)
                && <RealtimeEngineArea/>
            }

            {gameAnalysisOpen && reviewing && retryActive
                && <RetryCard/>
            }

            {gameAnalysisOpen
                && reviewing
                && !retryActive
                && currentNode.state.move
                && !settings.classifications.hide
                && (
                    settings.engine.enabled
                    || currentNode.state.classification
                )
                && <ClassifiedMoveCard/>
            }

            {gameAnalysisOpen
                ? (activeTab == AnalysisTab.REPORT
                    ? {
                        scanning: <EvaluationGraphArea/>,
                        overview: <ReviewOverview/>,
                        review: <GameReport/>
                    }[reportStage]
                    : <GameAnalysis/>
                )
                : <GameSelection/>
            }
        </div>

        <div className={styles.traverserContainer}>
            <StateTreeTraverser className={styles.traverser} />
        </div>
    </div>;
}

export default AnalysisPanel;