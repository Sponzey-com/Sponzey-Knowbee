import type { SlackConfig } from "../../config/types.js";
import type { ApprovalAggregateTextLanguage } from "../approval-aggregation.js";
import { type SlackFileDeliveryResult, type SlackTextPartsDeliveryResult } from "./message-delivery.js";
import { type InteractiveControlText } from "../interactive-control.js";
import type { IntakeAcknowledgementControlText } from "../intake-acknowledgement-control.js";
export type SlackResponderLanguage = "ko" | "en";
export interface SlackApiEnvelope<T = Record<string, unknown>> {
    ok: boolean;
    error?: string;
    ts?: string;
    channel?: string;
    thread_ts?: string;
    permalink?: string;
    upload_url?: string;
    file_id?: string;
    response_metadata?: {
        messages?: string[];
    };
    team?: {
        name?: string;
    };
    [key: string]: unknown;
}
export declare class SlackResponder {
    private config;
    private channelId;
    private threadTs;
    private language;
    constructor(config: SlackConfig, channelId: string, threadTs: string, language?: SlackResponderLanguage);
    private api;
    sendToolStatus(toolName: string): Promise<string>;
    updateToolStatus(messageId: string, toolName: string, success: boolean): Promise<void>;
    clearToolStatus(messageId: string): Promise<void>;
    sendFinalResponse(text: string): Promise<string[]>;
    sendFinalResponseWithReceipts(text: string, idempotencyKeyPrefix: string): Promise<SlackTextPartsDeliveryResult>;
    sendError(message: string): Promise<string>;
    sendReceipt(text: string): Promise<string>;
    sendIntakeAcknowledgement(text: IntakeAcknowledgementControlText): Promise<string>;
    sendApprovalRequest(runId: string, text: InteractiveControlText, language?: ApprovalAggregateTextLanguage): Promise<string>;
    sendFile(filePath: string, caption?: string): Promise<string>;
    sendFileWithReceipt(filePath: string, idempotencyKey: string, caption?: string): Promise<SlackFileDeliveryResult>;
}
//# sourceMappingURL=responder.d.ts.map