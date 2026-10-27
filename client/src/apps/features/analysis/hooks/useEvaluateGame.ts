import { useTranslation } from "react-i18next";

import AnalysedGame from "shared/types/game/AnalysedGame";
import AnalysisStatus from "@analysis/constants/AnalysisStatus";
import useSettingsStore from "@/stores/SettingsStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useAnalysisProgressStore from "@analysis/stores/AnalysisProgressStore";
import createGameEvaluator from "../lib/evaluate";

// Use most of the device's cores, leaving one free to keep the page
// responsive. Each single-threaded engine occupies one core.
function getEngineCount() {
    const cores = navigator.hardwareConcurrency || 4;

    return Math.min(8, Math.max(1, cores - 1));
}

function useEvaluateGame() {
    const { t } = useTranslation("analysis");

    const settings = useSettingsStore(
        state => state.settings.analysis.engine
    );

    const dispatchCurrentNodeUpdate = useAnalysisBoardStore(
        state => state.dispatchCurrentNodeUpdate
    );

    const {
        setAnalysisStatus,
        setEvaluationProgress,
        setAnalysisError
    } = useAnalysisProgressStore();

    async function evaluateGame(analysisGame: AnalysedGame) {
        setAnalysisStatus(AnalysisStatus.EVALUATING);

        const evaluator = createGameEvaluator(analysisGame, {
            engineVersion: settings.version,
            engineDepth: settings.depth,
            engineTimeLimit: settings.timeLimitEnabled
                ? settings.timeLimit : undefined,
            cloudEngineLines: settings.lines,
            maxEngineCount: getEngineCount(),
            engineConfig: engine => engine.setLineCount(settings.lines),
            onProgress: progress => {
                setEvaluationProgress(progress);
                dispatchCurrentNodeUpdate();
            }
        });

        evaluator.evaluate()
            .then(() => setAnalysisStatus(
                AnalysisStatus.AWAITING_CAPTCHA
            ))
            .catch(err => {
                if (err == "abort") return;

                console.error(err);
                setAnalysisError(t("analysisError"));
            });

        return evaluator.controller;
    }

    return evaluateGame;
}

export default useEvaluateGame;