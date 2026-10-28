import { Chess } from "chess.js";
import { ParseTree, parseGame } from "@mliebelt/pgn-parser";
import { uniqueId } from "lodash-es";

import Game from "@/types/game/Game";
import { StateTreeNode } from "@/types/game/position/StateTreeNode";
import PieceColour from "@/constants/PieceColour";

type ParsedPGNMove = ParseTree["moves"][number];
type TimeControl = NonNullable<NonNullable<ParseTree["tags"]>["TimeControl"]>;

/**
 * @description Parses a clock comment such as `0:02:59.5` into seconds.
 */
function parseClock(clock?: string) {
    if (!clock) return;

    const seconds = clock.split(":").reduce(
        (total, part) => total * 60 + parseFloat(part), 0
    );

    return isNaN(seconds) ? undefined : seconds;
}

function parseStateTree(game: Game) {
    const parsedPGN = parseGame(game.pgn);

    // Typed as one time control, but parsed as a list of periods
    const timeControlTag: TimeControl | TimeControl[] | undefined = (
        parsedPGN.tags?.TimeControl
    );

    const timeControl = Array.isArray(timeControlTag)
        ? timeControlTag.at(0)
        : timeControlTag;
    const increment = timeControl?.increment || 0;

    function addMovesToNode(
        node: StateTreeNode,
        moves: ParsedPGNMove[],
        mainline: boolean
    ) {
        let lastNode = node;

        for (const pgnMove of moves) {
            const move = new Chess(lastNode.state.fen)
                .move(pgnMove.notation.notation);

            const newNode: StateTreeNode = {
                id: uniqueId(),
                mainline: mainline,
                parent: lastNode,
                children: [],
                state: {
                    fen: move.after,
                    engineLines: [],
                    move: {
                        san: move.san,
                        uci: move.lan
                    },
                    moveColour: move.color == "w"
                        ? PieceColour.WHITE
                        : PieceColour.BLACK
                }
            };

            const clock = parseClock(pgnMove.commentDiag?.clk);

            if (clock != undefined) {
                newNode.state.clock = clock;

                // The mover's clock before this move, or the starting
                // time for each player's first move
                const moverPreviousNode = lastNode.parent;

                const previousClock = moverPreviousNode?.parent
                    ? moverPreviousNode.state.clock
                    : timeControl?.seconds;

                if (previousClock != undefined) {
                    newNode.state.timeSpent = Math.max(
                        0, previousClock - clock + increment
                    );
                }
            }

            lastNode.children.push(newNode);

            for (const variation of pgnMove.variations) {
                addMovesToNode(lastNode, variation, false);
            }

            lastNode = newNode;
        }
    }

    const rootNode: StateTreeNode = {
        id: uniqueId(),
        mainline: true,
        children: [],
        state: {
            fen: game.initialPosition,
            engineLines: []
        }
    };

    addMovesToNode(rootNode, parsedPGN.moves, true);

    return rootNode;
}

export default parseStateTree;