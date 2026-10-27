import { Chess, Move, KING, PAWN } from "chess.js";

import { StateTreeNode } from "@/types/game/position/StateTreeNode";
import Evaluation from "@/types/game/position/Evaluation";
import { Classification } from "@/constants/Classification";
import {
    PieceColour,
    adaptPieceColour,
    flipPieceColour
} from "@/constants/PieceColour";
import { pieceNames, pieceValues } from "@/constants/utils";
import {
    getCaptureSquare,
    getSubjectiveEvaluation,
    setFenTurn
} from "@/lib/utils/chess";
import { BoardPiece, getBoardPieces } from "./types/BoardPiece";
import {
    extractPreviousStateTreeNode,
    extractCurrentStateTreeNode
} from "./utils/extractNode";
import { getAttackingMoves } from "./utils/attackers";
import { getUnsafePieces, isPieceSafe } from "./utils/pieceSafety";

const errorClassifications = [
    Classification.INACCURACY,
    Classification.MISTAKE,
    Classification.MISS,
    Classification.BLUNDER
];

function describePiece(piece: Pick<BoardPiece, "type" | "square">) {
    return piece.type == KING
        ? "king"
        : `${pieceNames[piece.type].toLowerCase()} on ${piece.square}`;
}

/**
 * @description Returns a move that would deliver checkmate if the player
 * who just moved could move again, i.e. a mate threat.
 */
function findMateThreat(board: Chess, moverColour: PieceColour) {
    if (board.isCheck()) return;

    try {
        const threatBoard = new Chess(setFenTurn(board.fen(), moverColour));

        return threatBoard.moves({ verbose: true }).find(threat => {
            const afterThreat = new Chess(threatBoard.fen());
            afterThreat.move(threat);

            return afterThreat.isCheckmate();
        });
    } catch {
        return;
    }
}

function joinPhrases(phrases: string[]) {
    if (phrases.length <= 1) return phrases.join("");

    return phrases.slice(0, -1).join(", ") + " and " + phrases.at(-1);
}

/**
 * @description Describes what a move sets out to achieve: checkmate,
 * winning material, forks, new threats, saving pieces and so on. Returns
 * short phrases that complete the sentence "This move ...".
 */
