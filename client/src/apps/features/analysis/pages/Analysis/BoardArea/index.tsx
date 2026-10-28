import React from "react";
import { Move } from "chess.js";

import { addChildMove } from "shared/types/game/position/StateTreeNode";
import AnalysisTab from "@analysis/constants/AnalysisTab";
import AnalysisStatus from "@analysis/constants/AnalysisStatus";
import useSettingsStore from "@/stores/SettingsStore";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import useAnalysisTabStore from "@analysis/stores/AnalysisTabStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useAnalysisProgressStore from "@analysis/stores/AnalysisProgressStore";
import useRetry from "@analysis/hooks/useRetry";
import Board from "@analysis/components/Board";
import playBoardSound from "@/lib/boardSounds";

import useEvaluation from "./useEvaluation";
import useSuggestionArrows from "./useSuggestionArrows";
import * as styles from "./BoardArea.module.css";

function BoardArea() {
    const settings = useSettingsStore(state => state.settings.analysis);
    const theme = useSettingsStore(state => state.settings.themes);

    const {
        analysisGame,
        gameAnalysisOpen,
        setGameAnalysisOpen
    } = useAnalysisGameStore();

    const setActiveTab = useAnalysisTabStore(state => state.setActiveTab);

    const {
        currentStateTreeNode,
        setCurrentStateTreeNode,
        dispatchCurrentNodeUpdate,
        autoplayEnabled,
        boardFlipped
    } = useAnalysisBoardStore();

    // Moves cannot be made while the game is being scanned
    const scanning = useAnalysisProgressStore(
        state => state.analysisStatus != AnalysisStatus.INACTIVE
    );

    const evaluation = useEvaluation();
    const suggestionArrows = useSuggestionArrows();

    const retry = useRetry();

    // Arrows would give away the answer while retrying a move
    const retrySolving = retry.active
        && (retry.retry?.status == "solving" || retry.retry?.status == "wrong");

    function addMove(move: Move) {
        if (retry.attemptMove(move)) return true;

        if (!gameAnalysisOpen) {
            setGameAnalysisOpen(true);
            setActiveTab(AnalysisTab.ANALYSIS);
        }

        setCurrentStateTreeNode(prev => {
            const createdNode = addChildMove(prev, move.san);
            playBoardSound(createdNode);

            return createdNode;
        });

        dispatchCurrentNodeUpdate();

        return true;
    }

    return <Board
        className={styles.board}
        style={{
            maxWidth: `calc(100vh - ${evaluation ? 195 : 235}px)`
        }}
        profileClassName={styles.boardProfile}
        whiteProfile={analysisGame.players.white}
        blackProfile={analysisGame.players.black}
        theme={{
            lightSquareColour: theme.board.lightSquareColour,
            darkSquareColour: theme.board.darkSquareColour
        }}
        node={currentStateTreeNode}
        flipped={boardFlipped}
        evaluation={evaluation}
        arrows={retrySolving ? [] : suggestionArrows}
        piecesDraggable={!autoplayEnabled}
        movesLocked={scanning}
        enableClassifications={!settings.classifications.hide}
        onAddMove={addMove}
    />;
}

export default BoardArea;