import type { FastifyInstance, FastifyReply } from "fastify"
import { canonicalizeLegacyTeamIdentity } from "../../adapters/legacy-team-identity.js"
import {
  listAgentLearningEvents,
  listHistoryVersions,
  listLearningReviewQueue,
  listRestoreEvents,
  restoreHistoryVersion,
} from "../../agent/learning.js"
import { resolveMainAgentSelfName } from "../../agent/main-agent-identity.js"
import { executeAgentCapabilityBindingCommand } from "../../agents/agent-capability-binding-command.js"
import { buildAgentCapabilityBindingProjection } from "../../agents/agent-capability-binding-projection.js"
import {
  capabilityPublicRef,
  createSqliteAgentCapabilityBindingCommandPorts,
  listAgentCapabilityBindingSources,
  listAgentCapabilityCatalogSources,
  resolveInternalAgentId,
} from "../../agents/agent-capability-binding-repository.js"
import { createSqliteAgentIdentityCommandRepository } from "../../agents/agent-identity-command-repository.js"
import { executeAgentIdentityCommand } from "../../agents/agent-identity-command.js"
import { executeAgentOperationalSettingsCommand } from "../../agents/agent-operational-settings-command.js"
import { buildAgentOperationalSettingsProjection } from "../../agents/agent-operational-settings-projection.js"
import { createSqliteAgentOperationalSettingsCommandPorts } from "../../agents/agent-operational-settings-repository.js"
import { createAgentPublicRef } from "../../agents/agent-public-reference.js"
import { executeAgentRelationshipCommand } from "../../agents/agent-relationship-command.js"
import {
  buildSqliteAgentRelationshipProjection,
  createSqliteAgentRelationshipCommandPorts,
} from "../../agents/agent-relationship-repository.js"
import { buildAgentWorkspaceProjection } from "../../agents/agent-workspace-projection.js"
import { createArtifactStorageContext } from "../../artifacts/lifecycle.js"
import type { KnowbeeConfig } from "../../config/types.js"
import {
  type AgentConfig,
  type TeamConfig,
  type TeamMembership,
  validateAgentConfig,
  validateTeamConfig,
} from "../../contracts/sub-agent-orchestration.js"
import {
  AgentNameNamespaceError,
  type DbAgentTeamMembership,
  getDb,
  listAgentCapabilityBindings,
  listAgentRelationships,
  listAgentTeamMemberships,
  listMcpServerCatalogEntries,
  listSkillCatalogEntries,
} from "../../db/index.js"
import { createLogger, redactLogText } from "../../logger/index.js"
import type { MemoryJournalRepository } from "../../memory/journal.js"
import {
  type AgentHierarchyStorage,
  createAgentHierarchyService,
  createAgentHierarchyStorage,
} from "../../orchestration/hierarchy.js"
import {
  createAgentRegistryService,
  createTeamRegistryService,
} from "../../orchestration/registry.js"
import { createTeamCompositionService } from "../../orchestration/team-composition.js"
import { createTeamExecutionPlanService } from "../../orchestration/team-execution-plan.js"
import { createAgentTopologyService } from "../../orchestration/topology-projection.js"
import { type SanitizedErrorSummary, sanitizeUserFacingError } from "../../runs/error-sanitizer.js"
import { listYeonjangRegistryInstances } from "../../yeonjang/registry.js"
import { authMiddleware } from "../middleware/auth.js"
import { getApiRuntimeConfig, getApiRuntimePaths } from "../runtime-context.js"
import { registerAgentWorkspaceRoute } from "./agent-workspace.js"
import { resolveWebUiClientRequestId, startLocalRun } from "./runs.js"

type EntityEnvelope = {
  agent?: unknown
  team?: unknown
  imported?: boolean
  auditId?: string
  idempotencyKey?: string
  apply?: boolean
  dryRun?: boolean
  restoredHistoryVersionId?: string
  historyVersionId?: string
  memberAgentIds?: unknown
  roleHints?: unknown
  memberships?: unknown
  relationship?: unknown
  edge?: unknown
  layout?: unknown
  maxDepth?: unknown
  maxChildCount?: unknown
  teamExecutionPlanId?: string
  parentRunId?: string
  parentRequestId?: string
  userRequest?: string
  persist?: boolean
}

type LearningQueueQuery = {
  limit?: string
}

type ApiTeamMember = Omit<TeamMembership, "status"> & {
  status: TeamMembership["status"] | "unresolved"
  roleHint?: string
  auditId?: string
  createdAt: number
  updatedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFastifyReply(value: unknown): value is FastifyReply {
  return isRecord(value) && typeof value.send === "function"
}

function requestEnvelope(body: unknown): EntityEnvelope {
  return isRecord(body) ? (body as EntityEnvelope) : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  )
  return strings.length === value.length ? strings : undefined
}

function asPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined
}

