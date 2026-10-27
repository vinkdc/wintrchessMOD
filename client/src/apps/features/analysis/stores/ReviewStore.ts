import { create } from "zustand";

import { StateTreeNode } from "shared/types/game/position/StateTreeNode";

interface ReviewStore {
    // Root of the game whose review has been started, if any
    reviewedRoot?: StateTreeNode;
    // Mainline move to return to after exploring a variation
    resumeNode?: StateTreeNode;

    startReview: (root: StateTreeNode) => void;
    setResumeNode: (node?: StateTreeNode) => void;
}

const useReviewStore = create<ReviewStore>(set => ({
    startReview(root) {
        set({ reviewedRoot: root, resumeNode: undefined });
    },

    setResumeNode(node) {
        set({ resumeNode: node });
    }
}));

export default useReviewStore;
