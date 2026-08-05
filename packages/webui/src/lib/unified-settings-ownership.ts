export type UnifiedSettingsSectionId =
  | "basics"
  | "ai"
  | "connections"
  | "sub_agents"
  | "automation"
  | "memory"
  | "permissions"
  | "diagnostics"

export type UnifiedSettingsVisibility = "user" | "admin" | "both"
export type UnifiedSettingsStateKind = "draft" | "saved" | "active"
export type UnifiedSettingsRouteClassification =
  | "active_owner"
  | "compatibility_redirect"
  | "dead_candidate"
export type CompatibilityLifecycle = "active" | "deprecated" | "redirect_only" | "removable"

export interface UnifiedSettingsSection {
  id: UnifiedSettingsSectionId
  order: number
  required: boolean
  visibility: UnifiedSettingsVisibility
  commandOwner: string
  stateKinds: readonly UnifiedSettingsStateKind[]
  exposesRawContract: false
  agentInspectorSections?: readonly [
    "identity_role",
    "model",
    "skill_mcp",
    "memory",
    "permissions",
    "delegation",
    "monitoring",
  ]
}

export interface UnifiedSettingsRouteEvidence {
  productionImports: readonly string[]
  testReferences: readonly string[]
}

export interface UnifiedSettingsRouteOwnership {
  path: string | null
  component: string
  sourceFile: string
  classification: UnifiedSettingsRouteClassification
  lifecycle: CompatibilityLifecycle
  replacementPath: string | null
  sectionIds: readonly UnifiedSettingsSectionId[]
  commandOwners: readonly string[]
  persistedContract: string
  evidence: UnifiedSettingsRouteEvidence
  removalConditions: readonly string[]
}

export type UnifiedSettingsOwnershipIssueCode =
  | "duplicate_active_owner"
  | "section_owner_missing"
  | "compatibility_replacement_missing"
  | "compatibility_removal_condition_missing"
  | "dead_candidate_has_production_import"
  | "source_missing"
  | "section_reference_unknown"
  | "raw_contract_exposed"

export interface UnifiedSettingsOwnershipIssue {
  code: UnifiedSettingsOwnershipIssueCode
  subject: string
}

export interface UnifiedSettingsOwnershipValidation {
  ok: boolean
  issues: UnifiedSettingsOwnershipIssue[]
}

export const UNIFIED_SETTINGS_SECTIONS: readonly UnifiedSettingsSection[] = [
  {
    id: "basics",
    order: 10,
    required: true,
    visibility: "user",
    commandOwner: "setup.identity.save",
    stateKinds: ["draft", "saved", "active"],
    exposesRawContract: false,
  },
  {
    id: "ai",
    order: 20,
    required: true,
    visibility: "user",
    commandOwner: "setup.ai.save_and_test",
    stateKinds: ["draft", "saved", "active"],
    exposesRawContract: false,
  },
  {
    id: "connections",
    order: 30,
    required: false,
    visibility: "user",
    commandOwner: "setup.connections.save",
    stateKinds: ["draft", "saved", "active"],
    exposesRawContract: false,
  },
  {
    id: "sub_agents",
    order: 40,
    required: false,
    visibility: "user",
    commandOwner: "agent_topology.save",
    stateKinds: ["draft", "saved", "active"],
    exposesRawContract: false,
    agentInspectorSections: [
      "identity_role",
      "model",
      "skill_mcp",
      "memory",
      "permissions",
      "delegation",
      "monitoring",
    ],
  },
  {
    id: "automation",
    order: 50,
    required: false,
    visibility: "user",
    commandOwner: "schedule.save",
    stateKinds: ["draft", "saved", "active"],
    exposesRawContract: false,
  },
  {
    id: "memory",
    order: 60,
    required: false,
    visibility: "user",
    commandOwner: "memory.runtime.read",
    stateKinds: ["active"],
    exposesRawContract: false,
  },
  {
    id: "permissions",
    order: 70,
    required: false,
    visibility: "user",
    commandOwner: "capability.policy.save",
    stateKinds: ["draft", "saved", "active"],
    exposesRawContract: false,
  },
  {
    id: "diagnostics",
    order: 80,
    required: false,
    visibility: "admin",
    commandOwner: "runtime.diagnostics.read",
    stateKinds: ["active"],
    exposesRawContract: false,
  },
]

const APP_ROUTE_SOURCE = "packages/webui/src/App.tsx"
const APP_ROUTE_EVIDENCE = [APP_ROUTE_SOURCE] as const

