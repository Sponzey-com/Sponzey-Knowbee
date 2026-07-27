export type InteractiveControlLanguage = "ko" | "en";
export type InteractiveControlChannel = "slack" | "telegram";
declare const interactiveControlTextBrand: unique symbol;
export type InteractiveControlText = string & {
    readonly [interactiveControlTextBrand]: true;
};
interface InteractiveControlBase {
    deliveryMode: "interactive_control";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export interface ApprovalRequestControlItem {
    approvalRef?: string | undefined;
    toolLabel: string;
    screenConfirmation: boolean;
}
export interface ApprovalRequestControl extends InteractiveControlBase {
    kind: "approval_request_control";
    runRef: string;
    language: InteractiveControlLanguage;
    items: ApprovalRequestControlItem[];
    actions: readonly ["allow_run", "allow_once", "deny"];
}
export interface ToolStatusControl extends InteractiveControlBase {
    kind: "tool_status_control";
    toolLabel: string;
    status: "running" | "succeeded" | "failed";
    language: InteractiveControlLanguage;
}
export declare function buildApprovalRequestControl(input: {
    runRef: string;
    language?: InteractiveControlLanguage | undefined;
    items: Array<{
        approvalRef?: string | undefined;
        toolLabel: string;
        kind: string;
    }>;
}): ApprovalRequestControl;
export declare function renderApprovalRequestControlText(control: ApprovalRequestControl, channel: InteractiveControlChannel): InteractiveControlText;
export declare function buildToolStatusControl(input: {
    toolLabel: string;
    status: ToolStatusControl["status"];
    language?: InteractiveControlLanguage | undefined;
}): ToolStatusControl;
export declare function renderToolStatusControlText(control: ToolStatusControl, channel: InteractiveControlChannel): InteractiveControlText;
export {};
//# sourceMappingURL=interactive-control.d.ts.map