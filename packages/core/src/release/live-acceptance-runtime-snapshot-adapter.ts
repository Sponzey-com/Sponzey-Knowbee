import type {
  DbAgentCapabilityBinding,
  DbMcpServerCatalogEntry,
  DbSkillCatalogEntry,
} from "../db/index.js"
import type { AnyTool } from "../tools/types.js"
import type { YeonjangRegistryInstanceView } from "../yeonjang/registry.js"
import type { LiveAcceptanceRuntimeSnapshot } from "./live-acceptance-selection-preflight.js"

export interface LiveAcceptanceRuntimeSnapshotReaders {
  readonly listBindings: () => readonly DbAgentCapabilityBinding[]
  readonly listSkillCatalogs: () => readonly DbSkillCatalogEntry[]
  readonly listMcpCatalogs: () => readonly DbMcpServerCatalogEntry[]
  readonly listTools: () => readonly Pick<
    AnyTool,
    "name" | "riskLevel" | "requiresApproval" | "sideEffect"
  >[]
  readonly listYeonjangInstances: (capturedAt: number) => readonly YeonjangRegistryInstanceView[]
}

function validCapturedAt(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("live_acceptance_snapshot_captured_at_invalid")
  }
}

function isExtensionBinding(
  binding: DbAgentCapabilityBinding,
): binding is DbAgentCapabilityBinding & { capability_kind: "skill" | "mcp_server" } {
  return binding.capability_kind === "skill" || binding.capability_kind === "mcp_server"
}

export function captureLiveAcceptanceRuntimeSnapshot(input: {
  readonly capturedAt: number
  readonly readers: LiveAcceptanceRuntimeSnapshotReaders
}): LiveAcceptanceRuntimeSnapshot {
  validCapturedAt(input.capturedAt)

  const bindings = input.readers.listBindings()
  const skillCatalogs = input.readers.listSkillCatalogs()
  const mcpCatalogs = input.readers.listMcpCatalogs()
  const tools = input.readers.listTools()
  const yeonjangInstances = input.readers.listYeonjangInstances(input.capturedAt)

  return Object.freeze({
    capturedAt: input.capturedAt,
    extensions: Object.freeze(
      bindings
        .filter(isExtensionBinding)
        .map((binding) =>
        Object.freeze({
          bindingId: binding.binding_id,
          agentId: binding.agent_id,
          capabilityKind: binding.capability_kind,
          catalogId: binding.catalog_id,
          bindingStatus: binding.status,
          secretScopeId: binding.secret_scope_id,
          enabledToolNamesJson: binding.enabled_tool_names_json,
          disabledToolNamesJson: binding.disabled_tool_names_json,
        }),
      ),
    ),
    catalogs: Object.freeze([
      ...skillCatalogs.map((catalog) =>
        Object.freeze({
          capability: "skill" as const,
          catalogId: catalog.skill_id,
          status: catalog.status,
          risk: catalog.risk,
          toolNamesJson: catalog.tool_names_json,
        }),
      ),
      ...mcpCatalogs.map((catalog) =>
        Object.freeze({
          capability: "mcp" as const,
          catalogId: catalog.mcp_server_id,
          status: catalog.status,
          risk: catalog.risk,
          toolNamesJson: catalog.tool_names_json,
        }),
      ),
    ]),
    tools: Object.freeze(
      tools.map((tool) =>
        Object.freeze({
          name: tool.name,
          riskLevel: tool.riskLevel,
          requiresApproval: tool.requiresApproval,
          hasSideEffect: tool.sideEffect !== undefined,
        }),
      ),
    ),
    yeonjangInstances: Object.freeze(
      yeonjangInstances.map((instance) =>
        Object.freeze({
          instanceId: instance.instanceId,
          displayName: instance.displayName,
          state: instance.state,
          trustState: instance.trustState,
          scopeAccess: instance.scopeAccess,
          runnableTarget: instance.runnableTarget,
          liveSessionCount: instance.liveSessionCount,
          duplicateLiveSessionDetected: instance.duplicateLiveSessionDetected,
          session: instance.session
            ? Object.freeze({
                sessionId: instance.session.sessionId,
                state: instance.session.state,
                lastSeenAt: instance.session.lastSeenAt,
                endedAt: instance.session.endedAt,
                stale: instance.session.stale,
              })
            : null,
        }),
      ),
    ),
  })
}