function compatibilityRoute(input: {
  path: string
  component: string
  sourceFile: string
  lifecycle: CompatibilityLifecycle
  replacementPath: "/settings" | "/agents" | "/work/schedules"
  sectionIds: readonly UnifiedSettingsSectionId[]
  commandOwners: readonly string[]
  persistedContract: string
}): UnifiedSettingsRouteOwnership {
  return {
    ...input,
    classification: "compatibility_redirect",
    evidence: {
      productionImports: APP_ROUTE_EVIDENCE,
      testReferences: ["tests/task015-ui-route-migration.test.ts"],
    },
    removalConditions: [
      "App route renders replacement-only navigation",
      "saved configuration reloads through the authoritative route",
      "legacy deep-link regression passes",
    ],
  }
}

function commandOwnerFor(sectionId: UnifiedSettingsSectionId): string {
  const section = UNIFIED_SETTINGS_SECTIONS.find((candidate) => candidate.id === sectionId)
  if (!section) throw new Error(`unified_settings_section_missing:${sectionId}`)
  return section.commandOwner
}

const LEGACY_SETTINGS_ROUTES = [
  ["/ai", "ai"],
  ["/channels", "connections"],
  ["/extensions", "connections"],
  ["/memory", "memory"],
  ["/tools", "permissions"],
  ["/release", "diagnostics"],
] as const satisfies readonly (readonly [string, UnifiedSettingsSectionId])[]

const ADVANCED_SETTINGS_ROUTES = [
  ["/advanced/ai", "ai"],
  ["/advanced/channels", "connections"],
  ["/advanced/extensions", "connections"],
  ["/advanced/memory", "memory"],
  ["/advanced/tools", "permissions"],
  ["/advanced/release", "diagnostics"],
] as const satisfies readonly (readonly [string, UnifiedSettingsSectionId])[]

export const UNIFIED_SETTINGS_ROUTE_OWNERSHIP: readonly UnifiedSettingsRouteOwnership[] = [
  {
    path: "/settings",
    component: "SetupPage",
    sourceFile: "packages/webui/src/pages/SetupPage.tsx",
    classification: "active_owner",
    lifecycle: "active",
    replacementPath: null,
    sectionIds: ["basics", "ai", "connections", "memory", "permissions", "diagnostics"],
    commandOwners: [
      "setup.identity.save",
      "setup.ai.save_and_test",
      "setup.connections.save",
      "memory.runtime.read",
      "capability.policy.save",
      "runtime.diagnostics.read",
    ],
    persistedContract: "SetupDraft",
    evidence: {
      productionImports: APP_ROUTE_EVIDENCE,
      testReferences: ["tests/task006-unified-settings-panel.test.tsx"],
    },
    removalConditions: [],
  },
  {
    path: "/agents",
    component: "AgentsPage",
    sourceFile: "packages/webui/src/pages/AgentsPage.tsx",
    classification: "active_owner",
    lifecycle: "active",
    replacementPath: null,
    sectionIds: ["sub_agents"],
    commandOwners: [
      "agent_identity.command",
      "agent_operational_settings.command",
      "agent_capability_binding.command",
      "agent_relationship.command",
    ],
    persistedContract: "AgentConfig",
    evidence: {
      productionImports: APP_ROUTE_EVIDENCE,
      testReferences: ["tests/task007-unified-settings-detail-sections.test.tsx"],
    },
    removalConditions: [],
  },
  {
    path: "/work/schedules",
    component: "SchedulePage",
    sourceFile: "packages/webui/src/pages/SchedulePage.tsx",
    classification: "active_owner",
    lifecycle: "active",
    replacementPath: null,
    sectionIds: ["automation"],
    commandOwners: ["schedule.save"],
    persistedContract: "ScheduleContract",
    evidence: {
      productionImports: APP_ROUTE_EVIDENCE,
      testReferences: ["tests/task046-automation-section-convergence.test.ts"],
    },
    removalConditions: [],
  },
  ...LEGACY_SETTINGS_ROUTES.map(([path, sectionId]) =>
    compatibilityRoute({
      path,
      component: "LegacyAdvancedRedirect",
      sourceFile: APP_ROUTE_SOURCE,
      lifecycle: "redirect_only",
      replacementPath: "/settings",
      sectionIds: [sectionId],
      commandOwners: [commandOwnerFor(sectionId)],
      persistedContract: "SetupDraft",
    }),
  ),
  ...ADVANCED_SETTINGS_ROUTES.map(([path, sectionId]) =>
    compatibilityRoute({
      path,
      component: "UnifiedRouteRedirect",
      sourceFile: APP_ROUTE_SOURCE,
      lifecycle: "redirect_only",
      replacementPath: "/settings",
      sectionIds: [sectionId],
      commandOwners: [commandOwnerFor(sectionId)],
      persistedContract: "SetupDraft",
    }),
  ),
  compatibilityRoute({
    path: "/advanced/settings",
    component: "UnifiedRouteRedirect",
    sourceFile: APP_ROUTE_SOURCE,
    lifecycle: "redirect_only",
    replacementPath: "/settings",
    sectionIds: [
      "basics",
      "ai",
      "connections",
      "automation",
      "memory",
      "permissions",
      "diagnostics",
    ],
    commandOwners: ["setup.identity.save", "setup.ai.save_and_test", "setup.connections.save"],
    persistedContract: "SetupDraft",
  }),
  ...[
    "/topology",
    "/enterprise-topology",
    "/advanced/topology",
    "/advanced/enterprise-topology",
    "/advanced/orchestration",
  ].map((path) =>
    compatibilityRoute({
      path,
      component: "UnifiedRouteRedirect",
      sourceFile: APP_ROUTE_SOURCE,
      lifecycle: "redirect_only",
      replacementPath: "/agents",
      sectionIds: ["sub_agents"],
      commandOwners: [
        "agent_identity.command",
        "agent_operational_settings.command",
        "agent_capability_binding.command",
        "agent_relationship.command",
      ],
      persistedContract: "AgentConfig",
    }),
  ),
  {
    path: null,
    component: "LegacyEnterpriseTopologyPage",
    sourceFile: "packages/webui/src/pages/EnterpriseTopologyPage.tsx",
    classification: "dead_candidate",
    lifecycle: "removable",
    replacementPath: "/agents",
    sectionIds: ["sub_agents"],
    commandOwners: ["agent_topology.save"],
    persistedContract: "SetupSubAgentDraft",
    evidence: {
      productionImports: [],
      testReferences: [
        "tests/task004-simple-workspace-shell.test.tsx",
        "tests/task012-advanced-escape-hatch.test.tsx",
        "tests/task013-executor-first-usability.test.tsx",
      ],
    },
    removalConditions: ["replace or delete tests that directly instantiate the legacy component"],
  },
]

