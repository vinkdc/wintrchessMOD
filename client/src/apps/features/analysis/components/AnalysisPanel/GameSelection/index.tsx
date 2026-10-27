import React, { useState } from "react";

import useGameSelector from "@/hooks/useGameSelector";
import useAnalysisProgressStore from "@analysis/stores/AnalysisProgressStore";
import GameSelector from "@/components/chess/GameSelector";
import LogMessage from "@/components/common/LogMessage";

import useImportGame from "@analysis/hooks/useImportGame";
import useEvaluateGame from "@analysis/hooks/useEvaluateGame";
import AnalyseButton from "../../AnalyseButton";
import LatestGameCard from "./LatestGameCard";
import useLatestGameStore from "@analysis/stores/LatestGameStore";
import * as styles from "./GameSelection.module.css";

function GameSelection() {
    const { setSelectedGame } = useGameSelector();

    const setEvaluationController = useAnalysisProgressStore(
        state => state.setEvaluationController
    );

    const [ statusMessage, setStatusMessage ] = useState<string>();
    const [ importError, setImportError ] = useState<string>();

    const importSelectedGame = useImportGame();
    const evaluateGame = useEvaluateGame();

    async function onAnalyseClick() {
        // Free up the engines if the latest game is no longer wanted
        const latest = useLatestGameStore.getState();

        if (!latest.handedOver && latest.status == "evaluating") {
            latest.controller?.abort();
            latest.update({ status: "idle" });
        }

        try {
            var importedGame = await importSelectedGame(setStatusMessage);
        } catch (err) {
            return setImportError((err as Error).message);
        }

        const controller = await evaluateGame(importedGame);

        setEvaluationController(controller);
    }
    
    return <>
        <LatestGameCard/>

        <GameSelector
            saveLocalStorage
            onGameSelect={setSelectedGame}
        />

        <AnalyseButton onClick={onAnalyseClick} />

        {statusMessage && <i className={styles.statusMessage}>
            {statusMessage}
        </i>}

        {importError && <LogMessage>
            {importError}
        </LogMessage>}
    </>;
}

export default GameSelection;