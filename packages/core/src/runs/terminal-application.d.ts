import type { RunChunkDeliveryHandler } from "./delivery.js";
import type { UserFacingTextSource } from "./loop-directive.js";
import { moveRunToAwaitingUser, moveRunToCancelledAfterStop, type AwaitingUserParams, type FinalizationDependencies, type FinalizationSource, type CanonicalDeliveryRecorder, type StandaloneAssistantMessageResponseContext } from "./finalization.js";
import type { CanonicalFinalOutcome } from "./canonical-work-run-projection.js";
import type { CanonicalResultReportFacts } from "../contracts/canonical-result-report.js";
export type TerminalApplication = ({
    kind: "awaiting_user";
    userMessageSource?: UserFacingTextSource;
} & AwaitingUserParams) | ({
    kind: "stop";
    userMessageSource?: UserFacingTextSource;
} & AwaitingUserParams);
interface TerminalApplicationDependencies {
    moveRunToAwaitingUser: typeof moveRunToAwaitingUser;
    moveRunToCancelledAfterStop: typeof moveRunToCancelledAfterStop;
}
export declare function applyTerminalApplication(params: {
    runId: string;
    sessionId: string;
    source: FinalizationSource;
    onChunk: RunChunkDeliveryHandler | undefined;
    application: TerminalApplication;
    responseContext?: StandaloneAssistantMessageResponseContext | undefined;
    recordCanonicalDelivery?: CanonicalDeliveryRecorder | undefined;
    canonicalFinalOutcome?: CanonicalFinalOutcome | undefined;
    terminalReport?: CanonicalResultReportFacts | undefined;
    dependencies: FinalizationDependencies;
}, dependencies?: TerminalApplicationDependencies): Promise<"awaiting_user" | "cancelled" | "failed">;
export {};
//# sourceMappingURL=terminal-application.d.ts.map