import React, { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Chess } from "chess.js";

import {
    StateTreeNode,
    addChildMove,
    findNodeRecursively
} from "shared/types/game/position/StateTreeNode";
import { Classification } from "shared/constants/Classification";
import { getSimpleNotation } from "shared/lib/utils/chess";
import { getTopEngineLine } from "shared/types/game/position/EngineLine";
import Evaluation from "shared/types/game/position/Evaluation";
import { explainMove } from "shared/lib/reporter/explain";
import {
    classificationColours,
    classificationImages,
    loadingClassificationIcon,
    errorClassificationIcon,
    inalterableClassifications
} from "@analysis/constants/classifications";
import useSettingsStore from "@/stores/SettingsStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useAnalysisProgressStore from "@analysis/stores/AnalysisProgressStore";
import useAIExplanation from "@analysis/hooks/useAIExplanation";
import LogMessage from "@/components/common/LogMessage";
import playBoardSound from "@/lib/boardSounds";

import * as styles from "./ClassifiedMoveCard.module.css";

function getPlayedMove(currentNode: StateTreeNode) {
    if (!currentNode.parent) return;
    if (!currentNode.state.move) return;

    const previousBoard = new Chess(currentNode.parent.state.fen);

    return previousBoard.move(currentNode.state.move.san);
}

function getTopAlternativeMove(currentNode: StateTreeNode) {
    if (!currentNode.parent) return;

    const bestAlternativeUci = getTopEngineLine(
        currentNode.parent.state.engineLines
    )?.moves.at(0)?.uci;

    if (!bestAlternativeUci) return;

    const previousBoard = new Chess(currentNode.parent.state.fen);

    try {
        return previousBoard.move(bestAlternativeUci);
    } catch {
        return;
    }
}

function formatEvaluation(evaluation: Evaluation) {
    if (evaluation.type == "mate") {
        return evaluation.value == 0
            ? "#"
            : `${evaluation.value < 0 ? "-" : ""}M${Math.abs(evaluation.value)}`;
    }

    const pawns = (evaluation.value / 100).toFixed(2);

    return evaluation.value > 0 ? `+${pawns}` : pawns;
}

