import type { CapabilityRiskLevel } from "../contracts/sub-agent-orchestration.js"

export interface SkillCatalogRow {
  skill_id: string
  status: "enabled" | "disabled" | "archived"
  display_name: string
  risk?: CapabilityRiskLevel | null
  metadata_json: string | null
  updated_at: number
}

export interface SkillBindingRow {
  catalog_id: string
  status: "enabled" | "disabled" | "archived"
  updated_at?: number
}

export interface SkillCatalogQuery {
  limit?: number
  cursor?: string
  search?: string
  sourceKind?: "builtin" | "local"
  runtimeStatus?: "active" | "inactive"
  boundOnly?: boolean
}

const SKILL_PUBLIC_REF_PATTERN = /^skill_v1_[a-f0-9]{24}$/

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function cursorOffset(cursor: string | undefined): number {
  if (!cursor) return 0
  const match = /^v1:(\d+)$/.exec(cursor)
  if (!match) throw new Error("skill_catalog_cursor_invalid")
  return Number(match[1])
}

export function buildSkillCatalogPage(input: {
  rows: readonly SkillCatalogRow[]
  bindings: readonly SkillBindingRow[]
  query: SkillCatalogQuery
  observedAt: number
  publicRefForSkillId: (skillId: string) => string
}) {
  const limit = input.query.limit ?? 50
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("skill_catalog_limit_invalid")
  }
  const offset = cursorOffset(input.query.cursor)
  const bindingCounts = new Map<string, number>()
  const bindingRevisions = new Map<string, number>()
  for (const binding of input.bindings) {
    bindingRevisions.set(binding.catalog_id, Math.max(bindingRevisions.get(binding.catalog_id) ?? 0, binding.updated_at ?? 0))
    if (binding.status !== "enabled") continue
    bindingCounts.set(binding.catalog_id, (bindingCounts.get(binding.catalog_id) ?? 0) + 1)
  }
  const search = input.query.search?.trim().toLocaleLowerCase() ?? ""
  const publicRefOwners = new Map<string, string>()
  const projected = [...input.rows]
    .filter((row) => row.status !== "archived")
    .sort((left, right) => left.display_name.localeCompare(right.display_name) || left.skill_id.localeCompare(right.skill_id))
    .map((row) => {
      const metadata = parseMetadata(row.metadata_json)
      const skillRef = input.publicRefForSkillId(row.skill_id)
      if (!SKILL_PUBLIC_REF_PATTERN.test(skillRef)) throw new Error("skill_public_ref_invalid")
      const owner = publicRefOwners.get(skillRef)
      if (owner && owner !== row.skill_id) throw new Error("skill_public_ref_collision")
      publicRefOwners.set(skillRef, row.skill_id)
      const sourceKind = metadata.builtin === true || metadata.sourceKind === "builtin"
        ? "builtin" as const
        : "local" as const
      return {
        skillRef,
        displayName: row.display_name,
        description: typeof metadata.description === "string" ? metadata.description : "",
        sourceKind,
        ...(row.risk ? { risk: row.risk } : {}),
        validationStatus: "valid" as const,
        runtimeStatus: row.status === "enabled" ? "active" as const : "inactive" as const,
        bindingCount: bindingCounts.get(row.skill_id) ?? 0,
        revision: Math.max(row.updated_at, bindingRevisions.get(row.skill_id) ?? 0),
      }
    })
    .filter((item) => !search || `${item.displayName} ${item.description}`.toLocaleLowerCase().includes(search))
    .filter((item) => !input.query.sourceKind || item.sourceKind === input.query.sourceKind)
    .filter((item) => !input.query.runtimeStatus || item.runtimeStatus === input.query.runtimeStatus)
    .filter((item) => !input.query.boundOnly || item.bindingCount > 0)
  const items = projected.slice(offset, offset + limit)
  const end = offset + items.length
  return {
    items,
    nextCursor: end < projected.length ? `v1:${end}` : null,
    revision: projected.reduce((latest, item) => Math.max(latest, item.revision), 0),
    observedAt: input.observedAt,
  }
}
