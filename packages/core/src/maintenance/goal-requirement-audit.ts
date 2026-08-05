export type GoalEvidenceKind =
  | "authoritative_source"
  | "positive_test"
  | "rejection_test"
  | "contradiction"

export interface GoalRequirementEvidence {
  kind: GoalEvidenceKind
  owner: string
  assertions: string[]
  coveredScopes: string[]
  markers?: string[]
}

export interface GoalEvidenceOwnerVerification {
  complete: boolean
  diagnostics: Array<{
    code: "evidence_owner_missing" | "evidence_owner_kind_mismatch" | "evidence_marker_missing"
    requirementId: string
    owner: string
    marker: string
  }>
}

export interface GoalRequirementRecord {
  requirementId: string
  clauses: string[]
  obligation: string
  requiredScopes: string[]
  evidence: GoalRequirementEvidence[]
}

export type GoalClauseKind = "requirement" | "review_criterion" | "open_decision"

export interface GoalNormativeClause {
  clauseId: string
  section: string
  kind: GoalClauseKind
  text: string
  sourceLine: number
}

export interface GoalClauseInventory {
  complete: boolean
  clauses: GoalNormativeClause[]
  diagnostics: Array<{
    code: "clause_id_collision" | "clause_without_numbered_section"
    section: string
    sourceLines: number[]
  }>
}

export type GoalRequirementAuditStatus = "proven" | "partial" | "missing" | "contradicted"

export interface GoalRequirementAuditResult {
  complete: boolean
  counts: Record<GoalRequirementAuditStatus, number>
  requirements: Array<{
    requirementId: string
    status: GoalRequirementAuditStatus
    reasonCodes: string[]
  }>
  diagnostics: Array<{
    code: "clause_owned_multiple_times" | "clause_unowned" | "record_clause_unknown"
    clause: string
    owners: string[]
  }>
}

function hasAssertions(evidence: GoalRequirementEvidence): boolean {
  return evidence.assertions.some((assertion) => assertion.trim().length > 0)
}

function normalizedClauseText(line: string): string {
  return line
    .replace(/^\s*(?:[-*+] |\d+[.)] )/u, "")
    .replace(/\s+/gu, " ")
    .trim()
}

function stableTextHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function clauseKind(section: string): GoalClauseKind {
  if (section === "10" || section.startsWith("10.")) return "review_criterion"
  if (section === "11" || section.startsWith("11.")) return "open_decision"
  return "requirement"
}

function projectClauseKind(section: string): GoalClauseKind {
  if (section === "7" || section.startsWith("7.")) return "review_criterion"
  return "requirement"
}

function extractNormativeClauses(
  markdown: string,
  buildClauseId: (section: string, text: string) => string,
  buildClauseKind: (section: string) => GoalClauseKind,
): GoalClauseInventory {
  const clauses: GoalNormativeClause[] = []
  const diagnostics: GoalClauseInventory["diagnostics"] = []
  const sourceLinesById = new Map<string, number[]>()
  let section = ""
  let inCodeFence = false

  for (const [lineIndex, rawLine] of markdown.split(/\r?\n/u).entries()) {
    const sourceLine = lineIndex + 1
    const line = rawLine.trim()
    if (line.startsWith("```")) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence || !line) continue
    const heading = line.match(/^#{2,4}\s+(\d+(?:\.\d+)*)\b/u)
    if (heading?.[1]) {
      section = heading[1]
      continue
    }
    if (line.startsWith("#") || line.startsWith("|") || /^-{3,}$/u.test(line)) continue

    const text = normalizedClauseText(line)
    if (!text || /다음과 같다[.:]?$/u.test(text)) continue
    if (!section) {
      diagnostics.push({
        code: "clause_without_numbered_section",
        section: "",
        sourceLines: [sourceLine],
      })
      continue
    }
    const clauseId = buildClauseId(section, text)
    const existingLines = sourceLinesById.get(clauseId) ?? []
    existingLines.push(sourceLine)
    sourceLinesById.set(clauseId, existingLines)
    clauses.push({ clauseId, section, kind: buildClauseKind(section), text, sourceLine })
  }

  for (const [clauseId, sourceLines] of sourceLinesById) {
    if (sourceLines.length > 1) {
      diagnostics.push({
        code: "clause_id_collision",
        section: clauseId.split(":", 1)[0] ?? "",
        sourceLines,
      })
    }
  }
  diagnostics.sort(
    (left, right) =>
      (left.sourceLines[0] ?? 0) - (right.sourceLines[0] ?? 0) ||
      left.code.localeCompare(right.code),
  )
  return { complete: diagnostics.length === 0, clauses, diagnostics }
}

export function extractGoalNormativeClauses(markdown: string): GoalClauseInventory {
  return extractNormativeClauses(
    markdown,
    (section, text) => `${section}:${stableTextHash(text)}`,
    clauseKind,
  )
}

export function extractProjectNormativeClauses(markdown: string): GoalClauseInventory {
  return extractNormativeClauses(
    markdown,
    (_section, text) => stableTextHash(text),
    projectClauseKind,
  )
}

export function createGoalRequirementSkeleton(
  clauses: GoalNormativeClause[],
): GoalRequirementRecord[] {
  return clauses.map((clause) => ({
    requirementId: `REQ-${clause.clauseId}`,
    clauses: [clause.clauseId],
    obligation: clause.text,
    requiredScopes: [],
    evidence: [],
  }))
}

export function createProjectRequirementSkeleton(
  clauses: GoalNormativeClause[],
): GoalRequirementRecord[] {
  return clauses.map((clause) => ({
    requirementId: `PRJ-${clause.clauseId}`,
    clauses: [clause.clauseId],
    obligation: clause.text,
    requiredScopes: [],
    evidence: [],
  }))
}

