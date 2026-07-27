export type SkillSourceKind = "builtin" | "local"
export type SkillValidationStatus = "unvalidated" | "valid" | "invalid"
export type SkillRuntimeStatus = "inactive" | "active" | "failed" | "restart_required"

export interface SkillCatalogProjection {
  skillRef: string
  displayName: string
  description: string
  sourceKind: SkillSourceKind
  risk?: "safe" | "moderate" | "external" | "sensitive" | "dangerous"
  validationStatus: SkillValidationStatus
  runtimeStatus: SkillRuntimeStatus
  bindingCount: number
  revision: number
}

export function projectSkillCatalogItem(source: SkillCatalogProjection & Record<string, unknown>): SkillCatalogProjection {
  return {
    skillRef: source.skillRef,
    displayName: source.displayName,
    description: source.description,
    sourceKind: source.sourceKind,
    ...(source.risk === "safe" || source.risk === "moderate" || source.risk === "external" || source.risk === "sensitive" || source.risk === "dangerous"
      ? { risk: source.risk }
      : {}),
    validationStatus: source.validationStatus,
    runtimeStatus: source.runtimeStatus,
    bindingCount: source.bindingCount,
    revision: source.revision,
  }
}

export function filterSkillCatalog(items: readonly SkillCatalogProjection[], filter: {
  search?: string
  sourceKind?: SkillSourceKind
  runtimeStatus?: SkillRuntimeStatus
  boundOnly?: boolean
}): SkillCatalogProjection[] {
  const search = filter.search?.trim().toLocaleLowerCase() ?? ""
  return items.filter((item) => {
    if (search && !`${item.displayName} ${item.description}`.toLocaleLowerCase().includes(search)) return false
    if (filter.sourceKind && item.sourceKind !== filter.sourceKind) return false
    if (filter.runtimeStatus && item.runtimeStatus !== filter.runtimeStatus) return false
    if (filter.boundOnly && item.bindingCount < 1) return false
    return true
  })
}

export function validateSkillSource(input: {
  sourceKind: SkillSourceKind
  displayName: string
  requestedPath?: string
  canonicalPath?: string
  allowedRoot?: string
  existingNames: readonly string[]
  evidence?: { symlinkSafe: boolean; owned: boolean; manifestTrusted: boolean }
}): { ready: boolean; reasonCodes: string[] } {
  const reasonCodes: string[] = []
  const name = input.displayName.trim().toLocaleLowerCase()
  if (!name) reasonCodes.push("skill_name_missing")
  if (name && input.existingNames.some((item) => item.trim().toLocaleLowerCase() === name)) {
    reasonCodes.push("skill_name_duplicated")
  }
  if (input.sourceKind === "local") {
    const requested = input.requestedPath ?? ""
    if (!requested.trim()) reasonCodes.push("skill_path_missing")
    if (requested.includes("\0")) reasonCodes.push("skill_path_null_byte")
    if (requested.split(/[\\/]+/).includes("..")) reasonCodes.push("skill_path_traversal")
    if (input.canonicalPath && input.allowedRoot) {
      const canonical = input.canonicalPath.replaceAll("\\", "/").replace(/\/$/, "")
      const root = input.allowedRoot.replaceAll("\\", "/").replace(/\/$/, "")
      if (canonical !== root && !canonical.startsWith(`${root}/`)) reasonCodes.push("skill_path_outside_root")
    }
    if (!input.evidence?.symlinkSafe) reasonCodes.push("skill_symlink_unverified")
    if (!input.evidence?.owned) reasonCodes.push("skill_ownership_unverified")
    if (!input.evidence?.manifestTrusted) reasonCodes.push("skill_manifest_untrusted")
  }
  return { ready: reasonCodes.length === 0, reasonCodes }
}

export function adaptSetupSkillDraft(input: {
  id: string
  label: string
  description: string
  source: SkillSourceKind
  path: string
  enabled: boolean
  required: boolean
  status: string
}): {
  commandOwner: "capability.command"
  command: "skill.validate"
  draft: { displayName: string; description: string; sourceKind: SkillSourceKind; requestedPath: string; requestedEnabled: boolean }
  canPersist: false
} {
  return {
    commandOwner: "capability.command",
    command: "skill.validate",
    draft: {
      displayName: input.label,
      description: input.description,
      sourceKind: input.source,
      requestedPath: input.source === "local" ? input.path : "",
      requestedEnabled: input.enabled,
    },
    canPersist: false,
  }
}
