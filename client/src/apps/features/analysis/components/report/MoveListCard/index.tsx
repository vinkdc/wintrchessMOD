import React, { useEffect, useRef } from "react";
import { Chess } from "chess.js";

import {
    StateTreeNode,
    getNodeChain
} from "shared/types/game/position/StateTreeNode";
import { getSimpleNotation } from "shared/lib/utils/chess";
import {
    classificationColours,
    classificationImages
} from "@analysis/constants/classifications";
import { Classification } from "shared/constants/Classification";
import useSettingsStore from "@/stores/SettingsStore";
import useAnalysisGameStore from "@analysis/stores/AnalysisGameStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import playBoardSound from "@/lib/boardSounds";

import * as styles from "./MoveListCard.module.css";

// Classifications worth flagging with an icon in the move list
const flaggedClassifications = [
    Classification.BRILLIANT,
    Classification.CRITICAL,
    Classification.INACCURACY,
    Classification.MISTAKE,
    Classification.MISS,
    Classification.BLUNDER,
    Classification.RISKY
];

interface MoveRow {
    moveNumber: number;
    white?: StateTreeNode;
    black?: StateTreeNode;
}

function getMoveRows(rootNode: StateTreeNode) {
    const rows: MoveRow[] = [];

    for (const node of getNodeChain(rootNode)) {
        if (!node.parent || !node.state.move) continue;

        // The position before the move gives its number and side
        const [ , turn, , , , fullmove ] = node.parent.state.fen.split(" ");
        const moveNumber = parseInt(fullmove) || 1;

        let row = rows.at(-1);

        if (!row || row.moveNumber != moveNumber || turn == "w") {
            row = { moveNumber };
            rows.push(row);
        }

        if (turn == "w") {
            row.white = node;
        } else {
            row.black = node;
        }
    }

    return rows;
}

function MoveListCard() {
    const simpleNotation = useSettingsStore(
        state => state.settings.analysis.simpleNotation
    );

    const analysisGame = useAnalysisGameStore(state => state.analysisGame);

    const {
        currentStateTreeNode,
        setCurrentStateTreeNode,
        setAutoplayEnabled
    } = useAnalysisBoardStore();

    useAnalysisBoardStore(state => state.currentStateTreeNodeUpdate);

    const listRef = useRef<HTMLDivElement>(null);
    const currentMoveRef = useRef<HTMLSpanElement>(null);

    // Keep the current move in view without scrolling the whole page
    useEffect(() => {
        const list = listRef.current;
        const move = currentMoveRef.current;
        if (!list || !move) return;

        const moveTop = move.offsetTop - list.offsetTop;

        if (
            moveTop < list.scrollTop
            || moveTop + move.offsetHeight > list.scrollTop + list.clientHeight
        ) {
            list.scrollTop = moveTop - list.clientHeight / 2;
        }
    }, [currentStateTreeNode]);

    function selectMove(node: StateTreeNode) {
        if (node != currentStateTreeNode) playBoardSound(node);

        setCurrentStateTreeNode(node);
        setAutoplayEnabled(false);
    }

    function renderMove(node?: StateTreeNode) {
        if (!node?.state.move) return <span/>;

        const classification = node.state.classification;
        const flagged = classification
            && flaggedClassifications.includes(classification);

        const isCurrent = node == currentStateTreeNode;

        let notation = node.state.move.san;

        if (simpleNotation && node.parent) {
            try {
                notation = getSimpleNotation(
                    new Chess(node.parent.state.fen).move(node.state.move.san)
                );
            } catch {}
        }

        return <span
            ref={isCurrent ? currentMoveRef : undefined}
            className={`${styles.move} ${isCurrent ? styles.current : ""}`}
            onClick={() => selectMove(node)}
        >
            {flagged
                ? <img src={classificationImages[classification]}/>
                : <span className={styles.iconSpacer}/>
            }

            <span style={flagged
                ? { color: classificationColours[classification] }
                : undefined
            }>
                {notation}
            </span>
        </span>;
    }

    const rows = getMoveRows(analysisGame.stateTree);

    if (rows.length == 0) return null;

    return <div ref={listRef} className={styles.wrapper}>
        {rows.map(row => <div key={row.moveNumber} className={styles.row}>
            <span className={styles.moveNumber}>{row.moveNumber}.</span>
            {renderMove(row.white)}
            {renderMove(row.black)}
        </div>)}
    </div>;
}

export default MoveListCard;