function evidenceOwnerKindMatches(evidence: GoalRequirementEvidence): boolean {
  const isTestOwner =
    evidence.owner.startsWith("tests/") && /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(evidence.owner)
  if (evidence.kind === "authoritative_source") return !isTestOwner
  if (evidence.kind === "positive_test" || evidence.kind === "rejection_test") return isTestOwner
  return true
}

export function verifyGoalEvidenceOwners(input: {
  records: GoalRequirementRecord[]
  readOwner: (owner: string) => string | undefined
}): GoalEvidenceOwnerVerification {
  const diagnostics: GoalEvidenceOwnerVerification["diagnostics"] = []
  for (const record of input.records) {
    for (const evidence of record.evidence) {
      const content = input.readOwner(evidence.owner)
      if (content === undefined) {
        diagnostics.push({
          code: "evidence_owner_missing",
          requirementId: record.requirementId,
          owner: evidence.owner,
          marker: "",
        })
        continue
      }
      if (!evidenceOwnerKindMatches(evidence)) {
        diagnostics.push({
          code: "evidence_owner_kind_mismatch",
          requirementId: record.requirementId,
          owner: evidence.owner,
          marker: "",
        })
      }
      for (const marker of evidence.markers ?? []) {
        if (!content.includes(marker)) {
          diagnostics.push({
            code: "evidence_marker_missing",
            requirementId: record.requirementId,
            owner: evidence.owner,
            marker,
          })
        }
      }
    }
  }
  const codeOrder = {
    evidence_owner_kind_mismatch: 0,
    evidence_marker_missing: 1,
    evidence_owner_missing: 2,
  } as const
  diagnostics.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) ||
      codeOrder[left.code] - codeOrder[right.code] ||
      left.marker.localeCompare(right.marker),
  )
  return { complete: diagnostics.length === 0, diagnostics }
}

function auditRecord(record: GoalRequirementRecord): {
  requirementId: string
  status: GoalRequirementAuditStatus
  reasonCodes: string[]
} {
  if (
    record.evidence.some((evidence) => evidence.kind === "contradiction" && hasAssertions(evidence))
  ) {
    return {
      requirementId: record.requirementId,
      status: "contradicted",
      reasonCodes: ["contradictory_evidence_present"],
    }
  }
  if (!record.obligation.trim() || record.evidence.length === 0) {
    return {
      requirementId: record.requirementId,
      status: "missing",
      reasonCodes: [!record.obligation.trim() ? "obligation_missing" : "evidence_missing"],
    }
  }

  const reasonCodes: string[] = []
  const source = record.evidence.filter((evidence) => evidence.kind === "authoritative_source")
  const positive = record.evidence.filter((evidence) => evidence.kind === "positive_test")
  const rejection = record.evidence.filter((evidence) => evidence.kind === "rejection_test")
  if (source.length === 0) reasonCodes.push("authoritative_source_missing")
  else if (!source.some(hasAssertions)) reasonCodes.push("authoritative_source_assertion_missing")
  if (positive.length === 0) reasonCodes.push("positive_test_missing")
  else if (!positive.some(hasAssertions)) reasonCodes.push("positive_test_assertion_missing")
  if (rejection.length === 0) reasonCodes.push("rejection_test_missing")
  else if (!rejection.some(hasAssertions)) reasonCodes.push("rejection_test_assertion_missing")

  const behaviorScopes = new Set(
    [...positive, ...rejection].filter(hasAssertions).flatMap((evidence) => evidence.coveredScopes),
  )
  for (const scope of record.requiredScopes) {
    if (!behaviorScopes.has(scope)) reasonCodes.push(`scope_uncovered:${scope}`)
  }
  return {
    requirementId: record.requirementId,
    status: reasonCodes.length === 0 ? "proven" : "partial",
    reasonCodes,
  }
}

export function auditGoalRequirementMatrix(input: {
  normativeClauses: string[]
  records: GoalRequirementRecord[]
}): GoalRequirementAuditResult {
  const normativeClauses = [...new Set(input.normativeClauses)].sort()
  const normativeSet = new Set(normativeClauses)
  const ownersByClause = new Map<string, string[]>()
  for (const record of input.records) {
    for (const clause of record.clauses) {
      const owners = ownersByClause.get(clause) ?? []
      owners.push(record.requirementId)
      ownersByClause.set(clause, owners)
    }
  }

  const diagnostics: GoalRequirementAuditResult["diagnostics"] = []
  for (const clause of normativeClauses) {
    const owners = [...new Set(ownersByClause.get(clause) ?? [])].sort()
    if (owners.length === 0) diagnostics.push({ code: "clause_unowned", clause, owners })
    else if (owners.length > 1)
      diagnostics.push({ code: "clause_owned_multiple_times", clause, owners })
  }
  for (const [clause, rawOwners] of ownersByClause) {
    if (!normativeSet.has(clause)) {
      diagnostics.push({
        code: "record_clause_unknown",
        clause,
        owners: [...new Set(rawOwners)].sort(),
      })
    }
  }
  diagnostics.sort(
    (left, right) => left.clause.localeCompare(right.clause) || left.code.localeCompare(right.code),
  )

  const requirements = input.records
    .map(auditRecord)
    .sort((left, right) => left.requirementId.localeCompare(right.requirementId))
  const counts: Record<GoalRequirementAuditStatus, number> = {
    proven: 0,
    partial: 0,
    missing: 0,
    contradicted: 0,
  }
  for (const requirement of requirements) counts[requirement.status] += 1
  return {
    complete:
      diagnostics.length === 0 &&
      requirements.every((requirement) => requirement.status === "proven"),
    counts,
    requirements,
    diagnostics,
  }
}
