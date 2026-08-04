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
    component: "Navigate",
    apiCalls: ["/api/ui/shell"],
    status: "redirect",
    replacementPath: "/work/runs",
    notes: "Legacy task summary URL redirects to the canonical work runs view.",
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
    path: "/agents",
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
    notes: "Canonical sub-agent settings workspace.",
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
    replacementPath: "/work/runs",
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
    replacementPath: "/work/schedules",
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
    component: "UnifiedRouteRedirect",
    apiCalls: [],
    status: "redirect",
    replacementPath: "/agents",
    notes: "Legacy topology URL now opens the canonical sub-agent settings workspace.",
  },
  {
    path: "/enterprise-topology",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: [],
    status: "redirect",
    replacementPath: "/agents",
    notes: "Legacy enterprise builder URL redirects to the canonical agent workspace.",
  },
  {
    path: "/settings",
    mode: "advanced",
    component: "SetupPage",
    apiCalls: ["/api/config", "/api/setup"],
    status: "kept",
    replacementPath: null,
    notes: "Canonical completed settings workspace.",
  },
  {
    path: "/ai",
    mode: "advanced",
    component: "LegacyAdvancedRedirect",
    apiCalls: ["/api/config", "/api/setup/ai"],
    status: "redirect",
    replacementPath: "/settings/ai",
    notes: "Old direct AI setup URL.",
  },
  {
    path: "/channels",
    mode: "advanced",
    component: "LegacyAdvancedRedirect",
    apiCalls: ["/api/config", "/api/channels"],
    status: "redirect",
    replacementPath: "/settings/connections",
    notes: "Old direct channel setup URL.",
  },
  {
    path: "/extensions",
    mode: "advanced",
    component: "LegacyAdvancedRedirect",
    apiCalls: ["/api/config", "/api/mqtt"],
    status: "redirect",
    replacementPath: "/settings/connections",
    notes: "Old direct Yeonjang setup URL.",
  },
  {
    path: "/memory",
    mode: "advanced",
    component: "LegacyAdvancedRedirect",
    apiCalls: ["/api/config", "/api/memory"],
    status: "redirect",
    replacementPath: "/settings/memory",
    notes: "Old direct memory setup URL.",
  },
  {
    path: "/tools",
    mode: "advanced",
    component: "LegacyAdvancedRedirect",
    apiCalls: ["/api/config", "/api/capabilities"],
    status: "redirect",
    replacementPath: "/settings/permissions",
    notes: "Old direct tool permission URL.",
  },
  {
    path: "/release",
    mode: "advanced",
    component: "LegacyAdvancedRedirect",
    apiCalls: ["/api/update"],
    status: "redirect",
    replacementPath: "/settings/diagnostics",
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
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/runs"],
    status: "redirect",
    replacementPath: "/work/runs",
    notes: "Compatibility execution URL redirects to the canonical work runs view.",
  },
  {
    path: "/advanced/ai",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/config", "/api/setup/ai"],
    status: "redirect",
    replacementPath: "/settings/ai",
    notes: "Compatibility AI URL redirects to the authoritative settings workspace.",
  },
  {
    path: "/advanced/channels",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/config", "/api/channels"],
    status: "redirect",
    replacementPath: "/settings/connections",
    notes: "Compatibility channel URL redirects to the authoritative settings workspace.",
  },
  {
    path: "/advanced/extensions",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/config", "/api/mqtt"],
    status: "redirect",
    replacementPath: "/settings/connections",
    notes: "Compatibility Yeonjang URL redirects to the authoritative settings workspace.",
  },
  {
    path: "/advanced/schedules",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/schedules"],
    status: "redirect",
    replacementPath: "/work/schedules",
    notes: "Advanced schedule management.",
  },
  {
    path: "/advanced/topology",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: [],
    status: "redirect",
    replacementPath: "/agents",
    notes: "Compatibility topology URL redirects to the canonical agent workspace.",
  },
  {
    path: "/advanced/enterprise-topology",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: [],
    status: "redirect",
    replacementPath: "/agents",
    notes: "Compatibility enterprise builder URL redirects to the canonical agent workspace.",
  },
  {
    path: "/advanced/orchestration",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/settings", "/api/status"],
    status: "redirect",
    replacementPath: "/agents",
    notes: "Compatibility orchestration URL redirects to the authoritative agent workspace.",
  },
  {
    path: "/advanced/memory",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/config", "/api/memory"],
    status: "redirect",
    replacementPath: "/settings/memory",
    notes: "Compatibility memory URL redirects to the authoritative settings workspace.",
  },
  {
    path: "/advanced/tools",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/config", "/api/capabilities"],
    status: "redirect",
    replacementPath: "/settings/permissions",
    notes: "Compatibility permission URL redirects to the authoritative settings workspace.",
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
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/update"],
    status: "redirect",
    replacementPath: "/settings/diagnostics",
    notes: "Compatibility release URL redirects to the authoritative settings workspace.",
  },
  {
    path: "/advanced/settings",
    mode: "advanced",
    component: "UnifiedRouteRedirect",
    apiCalls: ["/api/config", "/api/setup"],
    status: "redirect",
    replacementPath: "/settings",
    notes: "Deprecated compatibility URL that redirects to the authoritative settings workspace.",
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
  { base: "/tasks", to: "/work/runs", reason: "legacy_run_history_route" },
  { base: "/runs", to: "/work/runs", reason: "legacy_run_history_route" },
  { base: "/dashboard", to: "/status", reason: "legacy_management_route" },
  { base: "/audit", to: "/status", reason: "legacy_management_route" },
  { base: "/schedules", to: "/work/schedules", reason: "legacy_management_route" },
  { base: "/plugins", to: "/status", reason: "legacy_management_route" },
  { base: "/ai", to: "/settings/ai", reason: "legacy_connection_settings_route" },
  { base: "/channels", to: "/settings/connections", reason: "legacy_connection_settings_route" },
  { base: "/extensions", to: "/settings/connections", reason: "legacy_connection_settings_route" },
  { base: "/memory", to: "/settings/memory", reason: "legacy_connection_settings_route" },
  { base: "/tools", to: "/settings/permissions", reason: "legacy_connection_settings_route" },
  { base: "/release", to: "/settings/diagnostics", reason: "legacy_connection_settings_route" },
  { base: "/advanced/topology", to: "/agents", reason: "legacy_sub_agent_settings_route" },
  {
    base: "/advanced/enterprise-topology",
    to: "/agents",
    reason: "legacy_sub_agent_settings_route",
  },
  { base: "/topology", to: "/agents", reason: "legacy_sub_agent_settings_route" },
  { base: "/enterprise-topology", to: "/agents", reason: "legacy_sub_agent_settings_route" },
  {
    base: "/advanced/orchestration",
    to: "/agents",
    reason: "legacy_sub_agent_orchestration_route",
  },
  {
    base: "/advanced/settings/basics",
    to: "/settings/basics",
    reason: "legacy_connection_settings_route",
  },
  { base: "/advanced/settings/ai", to: "/settings/ai", reason: "legacy_connection_settings_route" },
  {
    base: "/advanced/settings/connections",
    to: "/settings/connections",
    reason: "legacy_connection_settings_route",
  },
  {
    base: "/advanced/settings/sub_agents",
    to: "/settings/sub_agents",
    reason: "legacy_connection_settings_route",
  },
  {
    base: "/advanced/settings/automation",
    to: "/settings/automation",
    reason: "legacy_connection_settings_route",
  },
  {
    base: "/advanced/settings/memory",
    to: "/settings/memory",
    reason: "legacy_connection_settings_route",
  },
  {
    base: "/advanced/settings/permissions",
    to: "/settings/permissions",
    reason: "legacy_connection_settings_route",
  },
  {
    base: "/advanced/settings/diagnostics",
    to: "/settings/diagnostics",
    reason: "legacy_connection_settings_route",
  },
  { base: "/advanced/settings", to: "/settings", reason: "legacy_connection_settings_route" },
  { base: "/advanced/ai", to: "/settings/ai", reason: "legacy_connection_settings_route" },
  {
    base: "/advanced/channels",
    to: "/settings/connections",
    reason: "legacy_connection_settings_route",
  },
  {
    base: "/advanced/extensions",
    to: "/settings/connections",
    reason: "legacy_connection_settings_route",
  },
  { base: "/advanced/memory", to: "/settings/memory", reason: "legacy_connection_settings_route" },
  {
    base: "/advanced/tools",
    to: "/settings/permissions",
    reason: "legacy_connection_settings_route",
  },
  {
    base: "/advanced/release",
    to: "/settings/diagnostics",
    reason: "legacy_connection_settings_route",
  },
  { base: "/advanced/runs", to: "/work/runs", reason: "legacy_run_history_route" },
  { base: "/advanced/dashboard", to: "/status", reason: "legacy_management_route" },
  { base: "/advanced/audit", to: "/status", reason: "legacy_management_route" },
  { base: "/advanced/plugins", to: "/status", reason: "legacy_management_route" },
  { base: "/advanced/schedules", to: "/work/schedules", reason: "legacy_management_route" },
]

function matchesRouteBase(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

export function resolveUnifiedRoute(pathname: string): UnifiedRouteResolution | null {
  const normalized = normalizePathname(pathname)
  const rules = [...UNIFIED_ROUTE_RULES].sort((left, right) => right.base.length - left.base.length)
  for (const rule of rules) {
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
