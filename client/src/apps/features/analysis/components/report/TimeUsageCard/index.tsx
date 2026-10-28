import React from "react";
import { useTranslation } from "react-i18next";
import { maxBy, meanBy } from "lodash-es";

import { StateTreeNode } from "shared/types/game/position/StateTreeNode";
import { Classification } from "shared/constants/Classification";
import PieceColour from "shared/constants/PieceColour";
import { classificationColours } from "@analysis/constants/classifications";
import {
    formatClockTime,
    timePressureSeconds
} from "@analysis/lib/clockTime";

import * as styles from "./TimeUsageCard.module.css";

interface TimeUsageCardProps {
    rootNode: StateTreeNode;
    onSelectMove?: (node: StateTreeNode) => void;
}

const errorClassifications = [
    Classification.MISTAKE,
    Classification.MISS,
    Classification.BLUNDER
];

const barWidth = 6;
const chartHeight = 80;

function getMainlineMoves(rootNode: StateTreeNode) {
    const moves: StateTreeNode[] = [];

    let current = rootNode.children.find(child => child.mainline);

    while (current) {
        moves.push(current);
        current = current.children.find(child => child.mainline);
    }

    return moves;
}

function getMoveLabel(node: StateTreeNode, index: number) {
    const moveNumber = Math.floor(index / 2) + 1;
    const dots = node.state.moveColour == PieceColour.WHITE ? "." : "...";

    return `${moveNumber}${dots} ${node.state.move?.san}`;
}

function TimeUsageCard({ rootNode, onSelectMove }: TimeUsageCardProps) {
    const { t } = useTranslation("analysis");

    const moves = getMainlineMoves(rootNode);
    const timedMoves = moves.filter(move => move.state.timeSpent != undefined);

    if (timedMoves.length == 0) return null;

    const longestSpent = maxBy(timedMoves, move => move.state.timeSpent)!
        .state.timeSpent!;

    // Bars are scaled to the longest think, with a minimum so that
    // games of quick moves do not look slow
    const scale = Math.max(longestSpent, 10);

    const playerStats = [PieceColour.WHITE, PieceColour.BLACK].map(colour => {
        const playerMoves = timedMoves.filter(
            move => move.state.moveColour == colour
        );

        const longest = maxBy(playerMoves, move => move.state.timeSpent);

        const pressureErrors = playerMoves.filter(move => (
            move.state.clock != undefined
            && move.state.clock <= timePressureSeconds
            && move.state.classification
            && errorClassifications.includes(move.state.classification)
        )).length;

        return {
            colour,
            average: playerMoves.length > 0
                ? meanBy(playerMoves, move => move.state.timeSpent!)
                : undefined,
            longest,
            pressureErrors
        };
    });

    const halfHeight = chartHeight / 2;

    return <div className={styles.wrapper}>
        <span className={styles.title}>{t("timeUsage.title")}</span>

        <svg
            className={styles.chart}
            viewBox={`0 0 ${moves.length * barWidth} ${chartHeight}`}
            preserveAspectRatio="none"
        >
            <line
                x1={0} x2={moves.length * barWidth}
                y1={halfHeight} y2={halfHeight}
                className={styles.axis}
            />

            {moves.map((move, index) => {
                const spent = move.state.timeSpent;
                if (spent == undefined) return null;

                const height = Math.max(
                    1, (spent / scale) * (halfHeight - 2)
                );

                const isWhite = move.state.moveColour == PieceColour.WHITE;

                const classification = move.state.classification;
                const fill = classification
                    && errorClassifications.includes(classification)
                    ? classificationColours[classification]
                    : (isWhite ? "#e8e8e8" : "#6b6f78");

                return <rect
                    key={move.id}
                    className={styles.bar}
                    x={index * barWidth + 1}
                    width={barWidth - 2}
                    y={isWhite ? halfHeight - height : halfHeight}
                    height={height}
                    fill={fill}
                    onClick={() => onSelectMove?.(move)}
                >
                    <title>
                        {`${getMoveLabel(move, index)}: ${formatClockTime(spent)}`}
                    </title>
                </rect>;
            })}
        </svg>

        <span className={styles.hint}>{t("timeUsage.hint")}</span>

        <table className={styles.stats}>
            <thead>
                <tr>
                    <td/>
                    <td>{t("retry.white")}</td>
                    <td>{t("retry.black")}</td>
                </tr>
            </thead>

            <tbody>
                <tr>
                    <td>{t("timeUsage.average")}</td>
                    {playerStats.map(stats => <td key={stats.colour}>
                        {stats.average != undefined
                            ? formatClockTime(stats.average) : "-"
                        }
                    </td>)}
                </tr>

                <tr>
                    <td>{t("timeUsage.longest")}</td>
                    {playerStats.map(stats => <td key={stats.colour}>
                        {stats.longest
                            ? <button
                                className={styles.moveLink}
                                onClick={() => onSelectMove?.(stats.longest!)}
                            >
                                {formatClockTime(stats.longest.state.timeSpent!)}
                                <span className={styles.moveLabel}>
                                    {getMoveLabel(
                                        stats.longest,
                                        moves.indexOf(stats.longest)
                                    )}
                                </span>
                            </button>
                            : "-"
                        }
                    </td>)}
                </tr>

                <tr>
                    <td>{t("timeUsage.pressureErrors")}</td>
                    {playerStats.map(stats => <td
                        key={stats.colour}
                        className={stats.pressureErrors > 0 ? styles.warning : ""}
                    >
                        {stats.pressureErrors}
                    </td>)}
                </tr>
            </tbody>
        </table>
    </div>;
}

export default TimeUsageCard;
