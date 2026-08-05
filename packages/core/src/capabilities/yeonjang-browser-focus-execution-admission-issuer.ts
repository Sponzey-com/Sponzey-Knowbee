import { createHash } from "node:crypto"

import type { YeonjangBrowserFocusTargetProjection } from "./yeonjang-browser-focus-contract.js"
import type { YeonjangBrowserFocusExecutionAdmission } from "./yeonjang-browser-focus-execution-admission.js"
import type { YeonjangExecutionAdmissionKeyPort } from "../yeonjang/execution-admission-key-port.js"
import type { YeonjangBrowserFocusExecutionAdmissionIssuerPort } from "../tools/types.js"

export type YeonjangBrowserFocusExecutionAdmissionIssueResult =
  | {
      readonly ok: true
      readonly admission: YeonjangBrowserFocusExecutionAdmission
    }
  | {
      readonly ok: false
      readonly reasonCode:
        | "browser_focus_execution_admission_key_unavailable"
        | "browser_focus_execution_admission_input_invalid"
        | "browser_focus_execution_admission_expired"
    }

export function issueYeonjangBrowserFocusExecutionAdmission(input: {
  readonly extensionId: string
  readonly sessionId?: string
  readonly targetHash: string
  readonly approvalScopeId: string
  readonly expiresAt: string
  readonly nonce: string
  readonly now: Date
  readonly keyPort: YeonjangExecutionAdmissionKeyPort
}): YeonjangBrowserFocusExecutionAdmissionIssueResult {
  const extensionId = input.extensionId.trim()
  const sessionId = normalizeOptional(input.sessionId)
  const targetHash = input.targetHash.trim()
  const approvalScopeId = input.approvalScopeId.trim()
  const expiresAt = input.expiresAt.trim()
  const nonce = input.nonce.trim()
  if (!extensionId || !targetHash || !approvalScopeId || !expiresAt || !nonce) {
    return { ok: false, reasonCode: "browser_focus_execution_admission_input_invalid" }
  }
  const expiry = Date.parse(expiresAt)
  if (!Number.isFinite(expiry) || expiry <= input.now.getTime()) {
    return { ok: false, reasonCode: "browser_focus_execution_admission_expired" }
  }
  const key = input.keyPort.resolve({ extensionId, ...(sessionId ? { sessionId } : {}) })
  if (
    !key ||
    key.extensionId.trim() !== extensionId ||
    (normalizeOptional(key.sessionId) && normalizeOptional(key.sessionId) !== sessionId) ||
    !key.keyId.trim()
  ) {
    return { ok: false, reasonCode: "browser_focus_execution_admission_key_unavailable" }
  }
  const unsigned = {
    schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission.v1" as const,
    method: "browser.focus" as const,
    extensionId,
    ...(sessionId ? { sessionId } : {}),
    targetHash,
    approvalScopeId,
    expiresAt,
    nonce,
  }
  return {
    ok: true,
    admission: { ...unsigned, signature: key.sign({ canonicalPayload: canonicalize(unsigned) }) },
  }
}

export function createYeonjangBrowserFocusExecutionAdmissionIssuer(input: {
  readonly keyPort: YeonjangExecutionAdmissionKeyPort
  readonly now: () => Date
  readonly createNonce: () => string
  readonly ttlMs: number
}): YeonjangBrowserFocusExecutionAdmissionIssuerPort {
  const ttlMs = Math.floor(input.ttlMs)
  return Object.freeze({
    issue: ({
      extensionId,
      sessionId,
      targetHash,
      approvalScopeId,
    }: {
      readonly extensionId: string
      readonly sessionId?: string
      readonly targetHash: string
      readonly approvalScopeId: string
    }) => {
      const now = input.now()
      if (!Number.isFinite(ttlMs) || ttlMs <= 0 || !Number.isFinite(now.getTime())) {
        return { ok: false as const, reasonCode: "browser_focus_execution_admission_input_invalid" }
      }
      const nonce = input.createNonce().trim()
      if (!nonce) {
        return { ok: false as const, reasonCode: "browser_focus_execution_admission_input_invalid" }
      }
      return issueYeonjangBrowserFocusExecutionAdmission({
        extensionId,
        ...(sessionId ? { sessionId } : {}),
        targetHash,
        approvalScopeId,
        expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        nonce,
        now,
        keyPort: input.keyPort,
      })
    },
  })
}

export function canonicalizeYeonjangBrowserFocusExecutionAdmission(input: Omit<
  YeonjangBrowserFocusExecutionAdmission,
  "signature"
>): string {
  return canonicalize(input)
}

export function hashYeonjangBrowserFocusExecutionTarget(
  target: YeonjangBrowserFocusTargetProjection,
): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalizeTarget(target), "utf8").digest("hex")}`
}

function canonicalize(input: Omit<YeonjangBrowserFocusExecutionAdmission, "signature">): string {
  return [
    input.schemaVersion,
    input.method,
    input.extensionId,
    normalizeOptional(input.sessionId),
    input.targetHash,
    input.approvalScopeId,
    input.expiresAt,
    input.nonce,
  ].join("\u0000")
}

function canonicalizeTarget(target: YeonjangBrowserFocusTargetProjection): string {
  return [
    target.schemaVersion,
    target.targetKind,
    target.displayName,
    target.processName ?? "",
    target.titleHash ?? "",
    target.titleLength?.toString() ?? "",
    target.urlScheme ?? "",
    target.urlHash ?? "",
    target.urlLength?.toString() ?? "",
  ].join("\u0000")
}

function normalizeOptional(value: string | undefined): string {
  return value?.trim() ?? ""
}
