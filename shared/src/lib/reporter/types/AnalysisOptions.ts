interface AnalysisOptions {
    includeBrilliant?: boolean;
    includeCritical?: boolean;
    includeTheory?: boolean;
    ratings?: {
        white?: number;
        black?: number;
    };
}

export default AnalysisOptions;
