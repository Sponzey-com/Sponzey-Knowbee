export type SkillCatalogKind = "instruction_skill" | "tool_bundle_skill"

export type SkillCatalogKindClassification =
  | {
      ok: true
      kind: "instruction_skill"
      resolution: "explicit" | "inferred"
      sourceRef: string
    }
  | {
      ok: true
      kind: "tool_bundle_skill"
      resolution: "explicit" | "inferred"
      toolNames: string[]
    }
  | {
      ok: false
      reasonCode:
        | "skill_kind_metadata_invalid"
        | "skill_kind_contract_conflict"
        | "skill_instruction_source_invalid"
        | "skill_tool_names_invalid"
    }

export interface SkillCatalogKindInput {
  toolNamesJson: string
  metadataJson?: string | null | undefined
}

export interface SkillCatalogReconciliationInput extends SkillCatalogKindInput {
  skillId: string
}

export type SkillCatalogReconciliationFinding =
  | {
      skillId: string
      status: "explicit"
      kind: SkillCatalogKind
      reasonCode: null
    }
  | {
      skillId: string
      status: "inferred"
      kind: SkillCatalogKind
      reasonCode: "legacy_skill_kind_inferred"
    }
  | {
      skillId: string
      status: "invalid"
      kind: null
      reasonCode: Exclude<SkillCatalogKindClassification, { ok: true }>["reasonCode"]
    }

type ParsedMetadata = { ok: true; value: Record<string, unknown> } | { ok: false }

function parseMetadata(value: string | null | undefined): ParsedMetadata {
  if (!value) return { ok: true, value: {} }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false }
    return { ok: true, value: parsed as Record<string, unknown> }
  } catch {
    return { ok: false }
  }
}

function parseToolNames(value: string): { ok: true; value: string[] } | { ok: false } {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed === null) return { ok: true, value: [] }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      return { ok: false }
    }
    return {
      ok: true,
      value: [...new Set(parsed.map((item) => item.trim()).filter(Boolean))].sort(),
    }
  } catch {
    return { ok: false }
  }
}

function instructionSource(metadata: Record<string, unknown>): string | undefined {
  if (metadata.sourceKind !== "local" || typeof metadata.canonicalPath !== "string") {
    return undefined
  }
  return metadata.canonicalPath.trim() || undefined
}

export function classifySkillCatalogKind(
  input: SkillCatalogKindInput,
): SkillCatalogKindClassification {
  const metadata = parseMetadata(input.metadataJson)
  if (!metadata.ok) return { ok: false, reasonCode: "skill_kind_metadata_invalid" }

  const configuredKind = metadata.value.skillKind
  if (
    configuredKind !== undefined &&
    configuredKind !== "instruction_skill" &&
    configuredKind !== "tool_bundle_skill"
  ) {
    return { ok: false, reasonCode: "skill_kind_metadata_invalid" }
  }

  const toolNames = parseToolNames(input.toolNamesJson)
  if (!toolNames.ok) return { ok: false, reasonCode: "skill_tool_names_invalid" }
  const sourceRef = instructionSource(metadata.value)

  if (configuredKind === "instruction_skill") {
    if (toolNames.value.length > 0) {
      return { ok: false, reasonCode: "skill_kind_contract_conflict" }
    }
    if (!sourceRef) return { ok: false, reasonCode: "skill_instruction_source_invalid" }
    return {
      ok: true,
      kind: "instruction_skill",
      resolution: "explicit",
      sourceRef,
    }
  }

  if (configuredKind === "tool_bundle_skill") {
    if (toolNames.value.length === 0 || sourceRef) {
      return { ok: false, reasonCode: "skill_kind_contract_conflict" }
    }
    return {
      ok: true,
      kind: "tool_bundle_skill",
      resolution: "explicit",
      toolNames: toolNames.value,
    }
  }

  if (toolNames.value.length > 0) {
    return {
      ok: true,
      kind: "tool_bundle_skill",
      resolution: "inferred",
      toolNames: toolNames.value,
    }
  }
  if (sourceRef) {
    return {
      ok: true,
      kind: "instruction_skill",
      resolution: "inferred",
      sourceRef,
    }
  }
  return { ok: false, reasonCode: "skill_instruction_source_invalid" }
}

export function projectSkillCatalogReconciliation(
  rows: readonly SkillCatalogReconciliationInput[],
): SkillCatalogReconciliationFinding[] {
  return rows.map((row) => {
    const skillId = row.skillId.trim()
    const classification = classifySkillCatalogKind(row)
    if (!classification.ok) {
      return {
        skillId,
        status: "invalid",
        kind: null,
        reasonCode: classification.reasonCode,
      }
    }
    if (classification.resolution === "inferred") {
      return {
        skillId,
        status: "inferred",
        kind: classification.kind,
        reasonCode: "legacy_skill_kind_inferred",
      }
    }
    return {
      skillId,
      status: "explicit",
      kind: classification.kind,
      reasonCode: null,
    }
  })
}
