export type { TaskIntakeIntentCategory } from "./intake-category.js";
export type TaskIntakeMessageMode = "direct_answer" | "accepted_receipt" | "failed_receipt" | "clarification_receipt";
export type TaskIntakeActionType = "reply" | "run_task" | "delegate_agent" | "create_schedule" | "update_schedule" | "cancel_schedule" | "ask_user" | "log_only";
export type TaskIntakePriority = "low" | "normal" | "high" | "urgent";
export type TaskApprovalToolName = "screen_capture" | "yeonjang_camera_capture" | "mouse_click" | "keyboard_type" | "file_write" | "app_launch" | "external_action";
export type TaskIntakeTaskProfile = "general_chat" | "planning" | "coding" | "review" | "research" | "private_local" | "summarization" | "operations";
export interface TaskIntakePromptOptions {
    maxDelegationTurns?: number;
    workDir?: string;
    locale?: "ko" | "en";
}
export interface TaskIntakeFirstResponsePromptOptions extends TaskIntakePromptOptions {
    mainAgentName: string;
    productName: string;
    productNameKo: string;
    identityContext?: string;
}
export interface TaskIntakeFirstResponsePromptAssembly {
    systemPrompt: string;
    taskIntakePromptSha256: string;
    finalResponsePromptSha256: string;
}
export declare function buildTaskIntakeSystemPrompt(options?: TaskIntakePromptOptions): string;
export declare function buildTaskIntakeFirstResponseSystemPrompt(options: TaskIntakeFirstResponsePromptOptions): string;
export declare function buildTaskIntakeFirstResponsePromptAssembly(options: TaskIntakeFirstResponsePromptOptions): TaskIntakeFirstResponsePromptAssembly;
//# sourceMappingURL=intake-prompt.d.ts.map