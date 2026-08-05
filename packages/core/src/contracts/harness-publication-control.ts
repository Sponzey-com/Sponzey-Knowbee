import type { HighRiskVerificationDecision } from "./high-risk-improvement-verification.js"
import type { PromptActivationProjection } from "./high-risk-source-activation-evidence.js"
import type { RecursivePromptImprovementGateDecision } from "./recursive-prompt-improvement-gate.js"

export const CURRENT_HARNESS_CONTROL_EVIDENCE = [
  "input",
  "baseline",
  "invariant",
  "approval",
  "regression",
  "rollback",
  "activation",
] as const

export const HARNESS_STATE_MACHINE_COMPONENTS = [
  "state",
  "event",
  "transition",
  "terminal",
  "failure",
  "rollback",
] as const

export type CurrentHarnessControlEvidenceKind = typeof CURRENT_HARNESS_CONTROL_EVIDENCE[number]
export type HarnessStateMachineComponent = typeof HARNESS_STATE_MACHINE_COMPONENTS[number]

export interface CurrentHarnessControlEvidenceReceipt {
  kind: CurrentHarnessControlEvidenceKind
  proposalFingerprint: string
  evidenceRef: string
}

export interface CurrentHarnessControlReceipt {
  schemaVersion: 1
  proposalRunId: string
  proposalFingerprint: string
  activeHarnessVersion: string
  activeHarnessChecksum: string
  controllingHarnessChecksum: string
  targetSourceRefs: string[]
  evidence: CurrentHarnessControlEvidenceReceipt[]
  issuedAt: number
  expiresAt: number
}

export interface HarnessStateMachineComponentReceipt {
  component: HarnessStateMachineComponent
  proposalFingerprint: string
  definitionRef: string
}

export type CurrentHarnessControlDecision =
  | {
      status: "verified"
      proposalRunId: string
      proposalFingerprint: string
      activeHarnessChecksum: string
      targetSourceRefs: string[]
    }
  | {
      status: "blocked"
      reasonCode:
        | "control_receipt_invalid"
        | "control_receipt_expired"
        | "inactive_harness_control"
        | "control_evidence_invalid"
        | "control_evidence_missing"
        | "control_evidence_scope_mismatch"
      evidenceKind?: CurrentHarnessControlEvidenceKind
    }

export type HarnessStateMachineCompletenessDecision =
  | { status: "complete"; proposalFingerprint: string; components: readonly HarnessStateMachineComponent[] }
  | {
      status: "blocked"
      reasonCode: "state_machine_component_invalid" | "state_machine_component_missing" | "state_machine_scope_mismatch"
      component?: HarnessStateMachineComponent
    }

export type HarnessPublicationDecision =
  | {
      status: "authorized"
      proposalFingerprint: string
      activationRunId: string
      runtimeSnapshotFingerprint: string
    }
  | {
      status: "blocked"
      reasonCode:
        | "current_harness_control_unverified"
        | "recursive_gate_unverified"
        | "proposal_scope_mismatch"
        | "state_machine_incomplete"
        | "high_risk_verification_missing"
        | "activation_unconfirmed"
        | "current_run_activation_forbidden"
        | "current_snapshot_activation_forbidden"
    }

function exact(value: string): string {
  return value.trim()
}

function validChecksum(value: string): boolean {
  return /^(?:sha256:)?[a-f0-9]{8,64}$/iu.test(exact(value))
}

