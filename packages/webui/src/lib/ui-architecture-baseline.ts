export const UI_ROUTE_BASELINE_VERSION = "ui-route-baseline:v1" as const

export type UiRouteExposure = "user" | "admin" | "audit" | "internal"

export interface UiRouteBaselineItem {
  path: string
  exposure: UiRouteExposure
  componentOwner: string
}

export const UI_ROUTE_BASELINE: readonly UiRouteBaselineItem[] = [
  { path: "/", exposure: "internal", componentOwner: "SetupLandingRedirect" },
  { path: "/setup", exposure: "user", componentOwner: "SetupPage" },
  { path: "/chat", exposure: "user", componentOwner: "ChatPage" },
  { path: "/work", exposure: "internal", componentOwner: "Navigate" },
  { path: "/work/runs", exposure: "user", componentOwner: "RunsPage" },
  { path: "/work/schedules", exposure: "user", componentOwner: "SchedulePage" },
  { path: "/work/*", exposure: "internal", componentOwner: "Navigate" },
  { path: "/agents/*", exposure: "user", componentOwner: "AgentsPage" },
  { path: "/capabilities/skills", exposure: "user", componentOwner: "SkillCatalogPage" },
  { path: "/capabilities/mcp", exposure: "user", componentOwner: "McpCatalogPage" },
  { path: "/capabilities/yeonjang", exposure: "user", componentOwner: "YeonjangCatalogPage" },
  {
    path: "/capabilities/*",
    exposure: "internal",
    componentOwner: "CanonicalCompatibilityRedirect",
  },
  { path: "/tasks", exposure: "internal", componentOwner: "Navigate" },
  { path: "/status", exposure: "user", componentOwner: "BeginnerStatusPage" },
  { path: "/sub-agents", exposure: "internal", componentOwner: "Navigate" },
  { path: "/sub-agents/*", exposure: "internal", componentOwner: "Navigate" },
  { path: "/runs/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/dashboard/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/audit/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/schedules/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/plugins/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/topology/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  {
    path: "/enterprise-topology/*",
    exposure: "internal",
    componentOwner: "LegacyAdvancedRedirect",
  },
  { path: "/settings", exposure: "user", componentOwner: "Navigate" },
  { path: "/settings/:sectionId", exposure: "user", componentOwner: "SetupPage" },
  { path: "/settings/*", exposure: "internal", componentOwner: "Navigate" },
  { path: "/ai/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/channels/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/extensions/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/memory/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/tools/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/release/*", exposure: "internal", componentOwner: "LegacyAdvancedRedirect" },
  { path: "/advanced", exposure: "internal", componentOwner: "AdvancedLandingRedirect" },
  { path: "/advanced/chat", exposure: "internal", componentOwner: "ChatPage" },
  { path: "/advanced/runs", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/runs/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/ai", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/ai/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/channels", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/channels/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/extensions", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/extensions/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/dashboard", exposure: "internal", componentOwner: "DashboardPage" },
  { path: "/advanced/dashboard/*", exposure: "internal", componentOwner: "DashboardPage" },
  { path: "/advanced/audit", exposure: "audit", componentOwner: "AuditPage" },
  { path: "/advanced/audit/*", exposure: "audit", componentOwner: "AuditPage" },
  { path: "/advanced/schedules", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/schedules/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/topology", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/topology/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  {
    path: "/advanced/enterprise-topology",
    exposure: "internal",
    componentOwner: "UnifiedRouteRedirect",
  },
  {
    path: "/advanced/enterprise-topology/*",
    exposure: "internal",
    componentOwner: "UnifiedRouteRedirect",
  },
  { path: "/advanced/orchestration", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  {
    path: "/advanced/orchestration/*",
    exposure: "internal",
    componentOwner: "UnifiedRouteRedirect",
  },
  { path: "/advanced/memory", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/memory/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/tools", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/tools/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/release", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/release/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/plugins", exposure: "internal", componentOwner: "PluginsPage" },
  { path: "/advanced/plugins/*", exposure: "internal", componentOwner: "PluginsPage" },
  { path: "/advanced/settings", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/advanced/settings/*", exposure: "internal", componentOwner: "UnifiedRouteRedirect" },
  { path: "/admin/*", exposure: "admin", componentOwner: "AdminShellPage" },
  { path: "/login", exposure: "user", componentOwner: "LoginPage" },
  { path: "*", exposure: "internal", componentOwner: "NotFoundRedirect" },
] as const

export type UiWorkflowDataClass =
  | "user_projection"
  | "capability_summary"
  | "runtime_status_summary"
  | "audit_projection"
  | "raw_system_prompt"
  | "secret"
  | "internal_path"
  | "raw_llm_contract"

export interface UiWorkflowOwnershipItem {
  workflowId: string
  routes: string[]
  componentOwners: string[]
  queryOwners: string[]
  commandOwners: string[]
  storeDependencies: string[]
  exposure: UiRouteExposure
  dataClasses: UiWorkflowDataClass[]
}

export const UI_WORKFLOW_OWNERSHIP_BASELINE: readonly UiWorkflowOwnershipItem[] = [
  {
    workflowId: "settings.workspace",
    routes: ["/setup", "/settings", "/settings/:sectionId"],
    componentOwners: ["SetupPage", "SingleSettingsWorkspaceShell"],
    queryOwners: ["setup.draft.read", "setup.checks.read", "memory.summary.read"],
    commandOwners: ["setup.settings.save", "setup.ai.test", "setup.complete"],
    storeDependencies: ["setupStore", "uiModeStore", "uiLanguageStore"],
    exposure: "user",
    dataClasses: ["user_projection", "runtime_status_summary"],
  },
  {
    workflowId: "agents.workspace",
    routes: ["/agents", "/agents/*"],
    componentOwners: ["AgentsPage", "AgentRelationshipCanvas", "AgentInspectorDrawer"],
    queryOwners: ["agent.workspace.read", "agent.relationship.read", "agent.capability.read"],
    commandOwners: ["agent.identity.save", "agent.relationship.save", "agent.archive"],
    storeDependencies: ["setupStore"],
    exposure: "user",
    dataClasses: ["user_projection", "runtime_status_summary"],
  },
  {
    workflowId: "capabilities.setup_embedded",
    routes: ["/capabilities/skills", "/capabilities/mcp", "/capabilities/yeonjang"],
    componentOwners: ["SkillCatalogPage", "McpCatalogPage", "YeonjangCatalogPage"],
    queryOwners: ["capability.setup.read", "mcp.runtime.read", "yeonjang.fleet.read"],
    commandOwners: ["setup.capabilities.save", "mcp.connection.test", "skill.source.validate"],
    storeDependencies: ["setupStore"],
    exposure: "user",
    dataClasses: ["user_projection", "capability_summary", "runtime_status_summary"],
  },
] as const

export type UiRouteBaselineReasonCode =
  | "actual_route_duplicate"
  | "actual_route_not_registered"
  | "registered_route_duplicate"
  | "registered_route_missing"

export interface UiRouteBaselineDiagnostic {
  reasonCode: UiRouteBaselineReasonCode
  routePath: string
}

export interface UiArchitectureValidation<T> {
  ok: boolean
  diagnostics: T[]
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort()
}

export function validateUiRouteBaseline(input: {
  actualRoutePaths: readonly string[]
  baseline: readonly UiRouteBaselineItem[]
}): UiArchitectureValidation<UiRouteBaselineDiagnostic> {
  const actual = input.actualRoutePaths.filter(Boolean)
  const registered = input.baseline.map((item) => item.path)
  const actualSet = new Set(actual)
  const registeredSet = new Set(registered)
  const diagnostics: UiRouteBaselineDiagnostic[] = []

  for (const routePath of duplicateValues(actual)) {
    diagnostics.push({ reasonCode: "actual_route_duplicate", routePath })
  }
  for (const routePath of [...actualSet].filter((path) => !registeredSet.has(path)).sort()) {
    diagnostics.push({ reasonCode: "actual_route_not_registered", routePath })
  }
  for (const routePath of duplicateValues(registered)) {
    diagnostics.push({ reasonCode: "registered_route_duplicate", routePath })
  }
  for (const routePath of [...registeredSet].filter((path) => !actualSet.has(path)).sort()) {
    diagnostics.push({ reasonCode: "registered_route_missing", routePath })
  }

  return { ok: diagnostics.length === 0, diagnostics }
}

export type UiWorkflowOwnershipReasonCode =
  | "workflow_field_empty"
  | "workflow_id_duplicated"
  | "command_owner_duplicated"
  | "restricted_data_exposed_to_user"

export interface UiWorkflowOwnershipDiagnostic {
  reasonCode: UiWorkflowOwnershipReasonCode
  workflowId: string
  owner?: string
  dataClass?: UiWorkflowDataClass
}

const USER_RESTRICTED_DATA_CLASSES = new Set<UiWorkflowDataClass>([
  "audit_projection",
  "raw_system_prompt",
  "secret",
  "internal_path",
  "raw_llm_contract",
])

export function validateUiWorkflowOwnership(
  items: readonly UiWorkflowOwnershipItem[],
): UiArchitectureValidation<UiWorkflowOwnershipDiagnostic> {
  const diagnostics: UiWorkflowOwnershipDiagnostic[] = []
  const workflowIds = new Set<string>()
  const commandOwners = new Set<string>()

  for (const item of items) {
    if (workflowIds.has(item.workflowId)) {
      diagnostics.push({ reasonCode: "workflow_id_duplicated", workflowId: item.workflowId })
    }
    workflowIds.add(item.workflowId)

    const requiredLists = [
      item.routes,
      item.componentOwners,
      item.queryOwners,
      item.commandOwners,
      item.storeDependencies,
      item.dataClasses,
    ]
    if (!item.workflowId.trim() || requiredLists.some((values) => values.length === 0)) {
      diagnostics.push({ reasonCode: "workflow_field_empty", workflowId: item.workflowId })
    }

    for (const owner of item.commandOwners) {
      if (commandOwners.has(owner)) {
        diagnostics.push({
          reasonCode: "command_owner_duplicated",
          workflowId: item.workflowId,
          owner,
        })
      }
      commandOwners.add(owner)
    }

    if (item.exposure === "user") {
      for (const dataClass of item.dataClasses) {
        if (USER_RESTRICTED_DATA_CLASSES.has(dataClass)) {
          diagnostics.push({
            reasonCode: "restricted_data_exposed_to_user",
            workflowId: item.workflowId,
            dataClass,
          })
        }
      }
    }
  }

  return { ok: diagnostics.length === 0, diagnostics }
}
