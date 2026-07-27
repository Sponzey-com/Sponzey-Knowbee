export const SYSTEM_PROMPT_SEGMENT_KINDS = [
  "heading",
  "instruction",
  "product_name_literal",
  "user_input_example_literal",
] as const

export type SystemPromptSegmentKind = typeof SYSTEM_PROMPT_SEGMENT_KINDS[number]

export interface SystemPromptSourceSegment {
  segmentId: string
  kind: SystemPromptSegmentKind
  content: string
  fingerprint: string
  literalPurpose?: "korean_product_name" | "korean_user_input_example"
  surroundingInstructionSegmentId?: string
}

export interface SystemPromptLanguageSource {
  sourceId: string
  sourceClassification: "system_prompt" | "user_data" | "runtime_evidence"
  version: string
  expectedChecksum: string
  actualChecksum: string
  segments: SystemPromptSourceSegment[]
}

export type SystemPromptLanguageDecision =
  | { status: "eligible"; sourceId: string; version: string; checksum: string }
  | { status: "not_applicable"; sourceId: string }
  | { status: "blocked"; reasonCode:
      | "checksum_mismatch"
      | "segment_missing"
      | "segment_duplicate"
      | "segment_unclassified"
      | "instruction_empty"
      | "korean_instruction"
      | "non_english_instruction"
      | "literal_purpose_invalid"
      | "literal_binding_invalid"
      | "product_name_literal_invalid" }

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u
const NON_ASCII_INSTRUCTION = /[^\x09\x0a\x0d\x20-\x7e]/u

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

export function validateSystemPromptLanguageSource(source: SystemPromptLanguageSource): SystemPromptLanguageDecision {
  const sourceId = required(source.sourceId, "Prompt source ID")
  if (source.sourceClassification !== "system_prompt") return { status: "not_applicable", sourceId }
  const version = required(source.version, "Prompt source version")
  const expectedChecksum = required(source.expectedChecksum, "Expected prompt source checksum")
  const actualChecksum = required(source.actualChecksum, "Actual prompt source checksum")
  if (expectedChecksum !== actualChecksum) return { status: "blocked", reasonCode: "checksum_mismatch" }
  if (source.segments.length === 0) return { status: "blocked", reasonCode: "segment_missing" }

  const ids = new Set<string>()
  for (const segment of source.segments) {
    const segmentId = required(segment.segmentId, "Prompt segment ID")
    required(segment.fingerprint, "Prompt segment fingerprint")
    if (ids.has(segmentId)) return { status: "blocked", reasonCode: "segment_duplicate" }
    ids.add(segmentId)
    if (!SYSTEM_PROMPT_SEGMENT_KINDS.includes(segment.kind)) return { status: "blocked", reasonCode: "segment_unclassified" }
    if ((segment.kind === "heading" || segment.kind === "instruction") && !segment.content.trim()) {
      return { status: "blocked", reasonCode: "instruction_empty" }
    }
    if ((segment.kind === "heading" || segment.kind === "instruction") && HANGUL.test(segment.content)) {
      return { status: "blocked", reasonCode: "korean_instruction" }
    }
    if ((segment.kind === "heading" || segment.kind === "instruction") && NON_ASCII_INSTRUCTION.test(segment.content)) {
      return { status: "blocked", reasonCode: "non_english_instruction" }
    }
  }

  for (const segment of source.segments) {
    if (segment.kind !== "product_name_literal" && segment.kind !== "user_input_example_literal") continue
    const expectedPurpose = segment.kind === "product_name_literal" ? "korean_product_name" : "korean_user_input_example"
    if (segment.literalPurpose !== expectedPurpose) return { status: "blocked", reasonCode: "literal_purpose_invalid" }
    const surroundingId = segment.surroundingInstructionSegmentId?.trim()
    const surrounding = surroundingId ? source.segments.find((candidate) => candidate.segmentId === surroundingId) : undefined
    if (!surrounding || surrounding.kind !== "instruction") return { status: "blocked", reasonCode: "literal_binding_invalid" }
    if (segment.kind === "product_name_literal" && segment.content.trim() !== "노비") {
      return { status: "blocked", reasonCode: "product_name_literal_invalid" }
    }
    if (!segment.content.trim()) return { status: "blocked", reasonCode: "literal_purpose_invalid" }
  }
  return { status: "eligible", sourceId, version, checksum: actualChecksum }
}

export async function registerLanguageEligibleSystemPrompt<T>(input: {
  decision: SystemPromptLanguageDecision
  register: (decision: Extract<SystemPromptLanguageDecision, { status: "eligible" }>) => Promise<T>
}): Promise<{ status: "registered"; result: T } | Exclude<SystemPromptLanguageDecision, { status: "eligible" }>> {
  if (input.decision.status !== "eligible") return input.decision
  return { status: "registered", result: await input.register(input.decision) }
}
