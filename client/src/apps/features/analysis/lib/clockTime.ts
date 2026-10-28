// Clock time left at which a player counts as being under time pressure
export const timePressureSeconds = 30;

// Time spent on a single move that counts as a long think
export const longThinkSeconds = 60;

/**
 * @description Formats seconds as `8.4s`, `42s` or `2:05`.
 */
export function formatClockTime(seconds: number) {
    if (seconds < 10) return `${seconds.toFixed(1)}s`;
    if (seconds < 60) return `${Math.round(seconds)}s`;

    const wholeSeconds = Math.round(seconds);

    const minutes = Math.floor(wholeSeconds / 60);
    const remainder = String(wholeSeconds % 60).padStart(2, "0");

    return `${minutes}:${remainder}`;
}