function asQueryLimit(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function learningQueueQuery(agentId: string | undefined, limit: string | undefined) {
  const parsedLimit = asQueryLimit(limit)
  return {
    ...(agentId ? { agentId } : {}),
    ...(parsedLimit ? { limit: parsedLimit } : {}),
  }
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

function persistenceOptions(body: unknown): {
  imported?: boolean
  source: "manual" | "import"
  auditId?: string | null
  idempotencyKey?: string | null
} {
  const envelope = requestEnvelope(body)
  return {
    imported: envelope.imported === true,
    source: envelope.imported === true ? "import" : "manual",
    auditId: asString(envelope.auditId) ?? null,
    idempotencyKey: asString(envelope.idempotencyKey) ?? null,
  }
}

function sendValidationError(
  reply: FastifyReply,
  reasonCode: string,
  issues: unknown,
): FastifyReply {
  return reply.status(400).send({
    ok: false,
    error: reasonCode,
    reasonCode,
    issues,
  })
}

function teamValidationReasonCode(issues: unknown): string {
  if (!Array.isArray(issues)) return "invalid_team_config"
  for (const issue of issues) {
    if (!isRecord(issue) || typeof issue.path !== "string") continue
    if (issue.path.startsWith("$.memberships")) return "invalid_membership"
    if (issue.path === "$.leadAgentId") return "invalid_lead"
  }
  return "invalid_team_config"
}

function agentRoutePersistenceErrorSummary(error: unknown): SanitizedErrorSummary {
  const rawMessage = error instanceof Error ? error.message : String(error)
  return sanitizeUserFacingError(redactLogText(rawMessage))
}

function sendPersistenceError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AgentNameNamespaceError) {
    return reply.status(409).send({
      ok: false,
      error: error.details.reasonCode,
      reasonCode: error.details.reasonCode,
      details: error.details,
    })
  }

  const sanitized = agentRoutePersistenceErrorSummary(error)
  return reply.status(500).send({
    ok: false,
    error: "agent_team_api_write_failed",
    reasonCode: "agent_team_api_write_failed",
    message: sanitized.userMessage,
    kind: sanitized.kind,
    actionHint: sanitized.actionHint,
  })
}

function agentPayload(body: unknown): unknown {
  const envelope = requestEnvelope(body)
  return envelope.agent ?? body
}

function teamPayload(body: unknown): unknown {
  const envelope = requestEnvelope(body)
  return envelope.team ?? body
}

function relationshipPayload(body: unknown): unknown {
  const envelope = requestEnvelope(body)
  return envelope.relationship ?? body
}

function topologyEdgePayload(body: unknown): unknown {
  const envelope = requestEnvelope(body)
  return envelope.edge ?? body
}

function teamCompositionInput(teamId: string, body: unknown): string | unknown {
  const envelope = requestEnvelope(body)
  if (envelope.team !== undefined) return envelope.team
  if (isRecord(body) && typeof body.teamId === "string") return body
  return teamId
}

function sendTeamCompositionFailure(
  reply: FastifyReply,
  diagnostics: Array<{ reasonCode: string }>,
): FastifyReply {
  const reasonCode = diagnostics[0]?.reasonCode ?? "invalid_team_composition"
  return reply.status(reasonCode === "team_not_found" ? 404 : 400).send({
    ok: false,
    error: reasonCode,
    reasonCode,
    diagnostics,
  })
}

function hierarchyService(config: KnowbeeConfig, storage: AgentHierarchyStorage, body?: unknown) {
  const envelope = requestEnvelope(body)
  const maxDepth = asPositiveInteger(envelope.maxDepth)
  const maxChildCount = asPositiveInteger(envelope.maxChildCount)
  return createAgentHierarchyService({
    config,
    storage,
    ...(maxDepth !== undefined ? { maxDepth } : {}),
    ...(maxChildCount !== undefined ? { maxChildCount } : {}),
  })
}

function agentRegistryService(config: KnowbeeConfig) {
  return createAgentRegistryService({ config })
}

function teamRegistryService(config: KnowbeeConfig) {
  return createTeamRegistryService({ config })
}

function mergeAgentPatch(current: AgentConfig, patch: unknown, agentId: string): AgentConfig {
  const now = Date.now()
  const patchRecord = isRecord(patch) ? patch : {}
  const merged = {
    ...current,
    ...patchRecord,
    agentId,
    agentType: current.agentType,
    createdAt: current.createdAt,
    updatedAt: now,
    profileVersion:
      typeof patchRecord.profileVersion === "number"
        ? patchRecord.profileVersion
        : current.profileVersion + 1,
  } as AgentConfig
  if ("agentName" in patchRecord) {
    Reflect.deleteProperty(merged as unknown as Record<string, unknown>, "displayName")
    Reflect.deleteProperty(merged as unknown as Record<string, unknown>, "nickname")
    Reflect.deleteProperty(merged as unknown as Record<string, unknown>, "normalizedNickname")
    if (!("normalizedAgentName" in patchRecord)) {
      Reflect.deleteProperty(merged as unknown as Record<string, unknown>, "normalizedAgentName")
    }
  }
  return merged
}