export function describeMoveIdea(
    fen: string,
    san: string,
    evaluation?: Evaluation
): string[] {
    const board = new Chess(fen);

    let move: Move;

    try {
        move = board.move(san);
    } catch {
        return [];
    }

    if (board.isCheckmate()) return ["delivers checkmate"];

    const previousBoard = new Chess(fen);
    const moverColour = adaptPieceColour(move.color);
    const opponentColour = flipPieceColour(moverColour);

    const ideas: string[] = [];

    const subjectiveEvaluation = evaluation
        && getSubjectiveEvaluation(evaluation, moverColour);

    if (
        subjectiveEvaluation?.type == "mate"
        && subjectiveEvaluation.value > 0
    ) {
        ideas.push(
            `starts a forced checkmate in ${subjectiveEvaluation.value}`
        );
    }

    if (move.isKingsideCastle() || move.isQueensideCastle()) {
        ideas.push("castles to bring the king to safety");
    }

    if (move.promotion) {
        ideas.push(`promotes to a ${pieceNames[move.promotion].toLowerCase()}`);
    }

    if (move.captured) {
        const capturedPiece: BoardPiece = {
            type: move.captured,
            color: adaptPieceColour(opponentColour),
            square: getCaptureSquare(move)
        };

        ideas.push(isPieceSafe(previousBoard, capturedPiece)
            ? `trades by taking the ${describePiece(capturedPiece)}`
            : `wins the ${describePiece(capturedPiece)}`
        );
    }

    // Opponent pieces that the moved piece now attacks and that matter:
    // the king, more valuable pieces, or pieces left undefended. Pawns
    // are left out, as attacking them is rarely the point of a move.
    const movedPieceType = move.promotion || move.piece;

    const targets = getBoardPieces(board).filter(piece => (
        piece.color != move.color
        && piece.type != PAWN
        && getAttackingMoves(board, piece, false)
            .some(attack => attack.from == move.to)
        && (
            piece.type == KING
            || pieceValues[piece.type] > pieceValues[movedPieceType]
            || !isPieceSafe(board, piece)
        )
    ));

    // Mention the king first, as in "forks the king and the rook"
    targets.sort((a, b) => Number(b.type == KING) - Number(a.type == KING));

    if (targets.length >= 2) {
        ideas.push(`forks the ${joinPhrases(
            targets.map(describePiece)
        ).replace(/(, | and )/g, "$1the ")}`);
    } else if (board.isCheck()) {
        ideas.push("gives check");
    } else if (targets.length == 1) {
        ideas.push(`attacks the ${describePiece(targets[0])}`);
    }

    const mateThreat = !subjectiveEvaluation || subjectiveEvaluation.type != "mate"
        ? findMateThreat(board, moverColour)
        : undefined;

    if (mateThreat) {
        ideas.push(`threatens checkmate with ${mateThreat.san}`);
    }

    // A piece that was hanging and is now safe. Only the moved piece is
    // checked here, which is far cheaper than scanning the whole board.
    if (move.piece != KING) {
        const wasUnsafe = !isPieceSafe(previousBoard, {
            type: move.piece, color: move.color, square: move.from
        });

        const isNowSafe = isPieceSafe(board, {
            type: movedPieceType, color: move.color, square: move.to
        }, move);

        if (wasUnsafe && isNowSafe && !move.captured) {
            ideas.push(`moves the ${pieceNames[move.piece].toLowerCase()} out of danger`);
        }
    }

    // The checks below scan every piece and are slow, so they only run
    // when nothing more important has been found
    if (ideas.length > 0) return ideas;

    // Other opponent pieces newly left hanging, e.g. by a discovered attack
    const previousOpponentUnsafe = getUnsafePieces(previousBoard, opponentColour);

    const newThreats = getUnsafePieces(board, opponentColour).filter(piece => (
        !previousOpponentUnsafe.some(other => other.square == piece.square)
        && !targets.some(target => target.square == piece.square)
    ));

    if (newThreats.length > 0) {
        ideas.push(`creates a threat against the ${describePiece(newThreats[0])}`);
        return ideas;
    }

    // Other own pieces that were hanging and are now protected
    const previousOwnUnsafe = getUnsafePieces(previousBoard, moverColour)
        .filter(piece => piece.square != move.from);

    if (previousOwnUnsafe.length > 0) {
        const ownUnsafe = getUnsafePieces(board, moverColour, move);

        const defendedPiece = previousOwnUnsafe.find(piece => (
            !ownUnsafe.some(other => other.square == piece.square)
        ));

        if (defendedPiece) {
            ideas.push(`protects the ${describePiece(defendedPiece)}`);
        }
    }

    return ideas;
}

/**
 * @description Explains the ideas behind the key moves around a played
 * move: for errors, why the best move was better and what the opponent
 * can now do; otherwise, what the played move achieves.
 */
export function explainMoveIdeas(node: StateTreeNode): string[] {
    if (!node.parent || !node.state.move) return [];

    const previous = extractPreviousStateTreeNode(node.parent);
    const current = extractCurrentStateTreeNode(node);

    if (!previous || !current) return [];

    const sentences: string[] = [];
    const classification = node.state.classification;

    if (classification && errorClassifications.includes(classification)) {
        if (previous.topMove.san != current.playedMove.san) {
            const bestIdeas = describeMoveIdea(
                node.parent.state.fen,
                previous.topMove.san,
                previous.evaluation
            );

            sentences.push(bestIdeas.length > 0
                ? `The idea of ${previous.topMove.san} was that it `
                    + `${joinPhrases(bestIdeas)}.`
                : `${previous.topMove.san} kept your position more solid.`
            );
        }

        if (current.topMove) {
            const replyIdeas = describeMoveIdea(
                node.state.fen,
                current.topMove.san,
                current.evaluation
            );

            if (replyIdeas.length > 0) {
                sentences.push(
                    `After your move, your opponent's ${current.topMove.san}`
                    + ` ${joinPhrases(replyIdeas)}.`
                );
            }
        }
    } else {
        const playedIdeas = describeMoveIdea(
            node.parent.state.fen,
            current.playedMove.san,
            current.evaluation
        );

        if (playedIdeas.length > 0) {
            sentences.push(
                `${current.playedMove.san} ${joinPhrases(playedIdeas)}.`
            );
        }
    }

    return sentences;
}
