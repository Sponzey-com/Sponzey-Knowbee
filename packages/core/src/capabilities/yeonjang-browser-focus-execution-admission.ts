import { createHash } from "node:crypto"

export type YeonjangBrowserFocusExecutionAdmission = {
  readonly schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission.v1"
  readonly method: "browser.focus"
  readonly extensionId: string
  readonly sessionId?: string
  readonly targetHash: string
  readonly approvalScopeId: string
  readonly expiresAt: string
  readonly nonce: string
  readonly signature: string
}

export interface YeonjangBrowserFocusAdmissionSignatureVerifier {
  verify(input: {
    readonly admission: YeonjangBrowserFocusExecutionAdmission
  }): boolean
}

export interface YeonjangBrowserFocusAdmissionNonceStore {
  consume(input: {
    readonly nonce: string
    readonly expiresAt: string
  }): boolean
}

export type YeonjangBrowserFocusExecutionAdmissionDecision = {
  readonly schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission-decision.v1"
  readonly method: "browser.focus"
  readonly status: "accepted" | "blocked"
  readonly reasonCode:
    | "browser_focus_execution_admission_accepted"
    | "browser_focus_execution_admission_missing"
    | "browser_focus_execution_admission_method_invalid"
    | "browser_focus_execution_admission_target_mismatch"
    | "browser_focus_execution_admission_target_instance_mismatch"
    | "browser_focus_execution_admission_expired"
    | "browser_focus_execution_admission_signature_invalid"
    | "browser_focus_execution_admission_nonce_replayed"
  readonly executionAdmissionRef?: string
  readonly invokeOsFocusNow: false
  readonly userGoalSucceededNow: false
}

export function evaluateYeonjangBrowserFocusExecutionAdmission(input: {
  readonly admission?: YeonjangBrowserFocusExecutionAdmission
  readonly expectedTargetHash: string
  readonly expectedExtensionId: string
  readonly expectedSessionId?: string
  readonly now: Date
  readonly signatureVerifier: YeonjangBrowserFocusAdmissionSignatureVerifier
  readonly nonceStore: YeonjangBrowserFocusAdmissionNonceStore
}): YeonjangBrowserFocusExecutionAdmissionDecision {
  const admission = input.admission
  if (!admission) return blocked("browser_focus_execution_admission_missing")
  if (admission.method !== "browser.focus") {
    return blocked("browser_focus_execution_admission_method_invalid")
  }
  if (admission.targetHash !== input.expectedTargetHash) {
    return blocked("browser_focus_execution_admission_target_mismatch")
  }
  if (
    admission.extensionId !== input.expectedExtensionId ||
    normalizeOptional(admission.sessionId) !== normalizeOptional(input.expectedSessionId)
  ) {
    return blocked("browser_focus_execution_admission_target_instance_mismatch")
  }
  const expiresAt = Date.parse(admission.expiresAt)
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now.getTime()) {
    return blocked("browser_focus_execution_admission_expired")
  }
  if (!input.signatureVerifier.verify({ admission })) {
    return blocked("browser_focus_execution_admission_signature_invalid")
  }
  if (!input.nonceStore.consume({ nonce: admission.nonce, expiresAt: admission.expiresAt })) {
    return blocked("browser_focus_execution_admission_nonce_replayed")
  }

  return {
    schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission-decision.v1",
    method: "browser.focus",
    status: "accepted",
    reasonCode: "browser_focus_execution_admission_accepted",
    executionAdmissionRef: buildExecutionAdmissionRef(admission),
    invokeOsFocusNow: false,
    userGoalSucceededNow: false,
  }
}

function blocked(
  reasonCode: Exclude<
    YeonjangBrowserFocusExecutionAdmissionDecision["reasonCode"],
    "browser_focus_execution_admission_accepted"
  >,
): YeonjangBrowserFocusExecutionAdmissionDecision {
  return {
    schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission-decision.v1",
    method: "browser.focus",
    status: "blocked",
    reasonCode,
    invokeOsFocusNow: false,
    userGoalSucceededNow: false,
  }
}

function buildExecutionAdmissionRef(admission: YeonjangBrowserFocusExecutionAdmission): string {
  const value = [
    admission.extensionId,
    normalizeOptional(admission.sessionId),
    admission.targetHash,
    admission.approvalScopeId,
    admission.expiresAt,
    admission.nonce,
  ].join("\u0000")
  return `yeonjang-browser-focus-execution-admission:sha256:${createHash("sha256").update(value).digest("hex")}`
}

function normalizeOptional(value: string | undefined): string {
  return value?.trim() ?? ""
}