function ClassifiedMoveCard() {
    const { t } = useTranslation(["common", "analysis"]);

    const { settings } = useSettingsStore();

    const {
        currentStateTreeNode: node,
        setCurrentStateTreeNode,
        setAutoplayEnabled
    } = useAnalysisBoardStore();

    const {
        realtimeClassifyError,
        setRealtimeClassifyError
    } = useAnalysisProgressStore(
        useShallow(state => ({
            realtimeClassifyError: state.realtimeClassifyError,
            setRealtimeClassifyError: state.setRealtimeClassifyError
        }))
    );

    useEffect(() => setRealtimeClassifyError(), [node]);

    const explanationSentences = useMemo(() => {
        try {
            return explainMove(node);
        } catch {
            return [];
        }
    }, [node, node.state.classification]);

    const aiExplanation = useAIExplanation(node);

    const nearestOpeningName = findNodeRecursively(
        node,
        searchNode => !!searchNode.state.opening,
        true
    )?.state.opening;

    const playedMove = getPlayedMove(node);
    const playedMoveMessage = (
        (settings.analysis.simpleNotation && playedMove
            ? getSimpleNotation(playedMove)
            : node.state.move?.san
        )
        + " "
        + t(
            "classifiedMoveCard.classifications."
            + node.state.classification,
            { ns: "analysis" }
        )
    );

    const topAlternativeMove = getTopAlternativeMove(node);

    function playTopAlternative() {
        if (!node.parent) return;
        if (!topAlternativeMove) return;

        const createdNode = addChildMove(node.parent, topAlternativeMove.san);

        setCurrentStateTreeNode(createdNode);
        playBoardSound(createdNode);
    }

    const evaluation = getTopEngineLine(node.state.engineLines)?.evaluation;

    const nextNode = node.children.at(0);

    function goToNextMove() {
        if (!nextNode) return;

        setCurrentStateTreeNode(nextNode);
        setAutoplayEnabled(false);
        playBoardSound(nextNode);
    }

    const showBestButton = !!topAlternativeMove
        && !!node.state.classification
        && topAlternativeMove.san != node.state.move?.san
        && !inalterableClassifications.includes(node.state.classification);

    const showExplainButton = aiExplanation.enabled
        && !!node.state.classification
        && !aiExplanation.explanation;

    return <div className={styles.wrapper}>
        <div
            className={styles.classificationSection}
            style={nearestOpeningName
                ? { borderRadius: "10px 10px 0 0" }
                : undefined
            }
        >
            <div className={styles.header}>
                <div className={styles.classification}>
                    <img src={node.state.classification
                        ? classificationImages[node.state.classification]
                        : (realtimeClassifyError
                            ? errorClassificationIcon
                            : loadingClassificationIcon
                        )
                    }/>

                    <span
                        className={styles.classificationName}
                        style={{
                            color: node.state.classification
                                ? classificationColours[node.state.classification]
                                : (realtimeClassifyError
                                    ? classificationColours[Classification.BLUNDER]
                                    : "white"
                                )
                        }}
                    >
                        {node.state.classification
                            ? playedMoveMessage
                            : (realtimeClassifyError
                                ? t("error") : t("loading")
                            )
                        }
                    </span>
                </div>

                {evaluation
                    && <span className={
                        `${styles.evaluationBadge} ${
                            evaluation.value < 0
                                || (evaluation.type == "mate" && evaluation.value == 0
                                    && node.state.fen.split(" ")[1] == "w")
                                ? styles.blackAdvantage : ""
                        }`
                    }>
                        {formatEvaluation(evaluation)}
                    </span>
                }
            </div>

            {realtimeClassifyError
                && <LogMessage style={{ marginTop: "5px" }}>
                    {t(realtimeClassifyError, { ns: "analysis" })}
                </LogMessage>
            }

            {node.state.classification
                && explanationSentences.length > 0
                && <span className={styles.explanation}>
                    {explanationSentences.join(" ")}
                </span>
            }

            {aiExplanation.explanation
                && <span className={styles.aiExplanation}>
                    {aiExplanation.explanation}
                </span>
            }

            {aiExplanation.status == "error"
                && <LogMessage>
                    {t("classifiedMoveCard.aiError", { ns: "analysis" })}
                </LogMessage>
            }

            {aiExplanation.status == "rateLimited"
                && <LogMessage theme="warn">
                    {t("classifiedMoveCard.aiRateLimited", { ns: "analysis" })}
                </LogMessage>
            }

            {(showExplainButton || showBestButton || nextNode)
                && <div className={styles.actions}>
                    {showExplainButton
                        && <button
                            className={styles.actionButton}
                            disabled={aiExplanation.status == "loading"}
                            onClick={aiExplanation.requestExplanation}
                        >
                            💡 {aiExplanation.status == "loading"
                                ? t("classifiedMoveCard.aiLoading", { ns: "analysis" })
                                : t("classifiedMoveCard.explain", { ns: "analysis" })
                            }
                        </button>
                    }

                    {showBestButton && topAlternativeMove
                        && <button
                            className={styles.actionButton}
                            onClick={playTopAlternative}
                        >
                            ★ {t("classifiedMoveCard.best", { ns: "analysis" })}
                            {" "}
                            <b>
                                {settings.analysis.simpleNotation
                                    ? getSimpleNotation(topAlternativeMove)
                                    : topAlternativeMove.san
                                }
                            </b>
                        </button>
                    }

                    {nextNode
                        && <button
                            className={styles.actionButton}
                            onClick={goToNextMove}
                        >
                            {t("classifiedMoveCard.next", { ns: "analysis" })} →
                        </button>
                    }
                </div>
            }
        </div>

        {nearestOpeningName
            && <div className={styles.opening}>
                {nearestOpeningName}
            </div>
        }
    </div>;
}

export default ClassifiedMoveCard;