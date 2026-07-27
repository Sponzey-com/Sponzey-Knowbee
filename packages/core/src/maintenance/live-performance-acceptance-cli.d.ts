import { type RepresentativeFlowId } from "./performance-baseline.js";
export type LivePerformanceAcceptanceCliArguments = {
    status: "ready";
    databasePath: string;
    selector: {
        matrixId: string;
        matrixVersion: number;
        baselineVersion: string;
    };
    runs: Array<{
        flowId: RepresentativeFlowId;
        runId: string;
    }>;
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function parseLivePerformanceAcceptanceCliArguments(argv: readonly string[]): LivePerformanceAcceptanceCliArguments;
//# sourceMappingURL=live-performance-acceptance-cli.d.ts.map