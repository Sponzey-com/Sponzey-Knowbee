export type PromptSourceQualityIssueCode =
  | "ambiguous_wording"
  | "line_too_long"
  | "duplicate_rule_line"

export interface PromptSourceQualityIssue {
  code: PromptSourceQualityIssueCode
  line: number
  detail: string
}

export interface PromptSourceQualityResult {
  ok: boolean
  issues: PromptSourceQualityIssue[]
}

const MAX_READABLE_LINE_LENGTH = 300
const AMBIGUOUS_PHRASES = [
  "appropriately",
  "as needed",
  "improve later",
  "if possible",
  "well",
  "enough",
  "automatically decide",
] as const
const PROMPT_IMPROVEMENT_REJECTION_EXAMPLE =
  '- Reject a diff that introduces unverifiable wording such as "appropriately", "as needed", "improve later", "if possible", "well", "enough", or "automatically decide".'

function normalizedRuleLine(line: string): string | undefined {
  const trimmed = line.trim()
  if (!/^[-*]\s+\S/u.test(trimmed)) return undefined
  return trimmed.replace(/^[-*]\s+/u, "").replace(/\s+/gu, " ").toLowerCase()
}

export function validatePromptSourceContentQuality(input: {
  sourceId: string
  content: string
}): PromptSourceQualityResult {
  const issues: PromptSourceQualityIssue[] = []
  const firstRuleLine = new Map<string, number>()

  input.content.split(/\r?\n/u).forEach((line, index) => {
    const lineNumber = index + 1
    if (line.length > MAX_READABLE_LINE_LENGTH) {
      issues.push({ code: "line_too_long", line: lineNumber, detail: `length=${line.length}` })
    }

    const isCanonicalRejectionExample =
      input.sourceId === "prompt_improvement" && line === PROMPT_IMPROVEMENT_REJECTION_EXAMPLE
    if (!isCanonicalRejectionExample) {
      const lower = line.toLowerCase()
      for (const phrase of AMBIGUOUS_PHRASES) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
        if (new RegExp(`\\b${escaped}\\b`, "iu").test(lower)) {
          issues.push({ code: "ambiguous_wording", line: lineNumber, detail: phrase })
        }
      }
    }

    const rule = normalizedRuleLine(line)
    if (!rule) return
    const previousLine = firstRuleLine.get(rule)
    if (previousLine !== undefined) {
      issues.push({
        code: "duplicate_rule_line",
        line: lineNumber,
        detail: `duplicates line ${previousLine}`,
      })
      return
    }
    firstRuleLine.set(rule, lineNumber)
  })

  return { ok: issues.length === 0, issues }
}

export class PromptSourceContentQualityError extends Error {
  constructor(readonly issues: PromptSourceQualityIssue[]) {
    super(`prompt source quality validation failed: ${issues.map((issue) => issue.code).join(", ")}`)
    this.name = "PromptSourceContentQualityError"
  }
}
