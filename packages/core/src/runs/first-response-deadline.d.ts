export declare const FIRST_RESPONSE_BUDGET_MS: Readonly<{
    readonly llm: 24000;
    readonly validation: 1000;
    readonly delivery: 4000;
    readonly reserve: 1000;
    readonly total: 30000;
}>;
export type FirstResponseDeadlineStage = "llm" | "validation" | "delivery" | "receipt";
export interface FirstResponseDeadline {
    readonly receivedAtMs: number;
    readonly llmDeadlineAtMs: number;
    readonly validationDeadlineAtMs: number;
    readonly deliveryDeadlineAtMs: number;
    readonly expiresAtMs: number;
}
export interface FirstResponseDeliveryReceipt {
    readonly runId: string;
    readonly receiptRef: string;
    readonly deliveredAtMs: number;
}
export type FirstResponseReceiptLatency = {
    readonly status: "within_deadline" | "deadline_exceeded";
    readonly runId: string;
    readonly receiptRef: string;
    readonly latencyMs: number;
} | {
    readonly status: "receipt_missing";
    readonly runId: string;
    readonly reasonCode: "first_response_delivery_receipt_missing" | "first_response_delivery_run_mismatch" | "first_response_delivery_receipt_invalid";
};
export declare function createFirstResponseDeadline(receivedAtMs: number): FirstResponseDeadline;
export declare function firstResponseStageRemainingMs(deadline: FirstResponseDeadline, stage: FirstResponseDeadlineStage, nowMs: number): number;
export declare function isFirstResponseReceiptWithinDeadline(deadline: FirstResponseDeadline, deliveredAtMs: number): boolean;
export declare function projectFirstResponseReceiptLatency(input: {
    runId: string;
    deadline: FirstResponseDeadline;
    receipt?: FirstResponseDeliveryReceipt;
}): FirstResponseReceiptLatency;
//# sourceMappingURL=first-response-deadline.d.ts.map