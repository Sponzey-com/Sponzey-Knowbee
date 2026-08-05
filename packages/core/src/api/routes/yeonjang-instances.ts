import type { FastifyInstance } from "fastify"
import { createAgentPublicRef } from "../../capabilities/agent-public-reference.js"
import { buildCapabilityBindingProjection } from "../../capabilities/capability-binding-projection.js"
import type { CapabilityMutationState } from "../../capabilities/capability-mutation-state-machine.js"
import type { MutationEnvelope } from "../../capabilities/capability-security-boundary.js"
import {
  type YeonjangBindingReceipt,
  executeYeonjangBindingCommand,
} from "../../capabilities/yeonjang-binding-command.js"
import type { PermissionProfile } from "../../contracts/sub-agent-orchestration.js"
import { buildYeonjangCapabilityProjection } from "../../capabilities/yeonjang-capability-projection.js"
import {
  type YeonjangCapabilityQueryInput,
  queryYeonjangCapabilityCatalog,
  resolveYeonjangCapabilityDetail,
} from "../../capabilities/yeonjang-capability-query.js"
import { projectYeonjangPlatformSupport } from "../../capabilities/yeonjang-platform-support.js"
import { createYeonjangPublicRef } from "../../capabilities/yeonjang-public-reference.js"
import {
  type YeonjangRecoveryAction,
  type YeonjangRecoveryReceipt,
  executeYeonjangRecoveryCommand,
} from "../../capabilities/yeonjang-recovery-command.js"
import type { MqttConfig } from "../../config/types.js"
import {
  getCapabilityMutationReceiptByNonce,
  listAgentCapabilityBindings,
  listAgentConfigs,
  reserveCapabilityMutationReceipt,
  updateCapabilityMutationReceipt,
  upsertAgentCapabilityBinding,
} from "../../db/index.js"
import { createLogger } from "../../logger/index.js"
import type {
  YeonjangBrowserActiveTabInfoObservation,
  YeonjangBrowserActiveTabInfoReadyTarget,
} from "../../capabilities/yeonjang-browser-active-tab-info-contract.js"
import {
  buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria,
  YeonjangBrowserActiveTabInfoBackendAcceptanceCriteria,
} from "../../release/yeonjang-browser-active-tab-info-backend-acceptance-criteria.js"
import { buildYeonjangBrowserActiveTabInfoPublicReadinessSummary } from "../../release/yeonjang-browser-active-tab-info-public-readiness-summary.js"
import {
  buildYeonjangBrowserActiveTabInfoRustInventoryContract,
  YeonjangBrowserActiveTabInfoRustInventoryContract,
} from "../../release/yeonjang-browser-active-tab-info-rust-inventory-contract.js"
import {
  buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan,
  type YeonjangBrowserActiveTabInfoApprovalReceipt,
  type YeonjangBrowserActiveTabInfoPreDispatchBridgePlan,
} from "../../release/yeonjang-browser-active-tab-info-pre-dispatch-bridge.js"
import {
  assembleYeonjangBrowserActiveTabInfoReadinessObservationsFromRegistry,
  selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry,
  type YeonjangBrowserActiveTabInfoRegistryRecord,
} from "../../release/yeonjang-browser-active-tab-info-readiness-source-adapter.js"
import { buildYeonjangBroadcastPolicyProjection } from "../../yeonjang/broadcast-policy.js"
import { invokeYeonjangMethod } from "../../yeonjang/mqtt-client.js"
import {
  type YeonjangInstanceTrustState,
  approveYeonjangInstancePairing,
  assignYeonjangLocalMarker,
  listYeonjangGovernanceHistory,
  renameYeonjangRegistryInstance,
  updateYeonjangInstanceTrustState,
  verifyYeonjangInstancePairing,
} from "../../yeonjang/registry.js"
import { approveYeonjangPairingWithExecutionAdmissionKey } from "../../yeonjang/pairing-execution-admission-provisioning.js"
import {
  type YeonjangFleetProjection,
  buildYeonjangFleetProjection,
} from "../../yeonjang/topology.js"
import { authMiddleware, getApiAuthenticationPrincipal } from "../middleware/auth.js"

const logger = createLogger("api:yeonjang-capabilities")

const YEONJANG_CAMERA_RUNTIME_TOOL_NAMES = [
  "yeonjang_status",
  "yeonjang_camera_list",
  "yeonjang_camera_capture",
] as const