function mergeTeamPatch(current: TeamConfig, patch: unknown, teamId: string): TeamConfig {
  const now = Date.now()
  const patchRecord = isRecord(patch) ? patch : {}
  return {
    ...current,
    ...patchRecord,
    teamId,
    createdAt: current.createdAt,
    updatedAt: now,
    profileVersion:
      typeof patchRecord.profileVersion === "number"
        ? patchRecord.profileVersion
        : current.profileVersion + 1,
  } as TeamConfig
}

function memberFromRow(row: DbAgentTeamMembership): ApiTeamMember {
  const roles = parseJsonArray(row.team_roles_json)
  return {
    membershipId: row.membership_id,
    teamId: row.team_id,
    agentId: row.agent_id,
    ...(row.owner_agent_id_snapshot ? { ownerAgentIdSnapshot: row.owner_agent_id_snapshot } : {}),
    teamRoles: roles,
    primaryRole: row.primary_role,
    required: row.required === 1,
    ...(row.fallback_for_agent_id ? { fallbackForAgentId: row.fallback_for_agent_id } : {}),
    sortOrder: row.sort_order,
    status: row.status,
    ...(row.role_hint ? { roleHint: row.role_hint } : {}),
    ...(row.audit_id ? { auditId: row.audit_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildTeamDiagnostics(team: TeamConfig): Array<{
  reasonCode: string
  message: string
  agentId?: string
  teamId: string
}> {
  const members = listAgentTeamMemberships(team.teamId).map(memberFromRow)
  const diagnostics: Array<{
    reasonCode: string
    message: string
    agentId?: string
    teamId: string
  }> = []
  const memberIds = new Set(team.memberAgentIds)

  if (team.leadAgentId && !memberIds.has(team.leadAgentId)) {
    diagnostics.push({
      reasonCode: "invalid_lead_not_member",
      teamId: team.teamId,
      agentId: team.leadAgentId,
      message: `${team.teamId} lead ${team.leadAgentId} is not listed as a member.`,
    })
  }

  for (const member of members) {
    if (member.status === "unresolved") {
      diagnostics.push({
        reasonCode: "invalid_member_unresolved",
        teamId: team.teamId,
        agentId: member.agentId,
        message: `${team.teamId} references missing agent ${member.agentId}.`,
      })
    }
  }

  if (team.leadAgentId) {
    const leadMember = members.find((member) => member.agentId === team.leadAgentId)
    if (leadMember && leadMember.status !== "active") {
      diagnostics.push({
        reasonCode: "invalid_lead_unavailable",
        teamId: team.teamId,
        agentId: team.leadAgentId,
        message: `${team.teamId} lead ${team.leadAgentId} is ${leadMember.status}.`,
      })
    }
  }

  return diagnostics
}

function teamMembersResponse(team: TeamConfig): {
  teamId: string
  members: ApiTeamMember[]
  diagnostics: ReturnType<typeof buildTeamDiagnostics>
} {
  return {
    teamId: team.teamId,
    members: listAgentTeamMemberships(team.teamId).map(memberFromRow),
    diagnostics: buildTeamDiagnostics(team),
  }
}

function validateAndStoreAgent(
  config: KnowbeeConfig,
  reply: FastifyReply,
  input: unknown,
  body: unknown,
): AgentConfig | FastifyReply {
  const validation = validateAgentConfig(input)
  if (!validation.ok) return sendValidationError(reply, "invalid_agent_config", validation.issues)
  try {
    agentRegistryService(config).createOrUpdate(validation.value, persistenceOptions(body))
    const stored = agentRegistryService(config).get(validation.value.agentId)
    return stored ?? validation.value
  } catch (error) {
    return sendPersistenceError(reply, error)
  }
}

function validateAndStoreTeam(
  config: KnowbeeConfig,
  reply: FastifyReply,
  input: unknown,
  body: unknown,
): TeamConfig | FastifyReply {
  const canonicalInput =
    isRecord(body) && body.imported === true && isRecord(input)
      ? canonicalizeLegacyTeamIdentity(input)
      : input
  const validation = validateTeamConfig(canonicalInput)
  if (!validation.ok)
    return sendValidationError(
      reply,
      teamValidationReasonCode(validation.issues),
      validation.issues,
    )
  try {
    teamRegistryService(config).createOrUpdate(validation.value, persistenceOptions(body))
    const stored = teamRegistryService(config).get(validation.value.teamId)
    return stored ?? validation.value
  } catch (error) {
    return sendPersistenceError(reply, error)
  }
}

export function registerAgentRoutes(
  app: FastifyInstance,
  memoryJournal: MemoryJournalRepository,
): void {
  const hierarchyStorage = createAgentHierarchyStorage(app.knowbeeRuntimeContext.paths)
  const workspaceLogger = createLogger("api:agent-workspace")

  registerAgentWorkspaceRoute(app, {
    logger: {
      product: (fields) => workspaceLogger.product("Agent workspace queried", fields),
      fieldDebug: (fields) => workspaceLogger.fieldDebug("Agent workspace query detail", fields),
      development: (fields) =>
        workspaceLogger.development("Agent workspace query transition", fields),
    },
    executeIdentityCommand: (request, command) =>
      executeAgentIdentityCommand(
        command,
        createSqliteAgentIdentityCommandRepository({ config: getApiRuntimeConfig(request) }),
      ),
    capabilityProjection: (_request, agentRef) => {
      const agentId = resolveInternalAgentId(agentRef)
      if (!agentId) return null
      return buildAgentCapabilityBindingProjection({
        agentId,
        agentRef,
        catalog: listAgentCapabilityCatalogSources(),
        bindings: listAgentCapabilityBindingSources(),
        observedAt: Date.now(),
        publicRefForCapability: capabilityPublicRef,
      })
    },
    executeCapabilityBindingCommand: (_request, command) =>
      executeAgentCapabilityBindingCommand(
        command,
        createSqliteAgentCapabilityBindingCommandPorts(),
      ),
    relationshipProjection: (request) =>
      buildSqliteAgentRelationshipProjection({ config: getApiRuntimeConfig(request) }),
    executeRelationshipCommand: (request, command) =>
      executeAgentRelationshipCommand(
        command,
        createSqliteAgentRelationshipCommandPorts({
          config: getApiRuntimeConfig(request),
          storage: hierarchyStorage,
        }),
      ),
    settingsProjection: (request, agentRef) => {
      const agentId = resolveInternalAgentId(agentRef)
      if (!agentId) return null
      const agent = agentRegistryService(getApiRuntimeConfig(request)).get(agentId)
      if (!agent) return null
      return buildAgentOperationalSettingsProjection({
        agentRef,
        status: agent.status,
        profileVersion: agent.profileVersion,
        modelProfile: agent.modelProfile,
        memoryPolicy: agent.memoryPolicy,
        permissionProfile: agent.capabilityPolicy.permissionProfile,
        observedAt: Date.now(),
      })
    },
    executeOperationalSettingsCommand: (request, command) =>
      executeAgentOperationalSettingsCommand(
        command,
        createSqliteAgentOperationalSettingsCommandPorts({ config: getApiRuntimeConfig(request) }),
      ),
    projection: (request) => {
      const config = getApiRuntimeConfig(request)
      const agents = agentRegistryService(config).list()
      const displayNames = new Map<string, string>()
      for (const skill of listSkillCatalogEntries({ includeArchived: true }))
        displayNames.set(`skill:${skill.skill_id}`, skill.display_name)
      for (const server of listMcpServerCatalogEntries({ includeArchived: true }))
        displayNames.set(`mcp_server:${server.mcp_server_id}`, server.display_name)
      for (const yeonjang of listYeonjangRegistryInstances({ now: Date.now() }))
        displayNames.set(`yeonjang:${yeonjang.instanceId}`, yeonjang.displayName)
      return buildAgentWorkspaceProjection({
        agents: agents.map((agent) => ({
          agentId: agent.agentId,
          agentType: agent.agentType,
          status: agent.status,
          agentName: agent.agentName,
          role: agent.role,
          profileVersion: agent.profileVersion,
          updatedAt: agent.updatedAt,
          model: {
            configured: Boolean(agent.modelProfile),
            availability: agent.modelProfile ? "unknown" : "unavailable",
            ...(agent.modelProfile?.modelId ? { modelName: agent.modelProfile.modelId } : {}),
          },
        })),
        bindings: listAgentCapabilityBindings({ includeArchived: true }).map((binding) => ({
          agentId: binding.agent_id,
          kind: binding.capability_kind,
          status: binding.status,
          ...(displayNames.get(`${binding.capability_kind}:${binding.catalog_id}`)
            ? {
                displayName: displayNames.get(
                  `${binding.capability_kind}:${binding.catalog_id}`,
                ) as string,
              }
            : {}),
        })),
        relationships: listAgentRelationships().map((relationship) => ({
          parentAgentId: relationship.parent_agent_id,
          childAgentId: relationship.child_agent_id,
          status: relationship.status,
        })),
        mainAgentName: resolveMainAgentSelfName(config),
        observedAt: Date.now(),
        publicRefForAgentId: createAgentPublicRef,
      })
    },
  })

  app.get("/api/agents", { preHandler: authMiddleware }, async (req) => ({
    ok: true,
    generatedAt: Date.now(),
    agents: agentRegistryService(getApiRuntimeConfig(req)).list(),
  }))

  app.post<{ Body: EntityEnvelope | AgentConfig }>(
    "/api/agents",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const stored = validateAndStoreAgent(
        getApiRuntimeConfig(req),
        reply,
        agentPayload(req.body),
        req.body,
      )
      if (isFastifyReply(stored)) return stored
      return { ok: true, agent: stored }
    },
  )

  app.get<{ Params: { agentId: string } }>(
    "/api/agents/:agentId",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const agent = agentRegistryService(getApiRuntimeConfig(req)).get(req.params.agentId)
      if (!agent)
        return reply
          .status(404)
          .send({ ok: false, error: "agent_not_found", reasonCode: "agent_not_found" })
      return { ok: true, agent }
    },
  )

  app.patch<{ Params: { agentId: string }; Body: EntityEnvelope | Partial<AgentConfig> }>(
    "/api/agents/:agentId",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const current = agentRegistryService(getApiRuntimeConfig(req)).get(req.params.agentId)
      if (!current)
        return reply
          .status(404)
          .send({ ok: false, error: "agent_not_found", reasonCode: "agent_not_found" })
      const stored = validateAndStoreAgent(
        getApiRuntimeConfig(req),
        reply,
        mergeAgentPatch(current, agentPayload(req.body), req.params.agentId),
        req.body,
      )
      if (isFastifyReply(stored)) return stored
      return { ok: true, agent: stored }
    },
  )

  app.post<{ Params: { agentId: string } }>(
    "/api/agents/:agentId/disable",
    { preHandler: authMiddleware },
    async (req, reply) => {
      if (!agentRegistryService(getApiRuntimeConfig(req)).disable(req.params.agentId)) {
        return reply
          .status(404)
          .send({ ok: false, error: "agent_not_found", reasonCode: "agent_not_found" })
      }
      return {
        ok: true,
        agent: agentRegistryService(getApiRuntimeConfig(req)).get(req.params.agentId),
      }
    },
  )

  app.post<{ Params: { agentId: string } }>(
    "/api/agents/:agentId/archive",
    { preHandler: authMiddleware },
    async (req, reply) => {
      if (!agentRegistryService(getApiRuntimeConfig(req)).archive(req.params.agentId)) {
        return reply
          .status(404)
          .send({ ok: false, error: "agent_not_found", reasonCode: "agent_not_found" })
      }
      return {
        ok: true,
        agent: agentRegistryService(getApiRuntimeConfig(req)).get(req.params.agentId),
      }
    },
  )

  app.get<{ Params: { agentId: string } }>(
    "/api/agents/:agentId/history",
    { preHandler: authMiddleware },
    async (req) => ({
      ok: true,
      agentId: req.params.agentId,
      history: listHistoryVersions("agent", req.params.agentId),
      restores: listRestoreEvents("agent", req.params.agentId),
    }),
  )

  app.get<{ Params: { agentId: string }; Querystring: LearningQueueQuery }>(
    "/api/agents/:agentId/learning",
    { preHandler: authMiddleware },
    async (req) => ({
      ok: true,
      agentId: req.params.agentId,
      events: listAgentLearningEvents(req.params.agentId),
      reviewQueue: listLearningReviewQueue(learningQueueQuery(req.params.agentId, req.query.limit)),
    }),
  )

  app.get<{ Querystring: LearningQueueQuery }>(
    "/api/learning/review-queue",
    { preHandler: authMiddleware },
    async (req) => ({
      ok: true,
      generatedAt: Date.now(),
      items: listLearningReviewQueue(learningQueueQuery(undefined, req.query.limit)),
    }),
  )

  app.post<{
    Params: { agentId: string }
    Body: EntityEnvelope
  }>("/api/agents/:agentId/restore", { preHandler: authMiddleware }, async (req, reply) => {
    const body = requestEnvelope(req.body)
    const restoredHistoryVersionId =
      asString(body.restoredHistoryVersionId) ?? asString(body.historyVersionId)
    if (!restoredHistoryVersionId) {
      return reply.status(400).send({
        ok: false,
        error: "history_version_id_required",
        reasonCode: "history_version_id_required",
      })
    }
    const auditCorrelationId = asString(body.auditId)
    const idempotencyKey = asString(body.idempotencyKey)
    const result = restoreHistoryVersion({
      targetEntityType: "agent",
      targetEntityId: req.params.agentId,
      restoredHistoryVersionId,
      owner: { ownerType: "system", ownerId: "api" },
      dryRun: body.dryRun ?? body.apply !== true,
      apply: body.apply === true,
      ...(auditCorrelationId ? { auditCorrelationId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    })
    return reply.status(result.ok ? 200 : 404).send({ ok: result.ok, result })
  })

  app.get("/api/teams", { preHandler: authMiddleware }, async (req) => ({
    ok: true,
    generatedAt: Date.now(),
    teams: teamRegistryService(getApiRuntimeConfig(req))
      .list()
      .map((team) => ({
        ...team,
        diagnostics: buildTeamDiagnostics(team),
      })),
  }))

  app.post<{ Body: EntityEnvelope | TeamConfig }>(
    "/api/teams",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const stored = validateAndStoreTeam(
        getApiRuntimeConfig(req),
        reply,
        teamPayload(req.body),
        req.body,
      )
      if (isFastifyReply(stored)) return stored
      return { ok: true, team: stored, ...teamMembersResponse(stored) }
    },
  )

  app.get<{ Params: { teamId: string } }>(
    "/api/teams/:teamId",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const team = teamRegistryService(getApiRuntimeConfig(req)).get(req.params.teamId)
      if (!team)
        return reply
          .status(404)
          .send({ ok: false, error: "team_not_found", reasonCode: "team_not_found" })
      return { ok: true, team, ...teamMembersResponse(team) }
    },
  )

  app.patch<{ Params: { teamId: string }; Body: EntityEnvelope | Partial<TeamConfig> }>(
    "/api/teams/:teamId",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const current = teamRegistryService(getApiRuntimeConfig(req)).get(req.params.teamId)
      if (!current)
        return reply
          .status(404)
          .send({ ok: false, error: "team_not_found", reasonCode: "team_not_found" })
      const stored = validateAndStoreTeam(
        getApiRuntimeConfig(req),
        reply,
        mergeTeamPatch(current, teamPayload(req.body), req.params.teamId),
        req.body,
      )
      if (isFastifyReply(stored)) return stored
      return { ok: true, team: stored, ...teamMembersResponse(stored) }
    },
  )

  app.post<{ Params: { teamId: string } }>(
    "/api/teams/:teamId/disable",
    { preHandler: authMiddleware },
    async (req, reply) => {
      if (!teamRegistryService(getApiRuntimeConfig(req)).disable(req.params.teamId)) {
        return reply
          .status(404)
          .send({ ok: false, error: "team_not_found", reasonCode: "team_not_found" })
      }
      const team = teamRegistryService(getApiRuntimeConfig(req)).get(req.params.teamId)
      return { ok: true, team, ...(team ? teamMembersResponse(team) : {}) }
    },
  )

  app.post<{ Params: { teamId: string } }>(
    "/api/teams/:teamId/archive",
    { preHandler: authMiddleware },
    async (req, reply) => {
      if (!teamRegistryService(getApiRuntimeConfig(req)).archive(req.params.teamId)) {
        return reply
          .status(404)
          .send({ ok: false, error: "team_not_found", reasonCode: "team_not_found" })
      }
      const team = teamRegistryService(getApiRuntimeConfig(req)).get(req.params.teamId)
      return { ok: true, team, ...(team ? teamMembersResponse(team) : {}) }
    },
  )

  app.delete<{ Params: { teamId: string } }>(
    "/api/teams/:teamId",
    { preHandler: authMiddleware },
    async (req, reply) => {
      if (!teamRegistryService(getApiRuntimeConfig(req)).delete(req.params.teamId)) {
        return reply
          .status(404)
          .send({ ok: false, error: "team_not_found", reasonCode: "team_not_found" })
      }
      return { ok: true, teamId: req.params.teamId, deleted: true }
    },
  )

  app.get<{ Params: { teamId: string } }>(
    "/api/teams/:teamId/members",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const team = teamRegistryService(getApiRuntimeConfig(req)).get(req.params.teamId)
      if (!team)
        return reply
          .status(404)
          .send({ ok: false, error: "team_not_found", reasonCode: "team_not_found" })
      return { ok: true, ...teamMembersResponse(team) }
    },
  )

  app.put<{
    Params: { teamId: string }
    Body: EntityEnvelope
  }>("/api/teams/:teamId/members", { preHandler: authMiddleware }, async (req, reply) => {
    const current = teamRegistryService(getApiRuntimeConfig(req)).get(req.params.teamId)
    if (!current)
      return reply
        .status(404)
        .send({ ok: false, error: "team_not_found", reasonCode: "team_not_found" })
    const body = requestEnvelope(req.body)
    const nextMemberAgentIds = asStringArray(body.memberAgentIds)
    const nextRoleHints = asStringArray(body.roleHints)
    if ("memberAgentIds" in body && !nextMemberAgentIds) {
      return sendValidationError(reply, "invalid_membership", [
        {
          path: "$.memberAgentIds",
          code: "contract_validation_failed",
          message: "memberAgentIds must be an array of non-empty strings.",
        },
      ])
    }
    if ("roleHints" in body && !nextRoleHints) {
      return sendValidationError(reply, "invalid_membership", [
        {
          path: "$.roleHints",
          code: "contract_validation_failed",
          message: "roleHints must be an array of non-empty strings.",
        },
      ])
    }
    if ("memberships" in body && !Array.isArray(body.memberships)) {
      return sendValidationError(reply, "invalid_membership", [
        {
          path: "$.memberships",
          code: "contract_validation_failed",
          message: "memberships must be an array when present.",
        },
      ])
    }
    const next = mergeTeamPatch(
      current,
      {
        memberAgentIds: nextMemberAgentIds ?? current.memberAgentIds,
        roleHints: nextRoleHints ?? current.roleHints,
        ...(Array.isArray(body.memberships) ? { memberships: body.memberships } : {}),
      },
      req.params.teamId,
    )
    const topologyValidation = createAgentTopologyService({
      config: getApiRuntimeConfig(req),
      storage: hierarchyStorage,
    }).validateActiveTeamMembers(next)
    if (!topologyValidation.valid) {
      return reply.status(400).send({
        ok: false,
        error: topologyValidation.diagnostics[0]?.reasonCode ?? "invalid_team_membership",
        reasonCode: topologyValidation.diagnostics[0]?.reasonCode ?? "invalid_team_membership",
        diagnostics: topologyValidation.diagnostics,
      })
    }
    const stored = validateAndStoreTeam(getApiRuntimeConfig(req), reply, next, req.body)
    if (isFastifyReply(stored)) return stored
    return { ok: true, team: stored, ...teamMembersResponse(stored) }
  })

  app.post<{ Params: { teamId: string }; Body: EntityEnvelope | TeamConfig }>(
    "/api/teams/:teamId/validate",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const result = createTeamCompositionService({
        config: getApiRuntimeConfig(req),
        storage: hierarchyStorage,
      }).evaluate(teamCompositionInput(req.params.teamId, req.body))
      if (!result.ok) return sendTeamCompositionFailure(reply, result.diagnostics)
      return {
        ok: true,
        valid: result.valid,
        team: result.team,
        coverage: result.coverage,
        health: result.health,
        diagnostics: result.diagnostics,
      }
    },
  )

  app.get<{ Params: { teamId: string } }>(
    "/api/teams/:teamId/coverage",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const result = createTeamCompositionService({
        config: getApiRuntimeConfig(req),
        storage: hierarchyStorage,
      }).evaluate(req.params.teamId)
      if (!result.ok) return sendTeamCompositionFailure(reply, result.diagnostics)
      return {
        ok: true,
        teamId: req.params.teamId,
        coverage: result.coverage,
        diagnostics: result.diagnostics,
      }
    },
  )

  app.get<{ Params: { teamId: string } }>(
    "/api/teams/:teamId/health",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const result = createTeamCompositionService({
        config: getApiRuntimeConfig(req),
        storage: hierarchyStorage,
      }).evaluate(req.params.teamId)
      if (!result.ok) return sendTeamCompositionFailure(reply, result.diagnostics)
      return {
        ok: true,
        teamId: req.params.teamId,
        health: result.health,
        diagnostics: result.diagnostics,
      }
    },
  )

  app.post<{ Params: { teamId: string }; Body: EntityEnvelope }>(
    "/api/teams/:teamId/plan",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const body = requestEnvelope(req.body)
      const teamExecutionPlanId = asString(body.teamExecutionPlanId)
      const parentRunId = asString(body.parentRunId)
      const parentRequestId = asString(body.parentRequestId)
      const userRequest = asString(body.userRequest)
      const result = createTeamExecutionPlanService({
        config: getApiRuntimeConfig(req),
        storage: hierarchyStorage,
      }).build({
        teamId: req.params.teamId,
        ...(teamExecutionPlanId ? { teamExecutionPlanId } : {}),
        ...(parentRunId ? { parentRunId } : {}),
        ...(parentRequestId ? { parentRequestId } : {}),
        ...(userRequest ? { userRequest } : {}),
        ...(body.persist === false ? { persist: false } : {}),
        auditId: asString(body.auditId) ?? null,
      })
      if (!result.ok) {
        const reasonCode = result.diagnostics[0]?.reasonCode ?? "team_execution_plan_failed"
        return reply.status(reasonCode === "team_not_found" ? 404 : 400).send({
          ok: false,
          error: reasonCode,
          reasonCode,
          diagnostics: result.diagnostics,
          validationIssues: result.validationIssues,
        })
      }
      return {
        ok: true,
        plan: result.plan,
        persisted: result.persisted,
        diagnostics: result.diagnostics,
      }
    },
  )

  app.post<{ Body: EntityEnvelope }>(
    "/api/agent-relationships",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const body = requestEnvelope(req.body)
      const result = hierarchyService(getApiRuntimeConfig(req), hierarchyStorage, req.body).create(
        relationshipPayload(req.body),
        {
          auditId: asString(body.auditId) ?? null,
        },
      )
      if (!result.ok) {
        return reply.status(400).send({
          ok: false,
          reasonCode: result.diagnostics[0]?.reasonCode ?? "invalid_agent_relationship",
          diagnostics: result.diagnostics,
          relationship: result.relationship,
        })
      }
      return { ok: true, relationship: result.relationship, diagnostics: result.diagnostics }
    },
  )

  app.delete<{ Params: { edgeId: string }; Body: EntityEnvelope }>(
    "/api/agent-relationships/:edgeId",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const disabled = hierarchyService(
        getApiRuntimeConfig(req),
        hierarchyStorage,
        req.body,
      ).disable(req.params.edgeId, {
        auditId: asString(requestEnvelope(req.body).auditId) ?? null,
      })
      if (!disabled) {
        return reply.status(404).send({
          ok: false,
          error: "agent_relationship_not_found",
          reasonCode: "agent_relationship_not_found",
        })
      }
      return { ok: true, relationship: disabled }
    },
  )

  app.post<{ Body: EntityEnvelope }>(
    "/api/agent-relationships/validate",
    { preHandler: authMiddleware },
    async (req) => {
      const result = hierarchyService(
        getApiRuntimeConfig(req),
        hierarchyStorage,
        req.body,
      ).validate(relationshipPayload(req.body))
      return {
        ok: true,
        valid: result.ok,
        relationship: result.relationship,
        diagnostics: result.diagnostics,
      }
    },
  )

  app.get("/api/agent-topology", { preHandler: authMiddleware }, async (req) => ({
    ok: true,
    ...createAgentTopologyService({
      config: getApiRuntimeConfig(req),
      storage: hierarchyStorage,
    }).buildProjection(),
  }))

  app.post<{ Body: EntityEnvelope }>(
    "/api/agent-topology/edges/validate",
    { preHandler: authMiddleware },
    async (req) => {
      const result = createAgentTopologyService({
        config: getApiRuntimeConfig(req),
        storage: hierarchyStorage,
      }).validateEdge(
        topologyEdgePayload(req.body) as Parameters<
          ReturnType<typeof createAgentTopologyService>["validateEdge"]
        >[0],
      )
      return {
        ok: result.ok,
        valid: result.valid,
        kind: result.kind,
        relationship: result.relationship,
        diagnostics: result.diagnostics,
      }
    },
  )

  app.get("/api/agent-tree", { preHandler: authMiddleware }, async (req) => ({
    ok: true,
    ...hierarchyService(getApiRuntimeConfig(req), hierarchyStorage).buildProjection(),
  }))

  app.get<{ Params: { agentId: string } }>(
    "/api/agents/:agentId/children",
    { preHandler: authMiddleware },
    async (req) => {
      const service = hierarchyService(getApiRuntimeConfig(req), hierarchyStorage)
      const children = service.directChildren(req.params.agentId)
      return {
        ok: true,
        parentAgentId: req.params.agentId,
        childAgentIds: children.map((child) => child.relationship.childAgentId),
        executionCandidateAgentIds: children
          .filter((child) => child.isExecutionCandidate)
          .map((child) => child.relationship.childAgentId),
        children,
        ancestors: service.ancestors(req.params.agentId),
        descendants: service.descendants(req.params.agentId),
      }
    },
  )

  app.get("/api/agent-tree/layout", { preHandler: authMiddleware }, async (req) => ({
    ok: true,
    layout: hierarchyService(getApiRuntimeConfig(req), hierarchyStorage).readLayout(),
  }))

  app.put<{ Body: EntityEnvelope }>(
    "/api/agent-tree/layout",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const body = requestEnvelope(req.body)
      const payload = body.layout ?? req.body
      if (!isRecord(payload)) {
        return reply.status(400).send({
          ok: false,
          error: "invalid_agent_tree_layout",
          reasonCode: "invalid_agent_tree_layout",
        })
      }
      return {
        ok: true,
        layout: hierarchyService(getApiRuntimeConfig(req), hierarchyStorage).writeLayout(payload),
      }
    },
  )

  // POST /api/agent/run — start agent run (streams via WebSocket)
  app.post<{
    Body: { message: string; sessionId?: string; model?: string; clientRequestId?: string }
  }>("/api/agent/run", { preHandler: authMiddleware }, async (req, reply) => {
    const { message, sessionId, model } = req.body
    if (!message?.trim()) {
      return reply.status(400).send({ error: "message is required" })
    }
    const clientRequestId = resolveWebUiClientRequestId(req.body.clientRequestId)
    if (!clientRequestId.ok) {
      return reply.status(400).send({
        error: clientRequestId.reasonCode,
        reasonCode: clientRequestId.reasonCode,
      })
    }
    return startLocalRun({
      artifactStorage: createArtifactStorageContext(getApiRuntimePaths(req)),
      memoryJournal,
      hierarchyStorage,
      config: getApiRuntimeConfig(req),
      message,
      sessionId,
      model,
      source: "webui",
      ...(clientRequestId.clientRequestId
        ? { clientRequestId: clientRequestId.clientRequestId }
        : {}),
    })
  })

  // GET /api/agent/sessions
  app.get("/api/agent/sessions", { preHandler: authMiddleware }, async () => {
    const rows = getDb()
      .prepare(
        "SELECT id, source, created_at, updated_at, summary FROM sessions ORDER BY updated_at DESC LIMIT 50",
      )
      .all()
    return { sessions: rows }
  })

  // GET /api/agent/sessions/:id/messages
  app.get<{ Params: { id: string } }>(
    "/api/agent/sessions/:id/messages",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const { id } = req.params
      const session = getDb().prepare("SELECT id FROM sessions WHERE id = ?").get(id)
      if (!session) return reply.status(404).send({ error: "Session not found" })

      const messages = getDb()
        .prepare(
          "SELECT role, content, created_at FROM messages WHERE session_id = ? AND tool_calls IS NULL ORDER BY created_at ASC",
        )
        .all(id)
      return { sessionId: id, messages }
    },
  )
}
