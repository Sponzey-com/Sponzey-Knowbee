import { type ApprovalAggregateTextLanguage } from "../approval-aggregation.js";
import { type ChannelNoticeRenderDependencies } from "../notice-rendering.js";
import type { InteractiveControlText } from "../interactive-control.js";
export type SlackApprovalDecision = "allow_once" | "allow_run" | "deny";
export type SlackApprovalReplyLanguage = "ko" | "en";
export type SlackApprovalReplyReason = "decision";
export interface SlackApprovalReplyNotice {
    kind: "slack_approval_reply_notice";
    language: SlackApprovalReplyLanguage;
    reason: SlackApprovalReplyReason;
    deliveryMode: "thread_reply";
    textSource: "slack_approval_reply_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
    text: string;
}
export interface SlackApprovalMessenger {
    sendApprovalRequest(params: {
        channelId: string;
        threadTs: string;
        runId: string;
        text: InteractiveControlText;
        language?: ApprovalAggregateTextLanguage | undefined;
    }): Promise<string | void>;
    updateApprovalRequest?(params: {
        channelId: string;
        threadTs: string;
        runId: string;
        text: string;
        language?: ApprovalAggregateTextLanguage | undefined;
    }): Promise<void>;
}
export declare function buildSlackApprovalReplyNotice(input: {
    language?: SlackApprovalReplyLanguage | undefined;
    reason: SlackApprovalReplyReason;
    decision: SlackApprovalDecision;
}): SlackApprovalReplyNotice;
export declare function setActiveSlackConversationForSession(sessionId: string, channelId: string, userId: string, threadTs: string, language?: ApprovalAggregateTextLanguage | undefined): void;
export declare function clearActiveSlackConversationForSession(sessionId: string): void;
export declare function registerSlackApprovalHandler(messenger: SlackApprovalMessenger): void;
export declare function resetSlackApprovalStateForTest(): void;
export declare function handleSlackApprovalMessage(params: {
    channelId: string;
    threadTs: string;
    userId: string;
    text: string;
    language?: SlackApprovalReplyLanguage | undefined;
    noticeRendering?: ChannelNoticeRenderDependencies | undefined;
    reply: (text: string) => Promise<void>;
}): Promise<boolean>;
export declare function handleSlackApprovalAction(params: {
    runId: string;
    decision: SlackApprovalDecision;
    channelId: string;
    threadTs: string;
    userId: string;
    language?: SlackApprovalReplyLanguage | undefined;
    noticeRendering?: ChannelNoticeRenderDependencies | undefined;
    reply: (text: string) => Promise<void>;
}): Promise<boolean>;
//# sourceMappingURL=approval-handler.d.ts.map