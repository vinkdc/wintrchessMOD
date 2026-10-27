import { create } from "zustand";

import AnalysedGame from "shared/types/game/AnalysedGame";
import PieceColour from "shared/constants/PieceColour";

export type LatestGameStatus = "idle"
    | "loading"
    | "evaluating"
    | "ready"
    | "none"
    | "error";

interface LatestGameStore {
    // Whether preparation has been attempted during this page visit
    started: boolean;
    status: LatestGameStatus;
    game?: AnalysedGame;
    playerColour?: PieceColour;
    progress: number;
    controller?: AbortController;
    // Set once the game is opened, so progress goes to the main analysis
    handedOver: boolean;

    update: (state: Partial<LatestGameStore>) => void;
}

const useLatestGameStore = create<LatestGameStore>(set => ({
    started: false,
    status: "idle",
    progress: 0,
    handedOver: false,

    update(state) {
        set(state);
    }
}));

export default useLatestGameStore;