const LIFECYCLE_TRANSITIONS: Readonly<
  Record<CompatibilityLifecycle, readonly CompatibilityLifecycle[]>
> = {
  active: ["deprecated"],
  deprecated: ["redirect_only"],
  redirect_only: ["removable"],
  removable: [],
}

export function canTransitionCompatibilityLifecycle(
  current: CompatibilityLifecycle,
  next: CompatibilityLifecycle,
): boolean {
  return LIFECYCLE_TRANSITIONS[current].includes(next)
}

export function validateUnifiedSettingsOwnership(input: {
  sections: readonly UnifiedSettingsSection[]
  routes: readonly UnifiedSettingsRouteOwnership[]
  sourceExists: (path: string) => boolean
}): UnifiedSettingsOwnershipValidation {
  const issues: UnifiedSettingsOwnershipIssue[] = []
  const sectionIds = new Set(input.sections.map((section) => section.id))
  const owners = new Map<UnifiedSettingsSectionId, string[]>()

  for (const section of input.sections) {
    if (section.exposesRawContract !== false) {
      issues.push({ code: "raw_contract_exposed", subject: section.id })
    }
  }

  for (const route of input.routes) {
    const subject = route.path ?? route.sourceFile
    if (!input.sourceExists(route.sourceFile)) {
      issues.push({ code: "source_missing", subject })
    }
    for (const sectionId of route.sectionIds) {
      if (!sectionIds.has(sectionId)) {
        issues.push({ code: "section_reference_unknown", subject: `${subject}:${sectionId}` })
      }
      if (route.classification === "active_owner") {
        owners.set(sectionId, [...(owners.get(sectionId) ?? []), subject])
      }
    }
    if (route.classification === "compatibility_redirect") {
      if (!route.replacementPath) {
        issues.push({ code: "compatibility_replacement_missing", subject })
      }
      if (route.removalConditions.length === 0) {
        issues.push({ code: "compatibility_removal_condition_missing", subject })
      }
    }
    if (route.classification === "dead_candidate" && route.evidence.productionImports.length > 0) {
      issues.push({ code: "dead_candidate_has_production_import", subject })
    }
  }

  for (const section of input.sections) {
    const sectionOwners = owners.get(section.id) ?? []
    if (sectionOwners.length === 0) {
      issues.push({ code: "section_owner_missing", subject: section.id })
    } else if (sectionOwners.length > 1) {
      issues.push({ code: "duplicate_active_owner", subject: section.id })
    }
  }

  return { ok: issues.length === 0, issues }
}
