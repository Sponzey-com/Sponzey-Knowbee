export type IntakeAcknowledgementLanguage = "ko" | "en" | "unknown";
export interface IntakeAcknowledgementControl {
    kind: "intake_acknowledgement";
    state: "request_received";
    language: IntakeAcknowledgementLanguage;
    deliveryMode: "interactive_control";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export type IntakeAcknowledgementDeliveryResult<T> = {
    status: "delivered";
    reference: T;
} | {
    status: "failed";
};
declare const INTAKE_ACKNOWLEDGEMENT_TEXT: unique symbol;
export type IntakeAcknowledgementControlText = string & {
    readonly [INTAKE_ACKNOWLEDGEMENT_TEXT]: true;
};
export declare function buildIntakeAcknowledgementControl(language: IntakeAcknowledgementLanguage): IntakeAcknowledgementControl;
export declare function renderIntakeAcknowledgementControl(control: IntakeAcknowledgementControl): IntakeAcknowledgementControlText;
export declare function deliverIntakeAcknowledgementControl<T>(params: {
    control: IntakeAcknowledgementControl;
    deliver: (text: IntakeAcknowledgementControlText) => Promise<T>;
    onFailure?: ((error: unknown) => void) | undefined;
}): Promise<IntakeAcknowledgementDeliveryResult<T>>;
export {};
//# sourceMappingURL=intake-acknowledgement-control.d.ts.map