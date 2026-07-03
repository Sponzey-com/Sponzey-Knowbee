export type UiRouteMode = "beginner" | "advanced" | "admin"
export type UiRouteMigrationStatus = "kept" | "redirect" | "compatibility" | "deprecated"

export interface UiRouteInventoryItem {
  path: string
  mode: UiRouteMode
  component: string
  apiCalls: string[]
  status: UiRouteMigrationStatus
  replacementPath: string | null
  notes: string
}

export interface UiRouteMigrationResult {
  from: string
  to: string
  mode: UiRouteMode
  status: UiRouteMigrationStatus
  component: string
}

export type UnifiedRouteReason =
  | "legacy_sub_agent_settings_route"
  | "legacy_sub_agent_orchestration_route"
  | "legacy_connection_settings_route"
  | "legacy_run_history_route"
  | "legacy_management_route"

export interface UnifiedRouteResolution {
  from: string
  to: string
  reason: UnifiedRouteReason
}

const UI_ROUTE_INVENTORY: UiRouteInventoryItem[] = [
  {
    path: "/",
    mode: "beginner",
    component: "Navigate",
    apiCalls: ["/api/setup/state", "/api/ui/shell"],
    status: "kept",
    replacementPath: null,
    notes: "Setup completion decides the landing page.",
  },
  {
    path: "/setup",
    mode: "beginner",
    component: "SetupPage",
    apiCalls: ["/api/setup", "/api/setup/checks", "/api/ui/shell"],
    status: "kept",
    replacementPath: null,
    notes: "First-run setup remains shared by beginner and advanced users.",
  },
  {
    path: "/chat",
    mode: "beginner",
    component: "ChatPage",
    apiCalls: ["/api/chat", "/api/runs", "/api/ui/shell"],
    status: "kept",
    replacementPath: null,
    notes: "Beginner chat is the primary entry point.",
  },
  {
    path: "/tasks",
    mode: "beginner",
    component: "BeginnerTasksPage",
    apiCalls: ["/api/ui/shell"],
    status: "compatibility",
    replacementPath: "/advanced/runs",
    notes: "Compact work summary with an advanced details path.",
  },
  {
    path: "/status",
    mode: "beginner",
    component: "BeginnerStatusPage",
    apiCalls: ["/api/ui/shell", "/api/status"],
    status: "kept",
    replacementPath: null,
    notes: "Connection summary for non-technical users.",
  },
  {
    path: "/sub-agents",
    mode: "beginner",
    component: "TopologyWorkspacePage",
    apiCalls: [
      "/api/topologies",
      "/api/topology-templates",
      "/api/relation-templates",
      "/api/agent-topology",
      "/api/work-order-templates",
    ],
    status: "kept",
    replacementPath: null,
    notes: "Beginner-accessible sub-agent settings screen backed by the simple executor graph workspace.",
  },

  {
    path: "/dashboard",
    mode: "advanced",
    component: "DashboardPage",
    apiCalls: ["/api/status", "/api/doctor"],
    status: "redirect",
    replacementPath: "/advanced/dashboard",
    notes: "Legacy diagnostics URL.",
  },
  {
    path: "/runs",
    mode: "advanced",
    component: "RunsPage",
    apiCalls: ["/api/runs"],
    status: "redirect",
    replacementPath: "/advanced/runs",
    notes: "Legacy execution monitor URL.",
  },
  {
    path: "/audit",
    mode: "advanced",
    component: "AuditPage",
    apiCalls: ["/api/audit"],
    status: "redirect",
    replacementPath: "/advanced/audit",
    notes: "Legacy audit URL.",
  },
  {
    path: "/schedules",
    mode: "advanced",
    component: "SchedulePage",
    apiCalls: ["/api/schedules"],
    status: "redirect",
    replacementPath: "/advanced/schedules",
    notes: "Legacy schedule URL.",
  },
  {
    path: "/plugins",
    mode: "advanced",
    component: "PluginsPage",
    apiCalls: ["/api/plugins"],
    status: "redirect",
    replacementPath: "/advanced/plugins",
    notes: "Legacy plugin URL.",
  },
  {
    path: "/topology",
    mode: "beginner",
    component: "TopologyWorkspacePage",
    apiCalls: [
      "/api/topologies",
      "/api/topology-templates",
      "/api/relation-templates",
      "/api/agent-topology",
      "/api/work-order-templates",
    ],
    status: "redirect",
    replacementPath: "/sub-agents",
    notes: "Legacy topology URL now opens the beginner-accessible sub-agent settings screen.",
  },
  {
    path: "/enterprise-topology",
    mode: "advanced",
    component: "TopologyWorkspacePage",
    apiCalls: [
      "/api/topologies",
      "/api/topology-templates",
      "/api/relation-templates",
      "/api/topologies/:topologyId/gui-draft/issues",
      "/api/topologies/:topologyId/gui-draft/compiled-preview",
      "/api/work-order-templates",
      "/api/topology-runs/:topologyRunId/trace",
      "/api/topology-runs/:topologyRunId/failure-reports",
    ],
    status: "redirect",
    replacementPath: "/advanced/topology",
    notes: "Legacy enterprise builder URL now opens the unified topology workspace in build mode.",
  },
  {
    path: "/settings",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/setup"],
    status: "redirect",
    replacementPath: "/advanced/ai",
    notes: "Legacy all-settings URL now redirects to the AI settings entry.",
  },
  {
    path: "/ai",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/setup/ai"],
    status: "deprecated",
    replacementPath: "/advanced/ai",
    notes: "Old direct AI setup URL.",
  },
  {
    path: "/channels",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/channels"],
    status: "deprecated",
    replacementPath: "/advanced/channels",
    notes: "Old direct channel setup URL.",
  },
  {
    path: "/extensions",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/mqtt"],
    status: "deprecated",
    replacementPath: "/advanced/extensions",
    notes: "Old direct Yeonjang setup URL.",
  },
  {
    path: "/memory",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/memory"],
    status: "deprecated",
    replacementPath: "/advanced/memory",
    notes: "Old direct memory setup URL.",
  },
  {
    path: "/tools",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/capabilities"],
    status: "deprecated",
    replacementPath: "/advanced/tools",
    notes: "Old direct tool permission URL.",
  },
  {
    path: "/release",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/update"],
    status: "deprecated",
    replacementPath: "/advanced/release",
    notes: "Old direct release URL.",
  },

  {
    path: "/advanced/chat",
    mode: "advanced",
    component: "ChatPage",
    apiCalls: ["/api/chat", "/api/runs"],
    status: "kept",
    replacementPath: null,
    notes: "Advanced chat uses the existing conversation surface.",
  },
  {
    path: "/advanced/runs",
    mode: "advanced",
    component: "RunsPage",
    apiCalls: ["/api/runs"],
    status: "kept",
    replacementPath: null,
    notes: "Full execution monitor.",
  },
  {
    path: "/advanced/ai",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/setup/ai"],
    status: "kept",
    replacementPath: null,
    notes: "Advanced AI configuration.",
  },
  {
    path: "/advanced/channels",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/channels"],
    status: "kept",
    replacementPath: null,
    notes: "Advanced channel configuration.",
  },
  {
    path: "/advanced/extensions",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/mqtt"],
    status: "kept",
    replacementPath: null,
    notes: "Advanced Yeonjang configuration.",
  },
  {
    path: "/advanced/schedules",
    mode: "advanced",
    component: "SchedulePage",
    apiCalls: ["/api/schedules"],
    status: "kept",
    replacementPath: null,
    notes: "Advanced schedule management.",
  },
  {
    path: "/advanced/topology",
    mode: "advanced",
    component: "TopologyWorkspacePage",
    apiCalls: [
      "/api/topologies",
      "/api/topology-templates",
      "/api/relation-templates",
      "/api/topologies/:topologyId/gui-draft/issues",
      "/api/topologies/:topologyId/gui-draft/validate",
      "/api/topologies/:topologyId/gui-draft/compile",
      "/api/topologies/:topologyId/gui-draft/compiled-preview",
      "/api/topologies/:topologyId/gui-draft/run",
      "/api/work-order-templates",
      "/api/topology-runs/:topologyRunId/trace",
      "/api/topology-runs/:topologyRunId/failure-reports",
      "/api/agent-topology",
    ],
    status: "kept",
    replacementPath: null,
    notes: "Advanced alias for sub-agent settings, backed by the unified simple executor graph workspace.",
  },
  {
    path: "/advanced/enterprise-topology",
    mode: "advanced",
    component: "Navigate",
    apiCalls: [
      "/api/topologies",
      "/api/topology-templates",
      "/api/relation-templates",
      "/api/topologies/:topologyId/gui-draft/issues",
      "/api/topologies/:topologyId/gui-draft/validate",
      "/api/topologies/:topologyId/gui-draft/compile",
      "/api/topologies/:topologyId/gui-draft/compiled-preview",
      "/api/topologies/:topologyId/gui-draft/run",
      "/api/work-order-templates",
      "/api/topology-runs/:topologyRunId/trace",
      "/api/topology-runs/:topologyRunId/failure-reports",
      "/api/topologies/:topologyId/versions",
    ],
    status: "compatibility",
    replacementPath: "/advanced/topology?mode=build",
    notes: "Compatibility alias for old enterprise builder bookmarks.",
  },
  {
    path: "/advanced/orchestration",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/settings", "/api/status"],
    status: "kept",
    replacementPath: null,
    notes: "Sub-agent orchestration runtime mode and feature flag settings.",
  },
  {
    path: "/advanced/memory",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/memory"],
    status: "kept",
    replacementPath: null,
    notes: "Advanced memory configuration.",
  },
  {
    path: "/advanced/tools",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/capabilities"],
    status: "kept",
    replacementPath: null,
    notes: "Advanced tool permission configuration.",
  },
  {
    path: "/advanced/dashboard",
    mode: "advanced",
    component: "DashboardPage",
    apiCalls: ["/api/status", "/api/doctor"],
    status: "kept",
    replacementPath: null,
    notes: "Advanced diagnostics.",
  },
  {
    path: "/advanced/release",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/update"],
    status: "kept",
    replacementPath: null,
    notes: "Advanced release and version view.",
  },
  {
    path: "/advanced/settings",
    mode: "advanced",
    component: "SettingsPage",
    apiCalls: ["/api/config", "/api/setup"],
    status: "redirect",
    replacementPath: "/advanced/ai",
    notes: "Deprecated compatibility URL that now redirects to the AI settings entry.",
  },
  {
    path: "/advanced/audit",
    mode: "advanced",
    component: "AuditPage",
    apiCalls: ["/api/audit"],
    status: "kept",
    replacementPath: null,
    notes: "Audit viewer.",
  },
  {
    path: "/advanced/plugins",
    mode: "advanced",
    component: "PluginsPage",
    apiCalls: ["/api/plugins"],
    status: "kept",
    replacementPath: null,
    notes: "Plugin management.",
  },
  {
    path: "/admin",
    mode: "admin",
    component: "AdminShellPage",
    apiCalls: ["/api/admin/*"],
    status: "kept",
    replacementPath: null,
    notes: "Available only when the explicit admin runtime flag is enabled.",
  },
]

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? "/"
  const trimmed = pathOnly.trim() || "/"
  if (trimmed === "/") return "/"
  return trimmed.replace(/\/+$/, "")
}