function yeonjangCameraPermissionProfile(agentId: string): PermissionProfile {
  return {
    profileId: `permission:${agentId}:yeonjang-camera`,
    riskCeiling: "moderate",
    approvalRequiredFrom: "moderate",
    allowExternalNetwork: false,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: false,
    allowedPaths: [],
  }
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  } catch {
    return []
  }
}

function parseRecord(value: string | null | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

async function waitForRecoveryObservation(intervalMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(done, intervalMs)
    function done() {
      clearTimeout(timeout)
      signal.removeEventListener("abort", done)
      resolve()
    }
    signal.addEventListener("abort", done, { once: true })
  })
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function refreshFleetResponse() {
  const projection = buildYeonjangFleetProjection()
  const broadcastPolicies = buildYeonjangBroadcastPolicyProjection()
  const governanceHistory = listYeonjangGovernanceHistory({ limit: 20 })
  return {
    ok: true,
    summary: projection.summary,
    instances: projection.instances,
    diffSummaries: projection.diffSummaries,
    defaultTarget: projection.summary.defaultTarget,
    promptProjection: projection.promptProjection,
    broadcastPolicies,
    governanceHistory,
  }
}

function publicProjection(input: {
  fleet: YeonjangFleetProjection
  now: number
}) {
  return buildYeonjangCapabilityProjection({
    instances: input.fleet.instances,
    duplicateLocalDetected: input.fleet.summary.duplicateLocalDetected,
    now: input.now,
    publicRefForInstanceId: createYeonjangPublicRef,
  })
}

function currentYeonjangBindingRevision(): number {
  return listAgentCapabilityBindings({ capabilityKind: "yeonjang", includeArchived: true }).reduce(
    (revision, binding) => Math.max(revision, binding.updated_at),
    0,
  )
}

function envelopeFrom(value: unknown, actorRef: string): MutationEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const allowed = new Set(["scope", "mutationId", "targetRevision", "purpose", "issuedAt", "nonce"])
  if (Object.keys(source).some((key) => !allowed.has(key))) return null
  if (
    typeof source.scope !== "string" ||
    typeof source.mutationId !== "string" ||
    typeof source.targetRevision !== "number" ||
    typeof source.purpose !== "string" ||
    typeof source.issuedAt !== "number" ||
    typeof source.nonce !== "string"
  )
    return null
  return {
    actorRef,
    scope: source.scope,
    mutationId: source.mutationId,
    targetRevision: source.targetRevision,
    purpose: source.purpose,
    issuedAt: source.issuedAt,
    nonce: source.nonce,
  }
}

function mutationStatus(receipt: { state: string; reasonCode: string | null }): number {
  if (receipt.state === "active") return 200
  if (
    receipt.reasonCode === "yeonjang_ref_not_found" ||
    receipt.reasonCode === "agent_ref_not_found"
  )
    return 404
  if (
    receipt.reasonCode === "mutation_scope_denied" ||
    receipt.reasonCode === "mutation_purpose_denied"
  )
    return 403
  if (
    receipt.reasonCode === "mutation_revision_conflict" ||
    receipt.reasonCode === "mutation_nonce_replayed"
  )
    return 409
  return 422
}

function queryInput(value: unknown): YeonjangCapabilityQueryInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const query = value as Record<string, unknown>
  const allowed = new Set(["search", "location", "platform", "status", "cursor", "limit"])
  if (Object.keys(query).some((key) => !allowed.has(key))) return null
  const string = (key: string) => query[key] === undefined || typeof query[key] === "string"
  if (!["search", "location", "platform", "status", "cursor", "limit"].every(string)) return null
  const location = typeof query.location === "string" ? query.location : undefined
  const platform = typeof query.platform === "string" ? query.platform : undefined
  const status = typeof query.status === "string" ? query.status : undefined
  if (location !== undefined && location !== "local" && location !== "remote") return null
  if (platform !== undefined && !["linux", "windows", "macos", "unknown"].includes(platform))
    return null
  if (
    status !== undefined &&
    !["ready", "unavailable", "inactive", "permission_required", "stale"].includes(status)
  )
    return null
  const limit = query.limit === undefined || query.limit === "" ? undefined : Number(query.limit)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return null
  return {
    ...(query.search ? { search: query.search as string } : {}),
    ...(location ? { location: location as "local" | "remote" } : {}),
    ...(platform
      ? { platform: platform as NonNullable<YeonjangCapabilityQueryInput["platform"]> }
      : {}),
    ...(status ? { status: status as NonNullable<YeonjangCapabilityQueryInput["status"]> } : {}),
    ...(query.cursor ? { cursor: query.cursor as string } : {}),
    ...(limit !== undefined ? { limit } : {}),
  }
}

