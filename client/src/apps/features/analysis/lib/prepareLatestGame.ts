import i18next from "i18next";

import Game, { getColourPlayed } from "shared/types/game/Game";
import AnalysedGame from "shared/types/game/AnalysedGame";
import { LinkedAccountsResponse } from "shared/types/LinkedAccounts";
import parseStateTree from "shared/lib/stateTree/parse";
import AnalysisStatus from "@analysis/constants/AnalysisStatus";
import useSettingsStore from "@/stores/SettingsStore";
import useLatestGameStore from "@analysis/stores/LatestGameStore";
import useAnalysisProgressStore from "@analysis/stores/AnalysisProgressStore";
import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import getChessComGames from "@/lib/games/chessCom";
import getLichessGames from "@/lib/games/lichess";
import createGameEvaluator from "./evaluate";

type GameFetcher = typeof getChessComGames;

/**
 * @description Fetches the most recent game of a player, looking at the
 * current month and falling back to the previous one.
 */
async function getLatestGame(fetchGames: GameFetcher, username: string) {
    const date = new Date();

    for (let monthsBack = 0; monthsBack < 2; monthsBack++) {
        const month = new Date(date.getFullYear(), date.getMonth() - monthsBack);

        const response = await fetchGames(
            username, month.getMonth() + 1, month.getFullYear()
        ).catch(() => undefined);

        const latestGame = response?.games?.at(0);
        if (latestGame) return latestGame;
    }
}

// Leave half of the cores free so the page stays responsive meanwhile
function getBackgroundEngineCount() {
    return Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2));
}

/**
 * @description Finds the newest game across the user's linked chess
 * accounts and evaluates it in the background. Runs once per page visit.
 */
async function prepareLatestGame() {
    const store = useLatestGameStore.getState();
    if (store.started) return;

    store.update({ started: true, status: "loading" });

    const engineSettings = useSettingsStore.getState().settings.analysis.engine;

    const linksResponse = await fetch("/api/account/links")
        .catch(() => undefined);

    if (!linksResponse?.ok || !engineSettings.enabled)
        return store.update({ status: "none" });

    const links: LinkedAccountsResponse = await linksResponse.json();

    const candidates: { game: Game; username: string }[] = [];

    const [ chessComGame, lichessGame ] = await Promise.all([
        links.chessCom
            ? getLatestGame(getChessComGames, links.chessCom) : undefined,
        links.lichess
            ? getLatestGame(getLichessGames, links.lichess) : undefined
    ]);

    if (chessComGame && links.chessCom)
        candidates.push({ game: chessComGame, username: links.chessCom });

    if (lichessGame && links.lichess)
        candidates.push({ game: lichessGame, username: links.lichess });

    const latest = candidates.sort((a, b) => (
        new Date(b.game.date || 0).getTime()
        - new Date(a.game.date || 0).getTime()
    )).at(0);

    if (!latest) return store.update({ status: "none" });

    const game: AnalysedGame = {
        ...latest.game,
        stateTree: parseStateTree(latest.game)
    };

    const evaluator = createGameEvaluator(game, {
        engineVersion: engineSettings.version,
        engineDepth: engineSettings.depth,
        engineTimeLimit: engineSettings.timeLimitEnabled
            ? engineSettings.timeLimit : undefined,
        cloudEngineLines: engineSettings.lines,
        maxEngineCount: getBackgroundEngineCount(),
        engineConfig: engine => engine.setLineCount(engineSettings.lines),
        onProgress: progress => {
            useLatestGameStore.getState().update({ progress });

            // Once opened, progress drives the main analysis view
            if (useLatestGameStore.getState().handedOver) {
                useAnalysisProgressStore.getState()
                    .setEvaluationProgress(progress);
                useAnalysisBoardStore.getState().dispatchCurrentNodeUpdate();
            }
        }
    });

    store.update({
        status: "evaluating",
        game,
        playerColour: getColourPlayed(latest.game, latest.username),
        controller: evaluator.controller
    });

    evaluator.evaluate()
        .then(() => {
            useLatestGameStore.getState().update({
                status: "ready", progress: 1
            });

            if (useLatestGameStore.getState().handedOver) {
                useAnalysisProgressStore.getState()
                    .setAnalysisStatus(AnalysisStatus.AWAITING_CAPTCHA);
            }
        })
        .catch(err => {
            if (err == "abort") {
                return useLatestGameStore.getState().update({
                    status: "idle", handedOver: false
                });
            }

            useLatestGameStore.getState().update({ status: "error" });

            if (useLatestGameStore.getState().handedOver) {
                useAnalysisProgressStore.getState().setAnalysisError(
                    i18next.t("analysisError", { ns: "analysis" })
                );
            }
        });
}

export default prepareLatestGame;
