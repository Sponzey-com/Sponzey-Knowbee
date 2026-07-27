import type { KnowbeeConfig } from "../config/types.js"
import { toCanonicalJson } from "../contracts/index.js"
import type { AgentConfig } from "../contracts/sub-agent-orchestration.js"
import {
  compareAndUpdateAgentOperationalSettings,
  getAgentOperationalSettingsMutationReceiptByNonce,
  listAgentConfigs,
  reserveAgentOperationalSettingsMutationReceipt,
  updateAgentOperationalSettingsMutationReceipt,
} from "../db/index.js"
import type {
  AgentOperationalSettingsCommandPorts,
  AgentOperationalSettingsMutationReceipt,
  AgentOperationalSettingsState,
} from "./agent-operational-settings-command.js"
import { createAgentPublicRef } from "./agent-public-reference.js"

function parseAgentConfig(value: string): AgentConfig | null {
  try {
    return JSON.parse(value) as AgentConfig
  } catch {
    return null
  }
}

function parseReceipt(value: string | null): AgentOperationalSettingsMutationReceipt | null {
  if (!value) return null
  try {
    return JSON.parse(value) as AgentOperationalSettingsMutationReceipt
  } catch {
    return null
  }
}

function toState(config: AgentConfig): AgentOperationalSettingsState {
  return {
    internalAgentId: config.agentId,
    active: config.status === "enabled",
    root: config.agentType === "knowbee",
    revision: config.profileVersion,
    ...(config.modelProfile ? { modelProfile: structuredClone(config.modelProfile) } : {}),
    memoryPolicy: structuredClone(config.memoryPolicy),
    permissionProfile: structuredClone(config.capabilityPolicy.permissionProfile),
  }
}

function sameSettings(left: AgentOperationalSettingsState, right: AgentOperationalSettingsState) {
  return (
    left.internalAgentId === right.internalAgentId &&
    left.revision === right.revision &&
    toCanonicalJson(left.modelProfile ?? null) === toCanonicalJson(right.modelProfile ?? null) &&
    toCanonicalJson(left.memoryPolicy) === toCanonicalJson(right.memoryPolicy) &&
    toCanonicalJson(left.permissionProfile) === toCanonicalJson(right.permissionProfile)
  )
}

export function createSqliteAgentOperationalSettingsCommandPorts(input: {
  config: KnowbeeConfig
  now?: () => number
}): AgentOperationalSettingsCommandPorts {
  const now = input.now ?? Date.now
  const rootAgentId = input.config.orchestration.knowbee?.agentId ?? "agent:knowbee"
  const configByInternalId = (agentId: string): AgentConfig | null => {
    if (agentId === rootAgentId && input.config.orchestration.knowbee)
      return input.config.orchestration.knowbee
    const row = listAgentConfigs({ includeArchived: true }).find(
      (candidate) => candidate.agent_id === agentId,
    )
    return row ? parseAgentConfig(row.config_json) : null
  }
  const internalIdForRef = (agentRef: string): string | null => {
    if (createAgentPublicRef(rootAgentId) === agentRef) return rootAgentId
    const matches = listAgentConfigs({ includeArchived: true }).filter(
      (row) => createAgentPublicRef(row.agent_id) === agentRef,
    )
    return matches.length === 1 && matches[0] ? matches[0].agent_id : null
  }

  return {
    now,
    receiptByNonce(nonce) {
      const row = getAgentOperationalSettingsMutationReceiptByNonce(nonce)
      const receipt = row ? parseReceipt(row.receipt_json) : null
      if (!row || !receipt) return null
      return {
        mutationId: row.mutation_id,
        requestFingerprint: row.request_fingerprint,
        receipt,
      }
    },
    reserveReceipt(reservation) {
      return reserveAgentOperationalSettingsMutationReceipt({
        mutationId: reservation.envelope.mutationId,
        nonce: reservation.envelope.nonce,
        actorRef: reservation.envelope.actorRef,
        scope: reservation.envelope.scope,
        purpose: reservation.envelope.purpose,
        mutationKind: reservation.kind,
        targetRevision: reservation.envelope.targetRevision,
        state: reservation.state,
        requestFingerprint: reservation.requestFingerprint,
        now: reservation.now,
      })
    },
    finishReceipt(finish) {
      updateAgentOperationalSettingsMutationReceipt({
        mutationId: finish.mutationId,
        state: finish.state,
        reasonCode: finish.reasonCode,
        receiptJson: JSON.stringify(finish.receipt),
        now: finish.now,
      })
    },
    current(agentRef) {
      const agentId = internalIdForRef(agentRef)
      const config = agentId ? configByInternalId(agentId) : null
      return config ? toState(config) : null
    },
    persist(persist) {
      const result = compareAndUpdateAgentOperationalSettings({
        agentId: persist.current.internalAgentId,
        expectedRevision: persist.expectedRevision,
        targetRevision: persist.targetRevision,
        ...(persist.next.modelProfile ? { modelProfile: persist.next.modelProfile } : {}),
        memoryPolicy: persist.next.memoryPolicy,
        permissionProfile: persist.next.permissionProfile,
        now: now(),
      })
      return result === "updated"
        ? { ok: true, revision: persist.targetRevision }
        : {
            ok: false,
            revision: configByInternalId(persist.current.internalAgentId)?.profileVersion ?? 0,
            reasonCode: result === "revision_conflict" ? "agent_revision_conflict" : result,
          }
    },
    verify(verification) {
      const config = configByInternalId(verification.internalAgentId)
      const actual = config ? toState(config) : null
      return {
        ok: Boolean(actual && sameSettings(actual, verification.expected)),
        reasonCode: "agent_operational_settings_verify_failed",
      }
    },
    rollback(rollback) {
      const result = compareAndUpdateAgentOperationalSettings({
        agentId: rollback.previous.internalAgentId,
        expectedRevision: rollback.failedRevision,
        targetRevision: rollback.previous.revision,
        ...(rollback.previous.modelProfile ? { modelProfile: rollback.previous.modelProfile } : {}),
        memoryPolicy: rollback.previous.memoryPolicy,
        permissionProfile: rollback.previous.permissionProfile,
        now: now(),
      })
      return {
        ok: result === "updated",
        ...(result === "updated" ? {} : { reasonCode: `agent_settings_rollback_${result}` }),
      }
    },
  }
}
