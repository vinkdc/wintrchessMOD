import z from "zod";

import { engineLineSchema } from "./EngineLine";
import { moveSchema } from "./Move";
import { Classification } from "@/constants/Classification";
import PieceColour from "@/constants/PieceColour";

export const boardStateSchema = z.object({
    fen: z.string(),
    move: moveSchema.optional(),
    moveColour: z.enum(PieceColour).optional(),
    engineLines: z.array(engineLineSchema),
    classification: z.enum(Classification).optional(),
    accuracy: z.number().optional(),
    opening: z.string().optional(),
    // Seconds left on the mover's clock after the move, and seconds spent
    // on it, when the PGN records clock times
    clock: z.number().optional(),
    timeSpent: z.number().optional()
});

export type BoardState = z.infer<typeof boardStateSchema>;