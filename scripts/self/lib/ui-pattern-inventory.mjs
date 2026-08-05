const SANCTIONED_STATUS_PRIMITIVES = new Set([
  "components/ui/StatusLabel.tsx",
  "components/ui/InlineNotice.tsx",
])

function finding(path, line, kind, replacement) {
  return { path, line, kind, replacement }
}

export function analyzeUiSourcePatterns(input) {
  const findings = []
  const lines = input.source.split(/\r?\n/)
  lines.forEach((source, index) => {
    const line = index + 1
    if (/rounded-(?:2xl|3xl|\[(?:1\.|2|3)[^\]]*\])/.test(source)) {
      findings.push(finding(input.path, line, "radius_exceeds_contract", "surface-radius token"))
    }
    if (/<button\b(?![^>]*(?:aria-label|title)=)[^>]*>\s*<(?:svg|span)\b[^>]*aria-hidden/.test(source)) {
      findings.push(finding(input.path, line, "icon_button_name_missing", "IconButton"))
    }
    if (!SANCTIONED_STATUS_PRIMITIVES.has(input.path) && /(?:bg|text|border)-(?:red|amber|emerald|sky)-(?:50|100|200|700|800|900|950)/.test(source)) {
      findings.push(finding(input.path, line, "raw_status_style", "StatusLabel or InlineNotice"))
    }
  })
  return findings
}

export function validatePatternDebt(input) {
  const counts = new Map()
  for (const item of input.findings) {
    const key = `${item.path}:${item.kind}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const diagnostics = []
  for (const [key, actual] of [...counts.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const baseline = input.baselineCounts[key] ?? 0
    if (actual <= baseline) continue
    const separator = key.lastIndexOf(":")
    diagnostics.push({
      path: key.slice(0, separator),
      kind: key.slice(separator + 1),
      reasonCode: "pattern_debt_increased",
      actual,
      baseline,
    })
  }
  return { ok: diagnostics.length === 0, diagnostics }
}

export function evaluateUiFoundationEntry(evidence) {
  const blockers = []
  if (evidence.tokens !== "verified") blockers.push("ui_tokens_missing")
  if (evidence.primitives !== "verified") blockers.push("ui_primitives_missing")
  if (evidence.focus !== "verified") blockers.push("ui_focus_contract_missing")
  if (evidence.mobileTargets !== "verified") blockers.push("ui_mobile_target_contract_missing")
  if (evidence.build !== "verified") blockers.push("ui_build_evidence_missing")
  const followUpReasonCodes = evidence.migrationDebt > 0 ? ["ui_pattern_migration_required"] : []
  return { allowed: blockers.length === 0, blockers, followUpReasonCodes }
}
