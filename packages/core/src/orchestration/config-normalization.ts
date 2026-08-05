import { normalizeSkillMcpAllowlist } from "../security/capability-isolation.js"
import { normalizeAgentName, type TeamMembershipStatus } from "../contracts/sub-agent-orchestration.js"
import { canonicalizeLegacyTeamIdentity } from "../adapters/legacy-team-identity.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function normalizeMembershipStatus(value: unknown, fallback: TeamMembershipStatus): TeamMembershipStatus {
  switch (value) {
    case "active":
    case "inactive":
    case "fallback_only":
    case "removed":
      return value
    default:
      return fallback
  }
}

export function normalizeLegacyAgentConfigRow(value: unknown): unknown {
  if (!isRecord(value)) return value
  const normalizedValue: Record<string, unknown> = { ...value }
  delete normalizedValue.displayName
  delete normalizedValue.display_name
  delete normalizedValue.nameForDisplay
  delete normalizedValue.nickname
  delete normalizedValue.normalizedNickname

  const capabilityPolicy = isRecord(value.capabilityPolicy) ? value.capabilityPolicy : {}
  const permissionProfile = isRecord(capabilityPolicy.permissionProfile) ? capabilityPolicy.permissionProfile : {}
  const allowlist = normalizeSkillMcpAllowlist(
    isRecord(capabilityPolicy.skillMcpAllowlist) ? capabilityPolicy.skillMcpAllowlist : {},
  )
  const legacyAgentName =
    asString(value.agentName) ??
    asString(value.nickname) ??
    asString(value.displayName) ??
    asString(value.display_name) ??
    asString(value.nameForDisplay)
  const delegation = isRecord(value.delegation) ? value.delegation : {}
  const coordinator = isRecord(value.coordinator) ? value.coordinator : {}
  const modelProfile = isRecord(value.modelProfile) ? value.modelProfile : {}
  const normalizedAgentName =
    asString(value.normalizedAgentName) ?? (legacyAgentName ? normalizeAgentName(legacyAgentName) : undefined)
  const delegationPolicy = isRecord(value.delegationPolicy)
    ? value.delegationPolicy
    : {
        enabled: asBoolean(delegation.enabled) ?? value.agentType === "knowbee",
        maxParallelSessions: asNumber(delegation.maxParallelSessions) ?? asNumber(coordinator.maxDelegatedSubSessions) ?? 1,
      }
  return {
    ...normalizedValue,
    ...(legacyAgentName ? { agentName: legacyAgentName } : {}),
    ...(normalizedAgentName ? { normalizedAgentName } : {}),
    specialtyTags: asStringArray(value.specialtyTags),
    avoidTasks: asStringArray(value.avoidTasks),
    teamIds: asStringArray(value.teamIds),
    modelProfile: {
      providerId: asString(modelProfile.providerId) ?? "provider:unknown",
      modelId: asString(modelProfile.modelId) ?? "model:unknown",
      ...(asNumber(modelProfile.temperature) !== undefined ? { temperature: asNumber(modelProfile.temperature) } : {}),
      ...(asNumber(modelProfile.maxOutputTokens) !== undefined ? { maxOutputTokens: asNumber(modelProfile.maxOutputTokens) } : {}),
      ...(asNumber(modelProfile.timeoutMs) !== undefined ? { timeoutMs: asNumber(modelProfile.timeoutMs) } : {}),
      ...(asNumber(modelProfile.retryCount) !== undefined ? { retryCount: asNumber(modelProfile.retryCount) } : {}),
      ...(asNumber(modelProfile.costBudget) !== undefined ? { costBudget: asNumber(modelProfile.costBudget) } : {}),
      ...(asString(modelProfile.fallbackModelId) ? { fallbackModelId: asString(modelProfile.fallbackModelId) } : {}),
    },
    delegationPolicy,
    capabilityPolicy: {
      ...capabilityPolicy,
      permissionProfile: {
        ...permissionProfile,
        allowedPaths: asStringArray(permissionProfile.allowedPaths),
      },
      skillMcpAllowlist: allowlist,
    },
  }
}

export function normalizeLegacyTeamConfigRow(value: unknown): unknown {
  if (!isRecord(value)) return value
  const canonical = canonicalizeLegacyTeamIdentity(value)
  const memberAgentIds = asStringArray(canonical.memberAgentIds)
  const roleHints = asStringArray(canonical.roleHints)
  const memberships = Array.isArray(value.memberships)
    ? value.memberships
        .filter(isRecord)
        .map((membership, index) => {
          const teamRoles = asStringArray(membership.teamRoles)
          const primaryRole = asString(membership.primaryRole) ?? teamRoles[0] ?? roleHints[index] ?? "member"
          return {
            ...membership,
            membershipId: asString(membership.membershipId) ?? `${asString(value.teamId) ?? "team"}:membership:${index + 1}`,
            teamId: asString(membership.teamId) ?? asString(value.teamId) ?? "team:unknown",
            agentId: asString(membership.agentId) ?? memberAgentIds[index] ?? `agent:unknown:${index + 1}`,
            teamRoles: teamRoles.length > 0 ? teamRoles : [primaryRole],
            primaryRole,
            required: asBoolean(membership.required) ?? true,
            sortOrder: asNumber(membership.sortOrder) ?? index,
            status: normalizeMembershipStatus(membership.status, "active"),
          }
        })
    : memberAgentIds.map((agentId, index) => {
        const primaryRole = roleHints[index] ?? "member"
        return {
          membershipId: `${asString(value.teamId) ?? "team"}:membership:${index + 1}`,
          teamId: asString(value.teamId) ?? "team:unknown",
          agentId,
          teamRoles: [primaryRole],
          primaryRole,
          required: true,
          sortOrder: index,
          status: normalizeMembershipStatus(undefined, value.status === "disabled" ? "inactive" : "active"),
        }
      })
  const ownerAgentId = asString(value.ownerAgentId) ?? "agent:knowbee"
  const leadAgentId = asString(value.leadAgentId) ?? memberships[0]?.agentId ?? ownerAgentId
  const requiredTeamRoles = Array.from(new Set([
    ...asStringArray(value.requiredTeamRoles),
    ...memberships.map((membership) => membership.primaryRole).filter(Boolean),
  ]))
  const memberCountMin = asNumber(value.memberCountMin) ?? memberships.filter((membership) => membership.required).length
  const memberCountMax = asNumber(value.memberCountMax) ?? Math.max(memberCountMin, memberships.length)
  return {
    ...canonical,
    ownerAgentId,
    leadAgentId,
    memberCountMin,
    memberCountMax,
    requiredTeamRoles,
    requiredCapabilityTags: asStringArray(value.requiredCapabilityTags),
    resultPolicy: asString(value.resultPolicy) ?? "lead_synthesis",
    conflictPolicy: asString(value.conflictPolicy) ?? "lead_decides",
    memberships,
    memberAgentIds,
    roleHints,
  }
}
