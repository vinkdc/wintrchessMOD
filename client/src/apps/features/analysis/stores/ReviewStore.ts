import { create } from "zustand";

import { StateTreeNode } from "shared/types/game/position/StateTreeNode";

export type RetryStatus = "solving" | "wrong" | "solved" | "revealed";

export interface RetryState {
    // The erroneous move being retried, from the position before it
    mistakeNode: StateTreeNode;
    status: RetryStatus;
    // The move shown for the latest attempt or answer
    attemptNode?: StateTreeNode;
    // SAN of the latest wrong attempt
    wrongMove?: string;
    hintShown: boolean;
}

interface ReviewStore {
    // Root of the game whose review has been started, if any
    reviewedRoot?: StateTreeNode;
    // Mainline move to return to after exploring a variation
    resumeNode?: StateTreeNode;
    // An erroneous move that the player is trying to improve on
    retry?: RetryState;

    startReview: (root: StateTreeNode) => void;
    setResumeNode: (node?: StateTreeNode) => void;
    startRetry: (mistakeNode: StateTreeNode) => void;
    updateRetry: (update: Partial<RetryState>) => void;
    endRetry: () => void;
}

const useReviewStore = create<ReviewStore>(set => ({
    startReview(root) {
        set({ reviewedRoot: root, resumeNode: undefined, retry: undefined });
    },

    setResumeNode(node) {
        set({ resumeNode: node });
    },

    startRetry(mistakeNode) {
        set({
            retry: { mistakeNode, status: "solving", hintShown: false }
        });
    },

    updateRetry(update) {
        set(state => ({
            retry: state.retry && { ...state.retry, ...update }
        }));
    },

    endRetry() {
        set({ retry: undefined });
    }
}));

export default useReviewStore;