export function verifyCurrentHarnessControl(input: {
  receipt: CurrentHarnessControlReceipt
  now: number
}): CurrentHarnessControlDecision {
  const receipt = input.receipt
  const targetSourceRefs = receipt.targetSourceRefs.map(exact).filter(Boolean)
  if (receipt.schemaVersion !== 1
    || !exact(receipt.proposalRunId)
    || !exact(receipt.proposalFingerprint)
    || !exact(receipt.activeHarnessVersion)
    || !validChecksum(receipt.activeHarnessChecksum)
    || targetSourceRefs.length === 0
    || new Set(targetSourceRefs).size !== targetSourceRefs.length
    || !Number.isSafeInteger(receipt.issuedAt)
    || !Number.isSafeInteger(receipt.expiresAt)
    || !Number.isSafeInteger(input.now)
    || receipt.issuedAt > input.now) {
    return { status: "blocked", reasonCode: "control_receipt_invalid" }
  }
  if (receipt.expiresAt <= input.now) return { status: "blocked", reasonCode: "control_receipt_expired" }
  if (exact(receipt.controllingHarnessChecksum) !== exact(receipt.activeHarnessChecksum)) {
    return { status: "blocked", reasonCode: "inactive_harness_control" }
  }
  const evidence = new Map<CurrentHarnessControlEvidenceKind, CurrentHarnessControlEvidenceReceipt>()
  for (const item of receipt.evidence) {
    if (!CURRENT_HARNESS_CONTROL_EVIDENCE.includes(item.kind) || evidence.has(item.kind) || !exact(item.evidenceRef)) {
      return { status: "blocked", reasonCode: "control_evidence_invalid" }
    }
    if (exact(item.proposalFingerprint) !== exact(receipt.proposalFingerprint)) {
      return { status: "blocked", reasonCode: "control_evidence_scope_mismatch", evidenceKind: item.kind }
    }
    evidence.set(item.kind, item)
  }
  for (const evidenceKind of CURRENT_HARNESS_CONTROL_EVIDENCE) {
    if (!evidence.has(evidenceKind)) return { status: "blocked", reasonCode: "control_evidence_missing", evidenceKind }
  }
  return {
    status: "verified",
    proposalRunId: exact(receipt.proposalRunId),
    proposalFingerprint: exact(receipt.proposalFingerprint),
    activeHarnessChecksum: exact(receipt.activeHarnessChecksum),
    targetSourceRefs,
  }
}

export function verifyHarnessStateMachineCompleteness(input: {
  proposalFingerprint: string
  components: readonly HarnessStateMachineComponentReceipt[]
}): HarnessStateMachineCompletenessDecision {
  const proposalFingerprint = exact(input.proposalFingerprint)
  const components = new Map<HarnessStateMachineComponent, HarnessStateMachineComponentReceipt>()
  for (const receipt of input.components) {
    if (!HARNESS_STATE_MACHINE_COMPONENTS.includes(receipt.component) || components.has(receipt.component) || !exact(receipt.definitionRef)) {
      return { status: "blocked", reasonCode: "state_machine_component_invalid", component: receipt.component }
    }
    if (exact(receipt.proposalFingerprint) !== proposalFingerprint) {
      return { status: "blocked", reasonCode: "state_machine_scope_mismatch", component: receipt.component }
    }
    components.set(receipt.component, receipt)
  }
  for (const component of HARNESS_STATE_MACHINE_COMPONENTS) {
    if (!components.has(component)) return { status: "blocked", reasonCode: "state_machine_component_missing", component }
  }
  return { status: "complete", proposalFingerprint, components: HARNESS_STATE_MACHINE_COMPONENTS }
}

export function authorizeHarnessPublication(input: {
  control: CurrentHarnessControlDecision
  recursiveGate: RecursivePromptImprovementGateDecision
  stateMachine: HarnessStateMachineCompletenessDecision
  highRisk: HighRiskVerificationDecision
  activation: PromptActivationProjection
  currentRuntimeSnapshotFingerprint: string
}): HarnessPublicationDecision {
  if (input.control.status !== "verified") return { status: "blocked", reasonCode: "current_harness_control_unverified" }
  if (input.recursiveGate.status !== "authorized") return { status: "blocked", reasonCode: "recursive_gate_unverified" }
  if (input.stateMachine.status !== "complete") return { status: "blocked", reasonCode: "state_machine_incomplete" }
  if (input.highRisk.status !== "authorized") return { status: "blocked", reasonCode: "high_risk_verification_missing" }
  if (input.activation.status !== "active") return { status: "blocked", reasonCode: "activation_unconfirmed" }
  const fingerprint = input.control.proposalFingerprint
  if (input.recursiveGate.proposalFingerprint !== fingerprint
    || input.stateMachine.proposalFingerprint !== fingerprint
    || input.highRisk.changeId !== fingerprint) {
    return { status: "blocked", reasonCode: "proposal_scope_mismatch" }
  }
  if (input.control.proposalRunId === input.activation.activationRunId) {
    return { status: "blocked", reasonCode: "current_run_activation_forbidden" }
  }
  if (exact(input.currentRuntimeSnapshotFingerprint) === input.activation.runtimeSnapshotFingerprint) {
    return { status: "blocked", reasonCode: "current_snapshot_activation_forbidden" }
  }
  return {
    status: "authorized",
    proposalFingerprint: fingerprint,
    activationRunId: input.activation.activationRunId,
    runtimeSnapshotFingerprint: input.activation.runtimeSnapshotFingerprint,
  }
}

export async function publishAuthorizedHarness<T>(input: {
  decision: HarnessPublicationDecision
  publish: (authorization: Extract<HarnessPublicationDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "published"; result: T } | Extract<HarnessPublicationDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "published", result: await input.publish(input.decision) }
}
