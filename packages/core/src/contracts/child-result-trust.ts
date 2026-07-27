import { createHash } from "node:crypto"

export interface ChildResultTrustBinding {
  parentRunId: string
  parentAgentId: string
  childAgentId: string
  childAgentNameSnapshot: string
  subSessionId: string
  resultReportId: string
  resultFingerprint: `sha256:${string}`
}

export interface ChildResultTrustReceipt {
  readonly schemaVersion: "child-result-trust-v1"
  readonly parentRunId: string
  readonly parentAgentId: string
  readonly childAgentId: string
  readonly subSessionId: string
  readonly resultReportId: string
  readonly resultFingerprint: `sha256:${string}`
  readonly bindingFingerprint: `sha256:${string}`
  readonly sourceRef: string
  readonly trustClass: "untrusted_external"
  readonly instructionIsolation: "data_only"
  readonly redactionState: "redacted"
}

export type ChildResultTrustReasonCode =
  | "child_result_not_direct_child"
  | "child_result_binding_invalid"
  | "child_result_receipt_binding_mismatch"
  | "child_result_receipt_isolation_invalid"

function normalized(value: string): string {
  return value.trim()
}

function isValidBinding(binding: ChildResultTrustBinding): boolean {
  return [
    binding.parentRunId,
    binding.parentAgentId,
    binding.childAgentId,
    binding.childAgentNameSnapshot,
    binding.subSessionId,
    binding.resultReportId,
  ].every((value) => normalized(value).length > 0) &&
    /^sha256:[a-f0-9]{64}$/u.test(binding.resultFingerprint)
}

function bindingFingerprint(binding: ChildResultTrustBinding): `sha256:${string}` {
  const digest = createHash("sha256").update(JSON.stringify({
    parentRunId: normalized(binding.parentRunId),
    parentAgentId: normalized(binding.parentAgentId),
    childAgentId: normalized(binding.childAgentId),
    childAgentNameFingerprint: createHash("sha256")
      .update(normalized(binding.childAgentNameSnapshot))
      .digest("hex"),
    subSessionId: normalized(binding.subSessionId),
    resultReportId: normalized(binding.resultReportId),
    resultFingerprint: binding.resultFingerprint,
  })).digest("hex")
  return `sha256:${digest}`
}

export function issueChildResultTrustReceipt(
  input: ChildResultTrustBinding & { directChildAgentIds: readonly string[] },
):
  | { ok: true; receipt: Readonly<ChildResultTrustReceipt> }
  | { ok: false; reasonCode: ChildResultTrustReasonCode } {
  if (!isValidBinding(input)) {
    return { ok: false, reasonCode: "child_result_binding_invalid" }
  }
  const directChildren = new Set(input.directChildAgentIds.map(normalized).filter(Boolean))
  if (!directChildren.has(normalized(input.childAgentId))) {
    return { ok: false, reasonCode: "child_result_not_direct_child" }
  }
  const fingerprint = bindingFingerprint(input)
  return {
    ok: true,
    receipt: Object.freeze({
      schemaVersion: "child-result-trust-v1",
      parentRunId: normalized(input.parentRunId),
      parentAgentId: normalized(input.parentAgentId),
      childAgentId: normalized(input.childAgentId),
      subSessionId: normalized(input.subSessionId),
      resultReportId: normalized(input.resultReportId),
      resultFingerprint: input.resultFingerprint,
      bindingFingerprint: fingerprint,
      sourceRef: `child-result:${fingerprint.slice("sha256:".length)}`,
      trustClass: "untrusted_external",
      instructionIsolation: "data_only",
      redactionState: "redacted",
    }),
  }
}

export function validateChildResultTrustReceipt(input: {
  receipt: Readonly<ChildResultTrustReceipt>
  expected: ChildResultTrustBinding
  directChildAgentIds: readonly string[]
}): { allowed: boolean; reasonCode: ChildResultTrustReasonCode | "child_result_data_only"; sourceRef: string } {
  const sourceRef = input.receipt.sourceRef
  if (
    input.receipt.trustClass !== "untrusted_external" ||
    input.receipt.instructionIsolation !== "data_only" ||
    input.receipt.redactionState !== "redacted"
  ) {
    return { allowed: false, reasonCode: "child_result_receipt_isolation_invalid", sourceRef }
  }
  const issued = issueChildResultTrustReceipt({
    ...input.expected,
    directChildAgentIds: input.directChildAgentIds,
  })
  if (!issued.ok) return { allowed: false, reasonCode: issued.reasonCode, sourceRef }
  if (
    issued.receipt.bindingFingerprint !== input.receipt.bindingFingerprint ||
    issued.receipt.sourceRef !== sourceRef
  ) {
    return { allowed: false, reasonCode: "child_result_receipt_binding_mismatch", sourceRef }
  }
  return { allowed: true, reasonCode: "child_result_data_only", sourceRef }
}

export function projectChildResultForParent(input: {
  receipt: Readonly<ChildResultTrustReceipt>
  content: string
}): Readonly<{
  role: "external_data"
  policyAuthority: "none"
  sourceRef: string
  instructionIsolation: "data_only"
  content: string
}> {
  return Object.freeze({
    role: "external_data",
    policyAuthority: "none",
    sourceRef: input.receipt.sourceRef,
    instructionIsolation: "data_only",
    content: input.content.trim(),
  })
}
