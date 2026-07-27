export type IntakeAcknowledgementLanguage = "ko" | "en" | "unknown"

export interface IntakeAcknowledgementControl {
  kind: "intake_acknowledgement"
  state: "request_received"
  language: IntakeAcknowledgementLanguage
  deliveryMode: "interactive_control"
  finalAnswer: false
  assistantIdentityClaim: false
}

export type IntakeAcknowledgementDeliveryResult<T> =
  | { status: "delivered"; reference: T }
  | { status: "failed" }

declare const INTAKE_ACKNOWLEDGEMENT_TEXT: unique symbol
export type IntakeAcknowledgementControlText = string & {
  readonly [INTAKE_ACKNOWLEDGEMENT_TEXT]: true
}

export function buildIntakeAcknowledgementControl(
  language: IntakeAcknowledgementLanguage,
): IntakeAcknowledgementControl {
  return {
    kind: "intake_acknowledgement",
    state: "request_received",
    language,
    deliveryMode: "interactive_control",
    finalAnswer: false,
    assistantIdentityClaim: false,
  }
}

export function renderIntakeAcknowledgementControl(
  control: IntakeAcknowledgementControl,
): IntakeAcknowledgementControlText {
  return (control.language === "ko" ? "요청 접수" : "Request received") as IntakeAcknowledgementControlText
}

export async function deliverIntakeAcknowledgementControl<T>(params: {
  control: IntakeAcknowledgementControl
  deliver: (text: IntakeAcknowledgementControlText) => Promise<T>
  onFailure?: ((error: unknown) => void) | undefined
}): Promise<IntakeAcknowledgementDeliveryResult<T>> {
  try {
    return {
      status: "delivered",
      reference: await params.deliver(renderIntakeAcknowledgementControl(params.control)),
    }
  } catch (error) {
    params.onFailure?.(error)
    return { status: "failed" }
  }
}