type YeonjangBrowserActiveTabInfoPreDispatchPreviewResponse =
  | {
      status: "blocked"
      reasonCode: Exclude<
        YeonjangBrowserActiveTabInfoPreDispatchBridgePlan["reasonCode"],
        "active_tab_info_pre_dispatch_prepared"
      >
      method: "browser.active_tab_info"
      toolName: "yeonjang_browser_active_tab_info"
      invokeNow: false
      addRustDispatchNow: false
      addProductionBindingNow: false
    }
  | {
      status: "prepared"
      reasonCode: "active_tab_info_pre_dispatch_prepared"
      method: "browser.active_tab_info"
      toolName: "yeonjang_browser_active_tab_info"
      publicTargetName: string
      platform: YeonjangBrowserActiveTabInfoReadyTarget["platform"]
      observationStatus: YeonjangBrowserActiveTabInfoObservation["observationStatus"]
      browserName: string
      requiredGateCount: number
      invokeNow: false
      addRustDispatchNow: false
      addProductionBindingNow: false
    }

function publicActiveTabInfoPreDispatchPreview(
  plan: YeonjangBrowserActiveTabInfoPreDispatchBridgePlan,
): YeonjangBrowserActiveTabInfoPreDispatchPreviewResponse {
  if (plan.status === "blocked") {
    return {
      status: "blocked",
      reasonCode: plan.reasonCode,
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    }
  }

  return {
    status: "prepared",
    reasonCode: "active_tab_info_pre_dispatch_prepared",
    method: "browser.active_tab_info",
    toolName: "yeonjang_browser_active_tab_info",
    publicTargetName: plan.target.publicTargetName,
    platform: plan.target.platform,
    observationStatus: plan.observation.observationStatus,
    browserName: plan.observation.browserName,
    requiredGateCount: plan.requiredGates.length,
    invokeNow: false,
    addRustDispatchNow: false,
    addProductionBindingNow: false,
  }
}

