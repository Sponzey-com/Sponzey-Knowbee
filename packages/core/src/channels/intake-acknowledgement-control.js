export function buildIntakeAcknowledgementControl(language) {
    return {
        kind: "intake_acknowledgement",
        state: "request_received",
        language,
        deliveryMode: "interactive_control",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
export function renderIntakeAcknowledgementControl(control) {
    return (control.language === "ko" ? "요청 접수" : "Request received");
}
export async function deliverIntakeAcknowledgementControl(params) {
    try {
        return {
            status: "delivered",
            reference: await params.deliver(renderIntakeAcknowledgementControl(params.control)),
        };
    }
    catch (error) {
        params.onFailure?.(error);
        return { status: "failed" };
    }
}
//# sourceMappingURL=intake-acknowledgement-control.js.map