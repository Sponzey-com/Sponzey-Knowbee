import type { ActiveQueueCancellationMode } from "./entry-semantics.js";
export interface ActiveQueueCancellationNotice {
    kind: "active_queue_cancellation";
    mode: ActiveQueueCancellationMode;
    hadTargets: boolean;
    cancelledCount: number;
    remainingCount: number;
    deliveryMode: "control";
    textSource: "active_queue_cancellation_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function buildActiveQueueCancellationNotice(params: {
    mode: ActiveQueueCancellationMode;
    hadTargets: boolean;
    cancelledCount: number;
    remainingCount: number;
}): ActiveQueueCancellationNotice;
//# sourceMappingURL=active-cancellation-notice.d.ts.map