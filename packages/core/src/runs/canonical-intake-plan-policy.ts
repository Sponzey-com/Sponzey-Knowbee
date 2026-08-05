import { createHash } from "node:crypto"
import { extractIntakeMethodConstraints } from "../agent/intake-method-constraints.js"
import type { TaskIntakeResult } from "../agent/intake.js"
import type { OrchestrationRegistrySnapshot } from "../orchestration/registry.js"
import type { AnyTool, ToolContext } from "../tools/types.js"
import {
  type CapabilityRuntimeHealthObservation,
  type YeonjangAgentBindingObservation,
  projectCanonicalCapabilitySnapshot,
} from "./canonical-capability-snapshot.js"
import { buildCanonicalIntakeDiagnosisDescriptor } from "./canonical-intake-diagnosis.js"
import {
  type CanonicalPlanPolicyInput,
  type CanonicalPlanPolicyReceiptDescriptor,
  buildCanonicalPlanPolicyReceiptDescriptor,
  evaluateCanonicalPlanPolicy,
} from "./canonical-plan-policy.js"

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

function requiredActionCapabilities(intake: TaskIntakeResult): string[] {
  const actionTypes =
    intake.action_items.length > 0 ? intake.action_items.map((action) => action.type) : ["reply"]
  return [
    ...new Set([
      ...actionTypes.map((type) => `action:${type}`),
      ...(intake.execution?.needs_web === true ? ["web_search"] : []),
    ]),
  ].sort()
}

export type CanonicalIntakePlanPolicyResult =
  | { ok: true; input: CanonicalPlanPolicyInput; descriptor: CanonicalPlanPolicyReceiptDescriptor }
  | {
      ok: false
      reasonCode: string
      input?: CanonicalPlanPolicyInput | undefined
      decision?: import("./canonical-plan-policy.js").CanonicalPlanPolicyDecision | undefined
    }

interface PersistedPolicyReceipt {
  workId: string
  kind: string
  evidenceFingerprint: string
  evidenceRefs: string[]
  consumedRevision?: number | undefined
}

export function recordCanonicalIntakePlanPolicy(
  descriptor: CanonicalPlanPolicyReceiptDescriptor,
  dependencies: {
    issueReceipt: (
      input: Omit<CanonicalPlanPolicyReceiptDescriptor, "runId">,
    ) => { issued: true } | { issued: false; reasonCode: string }
    loadReceipt: (receiptId: string) => PersistedPolicyReceipt | undefined
    applyPolicyTransition: (input: { runId: string; workId: string; receiptRef: string }) => {
      status: string
      reasonCode?: string | undefined
    }
  },
): { ok: true } | { ok: false; reasonCode: string } {
  const issued = dependencies.issueReceipt({
    receiptId: descriptor.receiptId,
    workId: descriptor.workId,
    kind: descriptor.kind,
    evidenceFingerprint: descriptor.evidenceFingerprint,
    evidenceRefs: descriptor.evidenceRefs,
  })
  if (!issued.issued) {
    const existing = dependencies.loadReceipt(descriptor.receiptId)
    const exact =
      existing &&
      existing.workId === descriptor.workId &&
      existing.kind === descriptor.kind &&
      existing.evidenceFingerprint === descriptor.evidenceFingerprint &&
      existing.evidenceRefs.length === descriptor.evidenceRefs.length &&
      existing.evidenceRefs.every((ref, index) => ref === descriptor.evidenceRefs[index])
    if (!exact) return { ok: false, reasonCode: issued.reasonCode }
    if (existing.consumedRevision !== undefined) {
      return existing.consumedRevision === 2
        ? { ok: true }
        : { ok: false, reasonCode: "policy_receipt_consumed_at_invalid_revision" }
    }
  }
  const transition = dependencies.applyPolicyTransition({
    runId: descriptor.runId,
    workId: descriptor.workId,
    receiptRef: descriptor.receiptId,
  })
  return transition.status === "applied"
    ? { ok: true }
    : { ok: false, reasonCode: transition.reasonCode ?? "canonical_policy_transition_rejected" }
}

export function buildCanonicalIntakePlanPolicy(input: {
  runId: string
  rootAgentId?: string | undefined
  intake: TaskIntakeResult
  registry: OrchestrationRegistrySnapshot
  tools: AnyTool[]
  source?: ToolContext["source"]
  snapshotAt?: number
  runtimeHealthObservations?: CapabilityRuntimeHealthObservation[]
  yeonjangAgentBindings?: YeonjangAgentBindingObservation[]
  approvedCapabilityIds?: string[] | undefined
}): CanonicalIntakePlanPolicyResult {
  const constraints = extractIntakeMethodConstraints(input.intake.action_items)
  if (!constraints.ok) return constraints
  const requestedMethods =
    constraints.constraints.requestedMethods.length === 0 &&
    constraints.constraints.exclusiveMethods.length === 0 &&
    input.intake.execution?.needs_web === true
      ? ["web_search"]
      : constraints.constraints.requestedMethods
  const snapshot = projectCanonicalCapabilitySnapshot({
    ...(input.rootAgentId ? { rootAgentId: input.rootAgentId } : {}),
    actionCapabilityIds: requiredActionCapabilities(input.intake),
    registry: input.registry,
    tools: input.tools,
    ...(input.source ? { source: input.source } : {}),
    ...(input.snapshotAt !== undefined ? { snapshotAt: input.snapshotAt } : {}),
    ...(input.runtimeHealthObservations
      ? { runtimeHealthObservations: input.runtimeHealthObservations }
      : {}),
    ...(input.yeonjangAgentBindings ? { yeonjangAgentBindings: input.yeonjangAgentBindings } : {}),
  })
  const snapshotDigest = createHash("sha256")
    .update(
      stableStringify({
        generatedAt: input.registry.generatedAt,
        ...snapshot,
      }),
    )
    .digest("hex")
  const diagnosis = buildCanonicalIntakeDiagnosisDescriptor({
    runId: input.runId,
    intake: input.intake,
  })
  const policyInput: CanonicalPlanPolicyInput = {
    runId: diagnosis.runId,
    workId: diagnosis.workId,
    planFingerprint: diagnosis.evidenceFingerprint,
    capabilitySnapshot: {
      snapshotId: `capability-snapshot:${input.runId}:${snapshotDigest.slice(0, 24)}`,
      fingerprint: `sha256:${snapshotDigest}`,
      bindings: snapshot.bindings,
      exclusions: snapshot.exclusions,
    },
    constraints: {
      requiredMethods: requiredActionCapabilities(input.intake),
      requestedMethods,
      exclusiveMethods: constraints.constraints.exclusiveMethods,
      ...(constraints.constraints.targetId ? { targetId: constraints.constraints.targetId } : {}),
      approvedCapabilityIds: input.approvedCapabilityIds ?? [],
    },
  }
  const policyDecision = evaluateCanonicalPlanPolicy(policyInput)
  if (policyDecision.outcome !== "allowed") {
    return {
      ok: false,
      reasonCode: policyDecision.reasonCode,
      input: policyInput,
      decision: policyDecision,
    }
  }
  return {
    ok: true,
    input: policyInput,
    descriptor: buildCanonicalPlanPolicyReceiptDescriptor({
      input: policyInput,
      decision: policyDecision,
    }),
  }
}