const UNIFIED_ROUTE_RULES: Array<{ base: string; to: string; reason: UnifiedRouteReason }> = [
  { base: "/runs", to: "/tasks", reason: "legacy_run_history_route" },
  { base: "/dashboard", to: "/status", reason: "legacy_management_route" },
  { base: "/audit", to: "/status", reason: "legacy_management_route" },
  { base: "/schedules", to: "/status", reason: "legacy_management_route" },
  { base: "/plugins", to: "/status", reason: "legacy_management_route" },
  { base: "/settings", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/ai", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/channels", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/extensions", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/memory", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/tools", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/release", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/advanced/topology", to: "/sub-agents", reason: "legacy_sub_agent_settings_route" },
  { base: "/advanced/enterprise-topology", to: "/sub-agents", reason: "legacy_sub_agent_settings_route" },
  { base: "/topology", to: "/sub-agents", reason: "legacy_sub_agent_settings_route" },
  { base: "/enterprise-topology", to: "/sub-agents", reason: "legacy_sub_agent_settings_route" },
  { base: "/advanced/orchestration", to: "/sub-agents", reason: "legacy_sub_agent_orchestration_route" },
  { base: "/advanced/settings", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/advanced/ai", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/advanced/channels", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/advanced/extensions", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/advanced/memory", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/advanced/tools", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/advanced/release", to: "/setup", reason: "legacy_connection_settings_route" },
  { base: "/advanced/runs", to: "/tasks", reason: "legacy_run_history_route" },
  { base: "/advanced/dashboard", to: "/status", reason: "legacy_management_route" },
  { base: "/advanced/audit", to: "/status", reason: "legacy_management_route" },
  { base: "/advanced/plugins", to: "/status", reason: "legacy_management_route" },
  { base: "/advanced/schedules", to: "/status", reason: "legacy_management_route" },
]

function matchesRouteBase(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

export function resolveUnifiedRoute(pathname: string): UnifiedRouteResolution | null {
  const normalized = normalizePathname(pathname)
  for (const rule of UNIFIED_ROUTE_RULES) {
    if (!matchesRouteBase(normalized, rule.base)) continue
    return { from: normalized, to: rule.to, reason: rule.reason }
  }
  return null
}

function appendPathSuffix(target: string, source: string, base: string): string {
  if (base === "/settings" || base === "/advanced/settings") return target
  const suffix = source.slice(base.length)
  return suffix.startsWith("/") ? `${target}${suffix}` : target
}

export function getUiRouteInventory(): UiRouteInventoryItem[] {
  return UI_ROUTE_INVENTORY.map((item) => ({ ...item, apiCalls: [...item.apiCalls] }))
}

export function getDeprecatedUiRoutes(): UiRouteInventoryItem[] {
  return getUiRouteInventory().filter((item) => item.status === "deprecated")
}

export function resolveRouteMigration(pathname: string): UiRouteMigrationResult | null {
  const normalized = normalizePathname(pathname)
  for (const item of UI_ROUTE_INVENTORY) {
    const base = normalizePathname(item.path)
    if (normalized !== base && !normalized.startsWith(`${base}/`)) continue
    if (item.status !== "redirect" && item.status !== "deprecated") return null
    if (!item.replacementPath) return null
    return {
      from: normalized,
      to: appendPathSuffix(item.replacementPath, normalized, base),
      mode: item.mode,
      status: item.status,
      component: item.component,
    }
  }
  return null
}

export function resolveLegacyAdvancedRoute(pathname: string): string | null {
  return resolveUnifiedRoute(pathname)?.to ?? resolveRouteMigration(pathname)?.to ?? null
}

export function resolveRollbackRoute(pathname: string): string {
  const normalized = normalizePathname(pathname)
  const unified = resolveUnifiedRoute(normalized)
  if (unified) return unified.to
  if (normalized === "/") return "/chat"
  return normalized
}

export function resolveModeSwitchRoute(pathname: string, targetMode: UiRouteMode): string {
  const normalized = normalizePathname(pathname)
  const unified = resolveUnifiedRoute(normalized)
  if (unified) return unified.to
  if (normalized === "/") return "/chat"
  if (targetMode !== "admin" && normalized.startsWith("/admin")) return "/status"
  return normalized
}
