export type LivePerformanceCliArgumentsResult = {
    status: "ready";
    databasePath: string;
    runId: string;
    flowId: string;
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function parseLivePerformanceCliArguments(argv: readonly string[]): LivePerformanceCliArgumentsResult;
//# sourceMappingURL=live-performance-cli.d.ts.map