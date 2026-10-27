import { useEffect, useRef } from "react";

import { StateTreeNode } from "shared/types/game/position/StateTreeNode";
import { Classification } from "shared/constants/Classification";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import useReviewStore from "@analysis/stores/ReviewStore";
import playBoardSound from "@/lib/boardSounds";

// Moves that the review stops at when skipping forward
const keyMomentClassifications = [
    Classification.BRILLIANT,
    Classification.CRITICAL,
    Classification.MISTAKE,
    Classification.BLUNDER
];

// Delay between moves while skipping forward to a key moment
const skipStepMilliseconds = 180;

function getMainlineChild(node: StateTreeNode) {
    return node.children.find(child => child.mainline)
        || node.children.at(0);
}

/**
 * @description Returns the moves from after the given node up to and
 * including the next key moment, or to the end of the game.
 */
function getPathToNextKeyMoment(node: StateTreeNode) {
    const path: StateTreeNode[] = [];

    let current = getMainlineChild(node);

    while (current) {
        path.push(current);

        if (
            current.state.classification
            && keyMomentClassifications.includes(current.state.classification)
        ) break;

        current = getMainlineChild(current);
    }

    return path;
}

function getNearestMainlineNode(node: StateTreeNode) {
    let current: StateTreeNode | undefined = node;

    while (current && !current.mainline) current = current.parent;

    return current;
}

function useReviewNavigation() {
    const {
        currentStateTreeNode,
        setCurrentStateTreeNode,
        setAutoplayEnabled
    } = useAnalysisBoardStore();

    const { resumeNode, setResumeNode } = useReviewStore();

    // Incremented to cancel an in-progress skip
    const skipId = useRef(0);

    // Cancel any in-progress skip on unmount
    useEffect(() => () => {
        skipId.current++;
    }, []);

    function goTo(node: StateTreeNode) {
        setCurrentStateTreeNode(node);
        playBoardSound(node);
    }

    function nextKeyMoment() {
        const path = getPathToNextKeyMoment(currentStateTreeNode);
        if (path.length == 0) return;

        setAutoplayEnabled(false);

        const id = ++skipId.current;
        let expectedNode = currentStateTreeNode;

        path.forEach((node, index) => {
            setTimeout(() => {
                // Stop if superseded, or if the user moved elsewhere
                if (skipId.current != id) return;

                const boardNode = useAnalysisBoardStore.getState()
                    .currentStateTreeNode;

                if (boardNode != expectedNode) {
                    skipId.current++;
                    return;
                }

                expectedNode = node;
                goTo(node);
            }, index * skipStepMilliseconds);
        });
    }

    const inVariation = !currentStateTreeNode.mainline;

    function resume() {
        skipId.current++;

        const target = resumeNode || getNearestMainlineNode(currentStateTreeNode);
        if (!target) return;

        setResumeNode(undefined);
        setAutoplayEnabled(false);
        goTo(target);
    }

    return {
        hasNextKeyMoment: !!getMainlineChild(currentStateTreeNode),
        inVariation,
        nextKeyMoment,
        resume,
        rememberResumePoint: (node: StateTreeNode) => {
            if (node.mainline) setResumeNode(node);
        }
    };
}

export default useReviewNavigation;
