import type { ChannelSmokeRunResult } from "./smoke-runner.js";
export interface ChannelSemanticOutcomeMatrixValidation {
    status: "passed" | "failed";
    failures: string[];
}
export declare function validateTelegramWebUiSemanticOutcomeMatrix(results: readonly ChannelSmokeRunResult[]): ChannelSemanticOutcomeMatrixValidation;
//# sourceMappingURL=semantic-outcome-matrix.d.ts.map