export function registerYeonjangInstancesRoute(
  app: FastifyInstance,
  options: {
    fleetProjection?: () => YeonjangFleetProjection
    now?: () => number
    mqttConfig?: MqttConfig
    currentRevision?: () => number
    publicRefForAgentId?: (agentId: string) => string
    bindingProjectionRepository?: {
      listAgents(): readonly { agent_id: string; agent_name: string; status: string }[]
      listBindings(): readonly { agent_id: string; catalog_id: string; status: string }[]
    }
    browserActiveTabInfoReadinessRecords?: () => readonly YeonjangBrowserActiveTabInfoRegistryRecord[]
    browserActiveTabInfoRedactedObservationForTarget?: (
      publicTargetName: string,
    ) => YeonjangBrowserActiveTabInfoObservation | undefined
    mutationActorForRequest?: (request: unknown) => string | null
    recoveryExecutor?: (input: {
      envelope: MutationEnvelope
      yeonjangRef: string
      action: YeonjangRecoveryAction
      signal: AbortSignal
    }) => Promise<YeonjangRecoveryReceipt>
    bindingExecutor?: (input: {
      envelope: MutationEnvelope
      yeonjangRef: string
      agentRef: string
      action: "bind" | "unbind"
    }) => Promise<YeonjangBindingReceipt>
    pairingExecutionAdmissionKeyProvisioner?: {
      provision(input: { readonly extensionId: string }):
        | { readonly ok: true }
        | { readonly ok: false; readonly reasonCode: string }
      remove(input: { readonly extensionId: string }): { readonly ok: true } | { readonly ok: false }
    }
  } = {},
): void {
  const fleetProjection = options.fleetProjection ?? buildYeonjangFleetProjection
  const now = options.now ?? Date.now
  const currentRevision =
    options.currentRevision ?? (options.fleetProjection ? () => 0 : currentYeonjangBindingRevision)
  const publicRefForAgentId = options.publicRefForAgentId ?? createAgentPublicRef
  const bindingProjectionRepository =
    options.bindingProjectionRepository ??
    (options.fleetProjection
      ? { listAgents: () => [], listBindings: () => [] }
      : {
          listAgents: () => listAgentConfigs(),
          listBindings: () =>
            listAgentCapabilityBindings({ capabilityKind: "yeonjang", includeArchived: true }),
        })
  const browserActiveTabInfoReadinessRecords =
    options.browserActiveTabInfoReadinessRecords ?? (() => [])
  const browserActiveTabInfoRedactedObservationForTarget =
    options.browserActiveTabInfoRedactedObservationForTarget ??
    ((publicTargetName: string) => {
      const result = selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry({
        publicTargetName,
        records: browserActiveTabInfoReadinessRecords(),
      })
      return result.ok ? result.observation : undefined
    })
  const browserActiveTabInfoReadinessSummary = (audience: "general" | "advanced") =>
    buildYeonjangBrowserActiveTabInfoPublicReadinessSummary({
      audience,
      observations: assembleYeonjangBrowserActiveTabInfoReadinessObservationsFromRegistry({
        records: browserActiveTabInfoReadinessRecords(),
      }),
    })
  const mutationActorForRequest =
    options.mutationActorForRequest ??
    ((request: unknown) => getApiAuthenticationPrincipal(request as never)?.principalRef ?? null)
  const reserveReceipt = (input: {
    envelope: MutationEnvelope
    state: CapabilityMutationState
    now: number
  }) =>
    reserveCapabilityMutationReceipt({
      mutationId: input.envelope.mutationId,
      nonce: input.envelope.nonce,
      actorRef: input.envelope.actorRef,
      scope: input.envelope.scope,
      purpose: input.envelope.purpose,
      capabilityKind: "yeonjang",
      targetRevision: input.envelope.targetRevision,
      state: input.state,
      now: input.now,
    })
  const resolveIdentity = (yeonjangRef: string) => {
    const fleet = fleetProjection()
    const matches = fleet.instances.filter(
      (instance) => createYeonjangPublicRef(instance.instanceId) === yeonjangRef,
    )
    if (matches.length !== 1) return null
    const instance = matches[0]
    if (!instance) return null
    const projection = resolveYeonjangCapabilityDetail(
      publicProjection({ fleet, now: now() }),
      yeonjangRef,
    )
    return projection ? { instance, projection } : null
  }
  const recoveryExecutor =
    options.recoveryExecutor ??
    (async (input: {
      envelope: MutationEnvelope
      yeonjangRef: string
      action: YeonjangRecoveryAction
      signal: AbortSignal
    }) =>
      executeYeonjangRecoveryCommand(
        input,
        {
          now,
          currentRevision,
          nonceUsed: (nonce) => Boolean(getCapabilityMutationReceiptByNonce(nonce)),
          reserveReceipt,
          updateReceipt: (receipt) => {
            updateCapabilityMutationReceipt(receipt)
          },
          resolveYeonjang: (yeonjangRef) => {
            const identity = resolveIdentity(yeonjangRef)
            return identity
              ? {
                  internalInstanceId: identity.instance.instanceId,
                  status: identity.projection.status,
                  permissionState: identity.projection.permissionState,
                  runnable: identity.projection.runnable,
                }
              : null
          },
          persistIntent: async ({ expectedRevision, targetRevision }) =>
            currentRevision() === expectedRevision
              ? { ok: true, revision: targetRevision }
              : {
                  ok: false,
                  revision: currentRevision(),
                  reasonCode: "mutation_revision_conflict",
                },
          applyAction: async ({ internalInstanceId, action }, signal) => {
            const identity = resolveIdentity(createYeonjangPublicRef(internalInstanceId))
            if (!identity || !options.mqttConfig)
              return { ok: false, reasonCode: "yeonjang_runtime_config_unavailable" }
            try {
              await invokeYeonjangMethod(
                action === "reconnect" ? "node.ping" : "node.capabilities",
                {},
                {
                  mqttConfig: options.mqttConfig,
                  extensionId: identity.instance.nodeId,
                  metadata: {
                    ...(identity.instance.session?.sessionId
                      ? { targetSessionId: identity.instance.session.sessionId }
                      : {}),
                    source: "webui:yeonjang-recovery",
                  },
                },
              )
              return signal.aborted
                ? { ok: false, reasonCode: "yeonjang_recovery_cancelled" }
                : { ok: true }
            } catch {
              return { ok: false, reasonCode: "yeonjang_recovery_transport_failed" }
            }
          },
          inspectResult: async (internalInstanceId) => {
            const identity = resolveIdentity(createYeonjangPublicRef(internalInstanceId))
            return identity
              ? {
                  internalInstanceId,
                  status: identity.projection.status,
                  permissionState: identity.projection.permissionState,
                  runnable: identity.projection.runnable,
                }
              : null
          },
          rollbackIntent: async () => ({ ok: true }),
        },
        input.signal,
        {
          maxAttempts: 4,
          intervalMs: 125,
          wait: waitForRecoveryObservation,
        },
      ))
  const writeBinding = (input: {
    internalInstanceId: string
    internalAgentId: string
    enabled: boolean
    revision: number
  }): boolean => {
    const existing = listAgentCapabilityBindings({
      capabilityKind: "yeonjang",
      includeArchived: true,
    }).find(
      (binding) =>
        binding.catalog_id === input.internalInstanceId &&
        binding.agent_id === input.internalAgentId,
    )
    upsertAgentCapabilityBinding(
      {
        ...(existing ? { bindingId: existing.binding_id, createdAt: existing.created_at } : {}),
        ...(existing?.secret_scope_id ? { secretScopeId: existing.secret_scope_id } : {}),
        agentId: input.internalAgentId,
        capabilityKind: "yeonjang",
        catalogId: input.internalInstanceId,
        status: input.enabled ? "enabled" : "archived",
        enabledToolNames: parseStringArray(existing?.enabled_tool_names_json).length > 0
          ? parseStringArray(existing?.enabled_tool_names_json)
          : [...YEONJANG_CAMERA_RUNTIME_TOOL_NAMES],
        disabledToolNames: parseStringArray(existing?.disabled_tool_names_json),
        permissionProfile: (parseRecord(existing?.permission_profile_json) as PermissionProfile | undefined)
          ?? yeonjangCameraPermissionProfile(input.internalAgentId),
        ...(parseRecord(existing?.rate_limit_json) ? { rateLimit: parseRecord(existing?.rate_limit_json) as never } : {}),
        approvalRequiredFrom: existing?.approval_required_from ?? "moderate",
        updatedAt: input.revision,
      },
      {
        source: existing?.source ?? "manual",
        auditId: existing?.audit_id ?? null,
        now: input.revision,
      },
    )
    return true
  }
  const bindingExecutor =
    options.bindingExecutor ??
    (async (input: {
      envelope: MutationEnvelope
      yeonjangRef: string
      agentRef: string
      action: "bind" | "unbind"
    }) =>
      executeYeonjangBindingCommand(input, {
        now,
        currentRevision,
        nonceUsed: (nonce) => Boolean(getCapabilityMutationReceiptByNonce(nonce)),
        reserveReceipt,
        updateReceipt: (receipt) => {
          updateCapabilityMutationReceipt(receipt)
        },
        resolveYeonjang: (yeonjangRef) => {
          const identity = resolveIdentity(yeonjangRef)
          return identity
            ? {
                internalInstanceId: identity.instance.instanceId,
                runnable: identity.projection.runnable,
                scopeAllowed:
                  identity.instance.scopeAccess === "allowed" &&
                  identity.instance.trustState === "trusted",
              }
            : null
        },
        resolveAgent: (agentRef) => {
          const matches = listAgentConfigs({ enabledOnly: true }).filter(
            (agent) => publicRefForAgentId(agent.agent_id) === agentRef,
          )
          return matches.length === 1 && matches[0]
            ? { internalAgentId: matches[0].agent_id, scopeAllowed: true }
            : null
        },
        bindingEnabled: ({ internalInstanceId, internalAgentId }) =>
          listAgentCapabilityBindings({ capabilityKind: "yeonjang", includeArchived: true }).some(
            (binding) =>
              binding.catalog_id === internalInstanceId &&
              binding.agent_id === internalAgentId &&
              binding.status === "enabled",
          ),
        persist: ({
          internalInstanceId,
          internalAgentId,
          enabled,
          expectedRevision,
          targetRevision,
        }) =>
          currentRevision() === expectedRevision &&
          writeBinding({ internalInstanceId, internalAgentId, enabled, revision: targetRevision })
            ? { ok: true, revision: targetRevision }
            : { ok: false, revision: currentRevision(), reasonCode: "mutation_revision_conflict" },
        verify: ({ internalInstanceId, internalAgentId, enabled, targetRevision }) => {
          const binding = listAgentCapabilityBindings({
            capabilityKind: "yeonjang",
            includeArchived: true,
          }).find(
            (entry) =>
              entry.catalog_id === internalInstanceId && entry.agent_id === internalAgentId,
          )
          return {
            ok: Boolean(
              binding &&
                (binding.status === "enabled") === enabled &&
                binding.updated_at === targetRevision,
            ),
            reasonCode: "yeonjang_binding_verify_failed",
          }
        },
        rollback: ({ internalInstanceId, internalAgentId, enabled, baseRevision }) => ({
          ok: writeBinding({
            internalInstanceId,
            internalAgentId,
            enabled,
            revision: baseRevision,
          }),
          reasonCode: "yeonjang_binding_rollback_failed",
        }),
      }))

  app.get("/api/capabilities/yeonjang", { preHandler: authMiddleware }, async (request, reply) => {
    const input = queryInput(request.query)
    if (!input) return reply.status(400).send({ error: "yeonjang_query_invalid" })
    const startedAt = now()
    const result = queryYeonjangCapabilityCatalog(
      publicProjection({ fleet: fleetProjection(), now: startedAt }),
      input,
    )
    if (!result.cursorValid) return reply.status(400).send({ error: "yeonjang_cursor_invalid" })
    logger.fieldDebug("Yeonjang capability catalog queried", {
      count: result.items.length,
      totalMatches: result.totalMatches,
      durationMs: Math.max(0, now() - startedAt),
    })
    return { ...result, revision: currentRevision() }
  })

  app.get<{ Params: { yeonjangRef: string } }>(
    "/api/capabilities/yeonjang/:yeonjangRef",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!/^yeonjang_v1_[a-f0-9]{24}$/u.test(request.params.yeonjangRef))
        return reply.status(400).send({ error: "yeonjang_ref_invalid" })
      const detail = resolveYeonjangCapabilityDetail(
        publicProjection({ fleet: fleetProjection(), now: now() }),
        request.params.yeonjangRef,
      )
      if (!detail) return reply.status(404).send({ error: "yeonjang_ref_not_found" })
      const identity = resolveIdentity(request.params.yeonjangRef)
      if (!identity) return reply.status(404).send({ error: "yeonjang_ref_not_found" })
      const bindings = buildCapabilityBindingProjection({
        catalogId: identity.instance.instanceId,
        agents: bindingProjectionRepository.listAgents(),
        bindings: bindingProjectionRepository.listBindings(),
        publicRefForAgentId,
      })
      return {
        ...detail,
        revision: currentRevision(),
        bindings,
        platformSupport: projectYeonjangPlatformSupport({
          platform: detail.platform,
          supportProfile: detail.supportProfile,
          permissionState: detail.permissionState,
          reportedCapabilityGroups: detail.capabilityGroups,
        }),
      }
    },
  )

  app.post<{
    Params: { yeonjangRef: string }
    Body: { envelope?: unknown; action?: unknown }
  }>(
    "/api/capabilities/yeonjang/:yeonjangRef/recovery",
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!/^yeonjang_v1_[a-f0-9]{24}$/u.test(request.params.yeonjangRef))
        return reply.status(400).send({ error: "yeonjang_recovery_ref_invalid" })
      if (request.body?.action !== "reconnect" && request.body?.action !== "check_permissions")
        return reply.status(400).send({ error: "yeonjang_recovery_request_invalid" })
      const actorRef = mutationActorForRequest(request)
      if (!actorRef) return reply.status(403).send({ error: "yeonjang_recovery_actor_denied" })
      const envelope = envelopeFrom(request.body.envelope, actorRef)
      if (!envelope) return reply.status(400).send({ error: "yeonjang_recovery_request_invalid" })
      const controller = new AbortController()
      const abort = () => controller.abort()
      request.raw?.once?.("aborted", abort)
      const startedAt = now()
      const publicIdentity = resolveIdentity(request.params.yeonjangRef)?.projection
      try {
        const receipt = await recoveryExecutor({
          envelope,
          yeonjangRef: request.params.yeonjangRef,
          action: request.body.action,
          signal: controller.signal,
        })
        logger.product("Yeonjang recovery completed", {
          state: receipt.state,
          reasonCode: receipt.reasonCode,
          ready: receipt.ready,
        })
        logger.fieldDebug("Yeonjang recovery receipt", {
          action: receipt.action,
          displayName: publicIdentity?.displayName ?? "Yeonjang",
          platform: publicIdentity?.platform ?? "unknown",
          durationMs: Math.max(0, now() - startedAt),
          state: receipt.state,
          reasonCode: receipt.reasonCode,
        })
        logger.development("Yeonjang recovery terminal transition", {
          action: receipt.action,
          state: receipt.state,
          reasonCode: receipt.reasonCode,
          allowedActions: receipt.allowedActions,
        })
        return reply.status(mutationStatus(receipt)).send(receipt)
      } catch {
        logger.product("Yeonjang recovery failed", { reasonCode: "yeonjang_recovery_failed" })
        return reply.status(500).send({ error: "yeonjang_recovery_failed" })
      } finally {
        request.raw?.off?.("aborted", abort)
      }
    },
  )

  if (typeof app.patch === "function")
    app.patch<{
      Params: { yeonjangRef: string; agentRef: string }
      Body: { envelope?: unknown; bound?: unknown }
    }>(
      "/api/capabilities/yeonjang/:yeonjangRef/bindings/:agentRef",
      { preHandler: authMiddleware },
      async (request, reply) => {
        if (
          !/^yeonjang_v1_[a-f0-9]{24}$/u.test(request.params.yeonjangRef) ||
          !/^agent_v1_[a-f0-9]{24}$/u.test(request.params.agentRef)
        )
          return reply.status(400).send({ error: "yeonjang_binding_ref_invalid" })
        if (typeof request.body?.bound !== "boolean")
          return reply.status(400).send({ error: "yeonjang_binding_request_invalid" })
        const actorRef = mutationActorForRequest(request)
        if (!actorRef) return reply.status(403).send({ error: "yeonjang_binding_actor_denied" })
        const envelope = envelopeFrom(request.body.envelope, actorRef)
        if (!envelope) return reply.status(400).send({ error: "yeonjang_binding_request_invalid" })
        const startedAt = now()
        const publicIdentity = resolveIdentity(request.params.yeonjangRef)?.projection
        try {
          const receipt = await bindingExecutor({
            envelope,
            yeonjangRef: request.params.yeonjangRef,
            agentRef: request.params.agentRef,
            action: request.body.bound ? "bind" : "unbind",
          })
          logger.product("Yeonjang agent binding completed", {
            state: receipt.state,
            reasonCode: receipt.reasonCode,
            bound: receipt.bound,
          })
          logger.fieldDebug("Yeonjang binding receipt", {
            action: request.body.bound ? "bind" : "unbind",
            displayName: publicIdentity?.displayName ?? "Yeonjang",
            platform: publicIdentity?.platform ?? "unknown",
            durationMs: Math.max(0, now() - startedAt),
            revision: receipt.revision,
            state: receipt.state,
            reasonCode: receipt.reasonCode,
          })
          logger.development("Yeonjang binding terminal transition", {
            action: request.body.bound ? "bind" : "unbind",
            state: receipt.state,
            reasonCode: receipt.reasonCode,
            allowedActions: receipt.allowedActions,
          })
          return reply.status(mutationStatus(receipt)).send(receipt)
        } catch {
          logger.product("Yeonjang agent binding failed", {
            reasonCode: "yeonjang_binding_failed",
          })
          return reply.status(500).send({ error: "yeonjang_binding_failed" })
        }
      },
    )

  app.get("/api/yeonjang/instances", { preHandler: authMiddleware }, async () =>
    refreshFleetResponse(),
  )

  app.get(
    "/api/yeonjang/browser-active-tab-info/readiness",
    { preHandler: authMiddleware },
    async () => browserActiveTabInfoReadinessSummary("general"),
  )

  app.get(
    "/api/yeonjang/browser-active-tab-info/readiness/diagnostics",
    { preHandler: authMiddleware },
    async () => browserActiveTabInfoReadinessSummary("advanced"),
  )

  app.post(
    "/api/yeonjang/browser-active-tab-info/pre-dispatch/preview",
    { preHandler: authMiddleware },
    async (request) => {
      const body = (request.body ?? {}) as {
        readyTarget?: YeonjangBrowserActiveTabInfoReadyTarget | undefined
        approvalReceipt?: YeonjangBrowserActiveTabInfoApprovalReceipt | undefined
        criteria?: YeonjangBrowserActiveTabInfoBackendAcceptanceCriteria | undefined
        rustInventory?: YeonjangBrowserActiveTabInfoRustInventoryContract | undefined
        redactedProjection?: YeonjangBrowserActiveTabInfoObservation | undefined
      }
      const plan = buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan({
        readyTarget: body.readyTarget,
        approvalReceipt: body.approvalReceipt,
        criteria: body.criteria ?? buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({}),
        rustInventory: body.rustInventory ?? buildYeonjangBrowserActiveTabInfoRustInventoryContract({}),
        redactedProjection:
          body.redactedProjection ??
          (body.readyTarget?.publicTargetName
            ? browserActiveTabInfoRedactedObservationForTarget(body.readyTarget.publicTargetName)
            : undefined),
        now: now(),
      })
      return publicActiveTabInfoPreDispatchPreview(plan)
    },
  )

  app.post(
    "/api/yeonjang/instances/:instanceId/pairing/approve",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const params = request.params as { instanceId?: string }
      const body = (request.body ?? {}) as {
        pairingSecret?: string
        actor?: string
        ownerUserId?: string
        workspaceScopeId?: string
        reason?: string
      }
      const approvalInput = {
        instanceId: normalizeString(params.instanceId),
        pairingSecret: normalizeString(body.pairingSecret),
        actor: normalizeString(body.actor) || "webui:operator",
        ...(normalizeString(body.ownerUserId)
          ? { ownerUserId: normalizeString(body.ownerUserId) }
          : {}),
        ...(normalizeString(body.workspaceScopeId)
          ? { workspaceScopeId: normalizeString(body.workspaceScopeId) }
          : {}),
        ...(normalizeString(body.reason) ? { reason: normalizeString(body.reason) } : {}),
      }
      const keyProvisioner = options.pairingExecutionAdmissionKeyProvisioner
      if (keyProvisioner) {
        const provisioned = approveYeonjangPairingWithExecutionAdmissionKey({
          instanceId: approvalInput.instanceId,
          pairingSecret: approvalInput.pairingSecret,
          verifier: {
            verify: ({ instanceId, pairingSecret }) => {
              const verification = verifyYeonjangInstancePairing({ instanceId, pairingSecret })
              return verification.ok
                ? { ok: true, binding: { extensionId: verification.extensionId } }
                : { ok: false, reasonCode: verification.code }
            },
          },
          keyProvisioner,
          trustCommitter: {
            approve: ({ instanceId }) => {
              const result = approveYeonjangInstancePairing({ ...approvalInput, instanceId })
              return result.ok ? { ok: true } : { ok: false, reasonCode: result.code }
            },
          },
        })
        if (!provisioned.ok) {
          return reply.status(503).send({
            ok: false,
            code: provisioned.reasonCode,
            message: "실행 승인 연결을 준비하지 못해 pairing 신뢰 승인을 완료하지 않았습니다.",
          })
        }
        return refreshFleetResponse()
      }
      const result = approveYeonjangInstancePairing(approvalInput)
      if (!result.ok) {
        return reply.status(result.code === "instance_not_found" ? 404 : 400).send(result)
      }
      return refreshFleetResponse()
    },
  )

  app.post(
    "/api/yeonjang/instances/:instanceId/trust",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const params = request.params as { instanceId?: string }
      const body = (request.body ?? {}) as {
        trustState?: YeonjangInstanceTrustState
        actor?: string
        reason?: string
      }
      const result = updateYeonjangInstanceTrustState({
        instanceId: normalizeString(params.instanceId),
        trustState: (normalizeString(body.trustState) || "pending") as YeonjangInstanceTrustState,
        actor: normalizeString(body.actor) || "webui:operator",
        ...(normalizeString(body.reason) ? { reason: normalizeString(body.reason) } : {}),
      })
      if (!result.ok) {
        return reply.status(result.code === "instance_not_found" ? 404 : 400).send(result)
      }
      return refreshFleetResponse()
    },
  )

  app.post(
    "/api/yeonjang/instances/:instanceId/rename",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const params = request.params as { instanceId?: string }
      const body = (request.body ?? {}) as {
        instanceAlias?: string
        displayName?: string
        actor?: string
        reason?: string
      }
      const result = renameYeonjangRegistryInstance({
        instanceId: normalizeString(params.instanceId),
        ...(normalizeString(body.instanceAlias)
          ? { instanceAlias: normalizeString(body.instanceAlias) }
          : {}),
        ...(normalizeString(body.displayName)
          ? { displayName: normalizeString(body.displayName) }
          : {}),
        actor: normalizeString(body.actor) || "webui:operator",
        ...(normalizeString(body.reason) ? { reason: normalizeString(body.reason) } : {}),
      })
      if (!result.ok) {
        return reply.status(result.code === "instance_not_found" ? 404 : 400).send(result)
      }
      return refreshFleetResponse()
    },
  )

  app.post(
    "/api/yeonjang/instances/:instanceId/local-marker",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const params = request.params as { instanceId?: string }
      const body = (request.body ?? {}) as {
        actor?: string
        reason?: string
      }
      const result = assignYeonjangLocalMarker({
        instanceId: normalizeString(params.instanceId),
        actor: normalizeString(body.actor) || "webui:operator",
        ...(normalizeString(body.reason) ? { reason: normalizeString(body.reason) } : {}),
      })
      if (!result.ok) {
        return reply.status(404).send(result)
      }
      return refreshFleetResponse()
    },
  )
}
