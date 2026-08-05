import type { recordLatencyMetric as recordLatencyMetricDefault } from "../observability/latency.js";
import { type FirstResponseDeadline, type FirstResponseDeliveryReceipt } from "./first-response-deadline.js";
export type FirstResponseReceiptRecordResult = {
    status: "recorded";
    latencyMs: number;
    withinDeadline: boolean;
} | {
    status: "already_recorded";
} | {
    status: "receipt_rejected";
    reasonCode: string;
};
export type FirstResponseReceiptRecorder = (receipt: FirstResponseDeliveryReceipt) => FirstResponseReceiptRecordResult;
export declare function createFirstResponseReceiptRecorder(input: {
    runId: string;
    sessionId: string;
    requestGroupId: string;
    source: string;
    deadline: FirstResponseDeadline;
    recordLatencyMetric: typeof recordLatencyMetricDefault;
}): FirstResponseReceiptRecorder;
//# sourceMappingURL=first-response-receipt.d.ts.map