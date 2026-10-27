enum EngineVersion {
    LICHESS_CLOUD = "lichess-cloud",
    STOCKFISH_19_ASM = "stockfish-19-asm.js",
    STOCKFISH_19_LITE = "stockfish-19-lite-single.js",
    STOCKFISH_19 = "stockfish-19-single.js",
    // Retired engines, kept so previously saved engine lines still validate
    STOCKFISH_17_ASM = "stockfish-17-asm.js",
    STOCKFISH_17_LITE = "stockfish-17-lite-single.js",
    STOCKFISH_17 = "stockfish-17-single.js"
}

export const availableEngineVersions = [
    EngineVersion.STOCKFISH_19,
    EngineVersion.STOCKFISH_19_LITE,
    EngineVersion.STOCKFISH_19_ASM
];

export default EngineVersion;
