import { createHash } from "node:crypto"
import type {
  AgentPromptBundle,
  CapabilityPolicy,
  CommandRequest,
  ModelProfile,
} from "./sub-agent-orchestration.js"
import {
  validateWorkHandoffPackage,
  type WorkHandoffPackage,
} from "./work-record.js"

export type DelegatedExecutionSnapshotReasonCode =
  | "delegated_execution_snapshot_valid"
  | "handoff_invalid"
  | "handoff_command_mismatch"
  | "handoff_target_mismatch"
  | "prompt_bundle_agent_mismatch"
  | "delegated_execution_snapshot_runtime_mismatch"
  | "delegated_execution_snapshot_fingerprint_mismatch"

export interface DelegatedExecutionSnapshot {
  readonly schemaVersion: "delegated-execution-snapshot-v1"
  readonly commandRequestId: string
  readonly subSessionId: string
  readonly handoff: WorkHandoffPackage
  readonly agent: {
    agentId: string
    agentName: string
  }
  readonly prompt: {
    bundleId: string
    checksum?: string
  }
  readonly modelProfile?: ModelProfile
  readonly capabilityPolicy: CapabilityPolicy
  readonly fingerprint: `sha256:${string}`
}

export interface BuildDelegatedExecutionSnapshotInput {
  command: Pick<
    CommandRequest,
    "commandRequestId" | "subSessionId" | "targetAgentId" | "targetAgentNameSnapshot"
  >
  handoff: WorkHandoffPackage
  agent: { agentId: string; agentName: string }
  promptBundle: AgentPromptBundle
}

type SnapshotPayload = Omit<DelegatedExecutionSnapshot, "fingerprint">

function fingerprint(payload: SnapshotPayload): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

export function buildDelegatedExecutionSnapshot(
  input: BuildDelegatedExecutionSnapshotInput,
):
  | { ok: true; snapshot: DelegatedExecutionSnapshot }
  | { ok: false; reasonCode: Exclude<DelegatedExecutionSnapshotReasonCode, "delegated_execution_snapshot_valid" | "delegated_execution_snapshot_fingerprint_mismatch"> } {
  if (
    input.handoff.handoff_id !== `handoff:${input.command.commandRequestId}` ||
    input.handoff.work_id !== `work:${input.command.subSessionId}`
  ) {
    return { ok: false, reasonCode: "handoff_command_mismatch" }
  }
  if (
    input.command.targetAgentId !== input.agent.agentId ||
    input.handoff.target_agent_name !== input.agent.agentName ||
    input.command.targetAgentNameSnapshot !== input.agent.agentName
  ) {
    return { ok: false, reasonCode: "handoff_target_mismatch" }
  }
  const handoffValidation = validateWorkHandoffPackage(input.handoff)
  if (!handoffValidation.ok) return { ok: false, reasonCode: "handoff_invalid" }
  if (
    input.promptBundle.agentId !== input.agent.agentId ||
    input.promptBundle.agentNameSnapshot !== input.agent.agentName
  ) {
    return { ok: false, reasonCode: "prompt_bundle_agent_mismatch" }
  }

  const payload: SnapshotPayload = structuredClone({
    schemaVersion: "delegated-execution-snapshot-v1",
    commandRequestId: input.command.commandRequestId,
    subSessionId: input.command.subSessionId,
    handoff: input.handoff,
    agent: input.agent,
    prompt: {
      bundleId: input.promptBundle.bundleId,
      ...(input.promptBundle.promptChecksum
        ? { checksum: input.promptBundle.promptChecksum }
        : {}),
    },
    ...(input.promptBundle.modelProfileSnapshot
      ? { modelProfile: input.promptBundle.modelProfileSnapshot }
      : {}),
    capabilityPolicy: input.promptBundle.capabilityPolicy,
  })
  return {
    ok: true,
    snapshot: deepFreeze({ ...payload, fingerprint: fingerprint(payload) }),
  }
}

export function validateDelegatedExecutionSnapshot(
  snapshot: DelegatedExecutionSnapshot,
  expected?: {
    commandRequestId: string
    subSessionId: string
    agentId: string
    promptBundleId: string
  },
): {
  valid: boolean
  reasonCode:
    | "delegated_execution_snapshot_valid"
    | "delegated_execution_snapshot_runtime_mismatch"
    | "delegated_execution_snapshot_fingerprint_mismatch"
} {
  const { fingerprint: expectedFingerprint, ...payload } = snapshot
  if (fingerprint(payload) !== expectedFingerprint) {
    return {
      valid: false,
      reasonCode: "delegated_execution_snapshot_fingerprint_mismatch",
    }
  }
  if (
    expected &&
    (
      snapshot.commandRequestId !== expected.commandRequestId ||
      snapshot.subSessionId !== expected.subSessionId ||
      snapshot.agent.agentId !== expected.agentId ||
      snapshot.prompt.bundleId !== expected.promptBundleId
    )
  ) {
    return { valid: false, reasonCode: "delegated_execution_snapshot_runtime_mismatch" }
  }
  return { valid: true, reasonCode: "delegated_execution_snapshot_valid" }
}
