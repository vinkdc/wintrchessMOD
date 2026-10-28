import React, { useEffect, useState } from "react";
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
import { explainMoveIdeas } from "shared/lib/reporter/ideas";
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
import useReviewNavigation from "@analysis/hooks/useReviewNavigation";
import useRetry, { retryableClassifications } from "@analysis/hooks/useRetry";
import LogMessage from "@/components/common/LogMessage";
import playBoardSound from "@/lib/boardSounds";
import {
    formatClockTime,
    timePressureSeconds,
    longThinkSeconds
} from "@analysis/lib/clockTime";

import * as styles from "./ClassifiedMoveCard.module.css";

type SentenceCache = WeakMap<StateTreeNode, {
    classification?: Classification;
    sentences: string[];
}>;

const explanationCache: SentenceCache = new WeakMap();
const ideasCache: SentenceCache = new WeakMap();

function getCachedSentences(cache: SentenceCache, node: StateTreeNode) {
    const entry = cache.get(node);

    // A new classification means the explanation may have changed
    if (entry?.classification != node.state.classification) return;

    return entry?.sentences;
}

function computeCachedSentences(
    cache: SentenceCache,
    node: StateTreeNode,
    generate: (node: StateTreeNode) => string[]
) {
    let sentences: string[];

    try {
        sentences = generate(node);
    } catch {
        sentences = [];
    }

    cache.set(node, { classification: node.state.classification, sentences });

    return sentences;
}

const errorClassifications = [
    Classification.INACCURACY,
    Classification.MISTAKE,
    Classification.MISS,
    Classification.BLUNDER
];

// Pause between taking a move back and playing the best move instead
const bestMoveDelayMilliseconds = 1000;

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

    const [ explanationSentences, setExplanationSentences ] = useState<string[]>(
        () => getCachedSentences(explanationCache, node) || []
    );

    // Explanations are slow to generate, so they are produced just after
    // the board has updated rather than while navigating. The previous
    // explanation stays until then, so the card does not flicker.
    useEffect(() => {
        const cached = getCachedSentences(explanationCache, node);

        if (cached) {
            setExplanationSentences(cached);
            return;
        }

        const timeout = setTimeout(() => setExplanationSentences(
            computeCachedSentences(explanationCache, node, explainMove)
        ));

        return () => clearTimeout(timeout);
    }, [node, node.state.classification]);

    // Ideas are only worked out when asked for, using the Explain button
    const [ ideaSentences, setIdeaSentences ] = useState<string[]>();

    useEffect(() => setIdeaSentences(
        getCachedSentences(ideasCache, node)
    ), [node]);

    function showIdeas() {
        setIdeaSentences(
            computeCachedSentences(ideasCache, node, explainMoveIdeas)
        );
    }

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

    const reviewNavigation = useReviewNavigation();

    const retry = useRetry();

    const showRetryButton = !!node.parent
        && !!node.state.classification
        && retryableClassifications.includes(node.state.classification)
        && node.parent.state.engineLines.length > 0;

    function playTopAlternative() {
        if (!node.parent) return;
        if (!topAlternativeMove) return;

        // Come back to this move after exploring the better line
        reviewNavigation.rememberResumePoint(node);
        setAutoplayEnabled(false);

        // Take the played move back first, so the two moves animate
        // one after the other instead of at the same time
        const parent = node.parent;
        const bestMoveSan = topAlternativeMove.san;

        setCurrentStateTreeNode(parent);

        setTimeout(() => {
            // Skip if the user navigated elsewhere in the meantime
            const boardNode = useAnalysisBoardStore.getState()
                .currentStateTreeNode;

            if (boardNode != parent) return;

            const createdNode = addChildMove(parent, bestMoveSan);

            // It is the engine's top move, so there is nothing to classify
            createdNode.state.classification = Classification.BEST;

            setCurrentStateTreeNode(createdNode);
            playBoardSound(createdNode);
        }, bestMoveDelayMilliseconds);
    }

    const evaluation = getTopEngineLine(node.state.engineLines)?.evaluation;

    const { clock, timeSpent } = node.state;

    const isError = !!node.state.classification
        && errorClassifications.includes(node.state.classification);

    // Errors made in time trouble, or after a long think, say so
    let clockNote: string | undefined;

    if (isError && clock != undefined && clock <= timePressureSeconds) {
        clockNote = t("classifiedMoveCard.timePressure", {
            ns: "analysis", clock: formatClockTime(clock)
        });
    } else if (isError && timeSpent != undefined && timeSpent >= longThinkSeconds) {
        clockNote = t("classifiedMoveCard.longThink", {
            ns: "analysis", time: formatClockTime(timeSpent)
        });
    }

    // Blunders hide the answer, so that it can be found with Retry
    const showBestButton = !!topAlternativeMove
        && !!node.state.classification
        && node.state.classification != Classification.BLUNDER
        && topAlternativeMove.san != node.state.move?.san
        && !inalterableClassifications.includes(node.state.classification);

    const showIdeasButton = !ideaSentences
        && !!node.state.classification
        && node.state.engineLines.length > 0;

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

                <div className={styles.badges}>
                    {timeSpent != undefined
                        && <span
                            className={styles.timeBadge}
                            title={t("classifiedMoveCard.timeSpent", { ns: "analysis" })}
                        >
                            ⏱ {formatClockTime(timeSpent)}
                        </span>
                    }

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
            </div>

            {realtimeClassifyError
                && <LogMessage style={{ marginTop: "5px" }}>
                    {t(realtimeClassifyError, { ns: "analysis" })}
                </LogMessage>
            }

            {/* Always rendered with a reserved height, so stepping through
                moves does not make the rest of the panel jump around */}
            <span className={styles.explanation}>
                {node.state.classification && [
                    ...explanationSentences,
                    ...(clockNote ? [clockNote] : [])
                ].join(" ")}
            </span>

            {ideaSentences
                && <span className={styles.aiExplanation}>
                    {ideaSentences.length > 0
                        ? ideaSentences.join(" ")
                        : t("classifiedMoveCard.noIdeas", { ns: "analysis" })
                    }
                </span>
            }

            <div className={styles.actions}>
                {showIdeasButton
                    && <button
                        className={styles.actionButton}
                        onClick={showIdeas}
                    >
                        {t("classifiedMoveCard.explain", { ns: "analysis" })}
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
            </div>

            <div className={styles.navigation}>
                {showRetryButton
                    && <button
                        className={styles.actionButton}
                        onClick={() => retry.start(node)}
                    >
                        {t("classifiedMoveCard.retry", { ns: "analysis" })}
                    </button>
                }

                {reviewNavigation.inVariation
                    ? <button
                        className={`${styles.actionButton} ${styles.primaryAction}`}
                        onClick={reviewNavigation.resume}
                    >
                        ↩ {t("review.resume", { ns: "analysis" })}
                    </button>
                    : (reviewNavigation.hasNextKeyMoment
                        && <button
                            className={`${styles.actionButton} ${styles.primaryAction}`}
                            onClick={reviewNavigation.nextKeyMoment}
                        >
                            {t("classifiedMoveCard.next", { ns: "analysis" })} →
                        </button>
                    )
                }
            </div>
        </div>

        {nearestOpeningName
            && <div className={styles.opening}>
                {nearestOpeningName}
            </div>
        }
    </div>;
}

export default ClassifiedMoveCard;