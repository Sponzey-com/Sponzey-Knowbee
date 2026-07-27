import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  registerLanguageEligibleSystemPrompt,
  validateSystemPromptLanguageSource,
  type SystemPromptLanguageSource,
  type SystemPromptSourceSegment,
} from "../packages/core/src/index.ts"

const instruction: SystemPromptSourceSegment = {
  segmentId: "instruction:identity", kind: "instruction", content: "Use the configured agent name when answering.", fingerprint: "sha:instruction",
}

function source(overrides: Partial<SystemPromptLanguageSource> = {}): SystemPromptLanguageSource {
  return {
    sourceId: "identity", sourceClassification: "system_prompt", version: "v2",
    expectedChecksum: "sha:source", actualChecksum: "sha:source",
    segments: [{ segmentId: "heading:purpose", kind: "heading", content: "Purpose", fingerprint: "sha:heading" }, instruction],
    ...overrides,
  }
}

describe("task1236 system prompt language boundary", () => {
  it("accepts structured English headings and instructions", () => {
    expect(validateSystemPromptLanguageSource(source())).toEqual({
      status: "eligible", sourceId: "identity", version: "v2", checksum: "sha:source",
    })
  })

  it.each([
    ["heading", "목적"],
    ["instruction", "사용자에게 설정된 이름으로 답한다."],
    ["instruction", "Always answer as 노비."],
  ] as const)("rejects Korean %s text", (kind, content) => {
    expect(validateSystemPromptLanguageSource(source({
      segments: [{ segmentId: "segment:bad", kind, content, fingerprint: "sha:bad" }],
    }))).toEqual({ status: "blocked", reasonCode: "korean_instruction" })
  })

  it.each([
    "設定されたエージェント名を使用してください。",
    "Используйте настроенное имя агента.",
    "استخدم اسم الوكيل المكوّن.",
  ])("rejects non-English operating instruction %s", (content) => {
    expect(validateSystemPromptLanguageSource(source({
      segments: [{ segmentId: "segment:non-english", kind: "instruction", content, fingerprint: "sha:non-english" }],
    }))).toEqual({ status: "blocked", reasonCode: "non_english_instruction" })
  })

  it("allows the Korean product name only as a bound product-name literal", () => {
    expect(validateSystemPromptLanguageSource(source({ segments: [instruction, {
      segmentId: "literal:product", kind: "product_name_literal", content: "노비", fingerprint: "sha:nobie",
      literalPurpose: "korean_product_name", surroundingInstructionSegmentId: instruction.segmentId,
    }] }))).toMatchObject({ status: "eligible" })
    expect(validateSystemPromptLanguageSource(source({ segments: [instruction, {
      segmentId: "literal:product", kind: "product_name_literal", content: "노우비", fingerprint: "sha:wrong",
      literalPurpose: "korean_product_name", surroundingInstructionSegmentId: instruction.segmentId,
    }] }))).toEqual({ status: "blocked", reasonCode: "product_name_literal_invalid" })
  })

  it("allows Korean user input only as a purpose-bound example literal", () => {
    expect(validateSystemPromptLanguageSource(source({ segments: [instruction, {
      segmentId: "literal:example", kind: "user_input_example_literal", content: "깊게 봐줘", fingerprint: "sha:example",
      literalPurpose: "korean_user_input_example", surroundingInstructionSegmentId: instruction.segmentId,
    }] }))).toMatchObject({ status: "eligible" })
  })

  it.each([
    [{ literalPurpose: undefined }, "literal_purpose_invalid"],
    [{ literalPurpose: "korean_product_name" }, "literal_purpose_invalid"],
    [{ surroundingInstructionSegmentId: "instruction:missing" }, "literal_binding_invalid"],
  ] as const)("rejects unclassified or unbound Korean examples %o", (change, reasonCode) => {
    expect(validateSystemPromptLanguageSource(source({ segments: [instruction, {
      segmentId: "literal:example", kind: "user_input_example_literal", content: "깊게 봐줘", fingerprint: "sha:example",
      literalPurpose: "korean_user_input_example", surroundingInstructionSegmentId: instruction.segmentId, ...change,
    }] }))).toEqual({ status: "blocked", reasonCode })
  })

  it("rejects empty, duplicate, unclassified, and checksum-invalid sources", () => {
    expect(validateSystemPromptLanguageSource(source({ segments: [] }))).toEqual({ status: "blocked", reasonCode: "segment_missing" })
    expect(validateSystemPromptLanguageSource(source({ segments: [instruction, instruction] }))).toEqual({ status: "blocked", reasonCode: "segment_duplicate" })
    expect(validateSystemPromptLanguageSource(source({ segments: [{ ...instruction, kind: "raw" as never }] }))).toEqual({ status: "blocked", reasonCode: "segment_unclassified" })
    expect(validateSystemPromptLanguageSource(source({ actualChecksum: "sha:other" }))).toEqual({ status: "blocked", reasonCode: "checksum_mismatch" })
  })

  it("does not treat user data or runtime evidence as system instructions", () => {
    expect(validateSystemPromptLanguageSource(source({ sourceClassification: "user_data", segments: [] }))).toEqual({ status: "not_applicable", sourceId: "identity" })
    expect(validateSystemPromptLanguageSource(source({ sourceClassification: "runtime_evidence", segments: [] }))).toEqual({ status: "not_applicable", sourceId: "identity" })
  })

  it("never registers a blocked source", async () => {
    const register = vi.fn(async () => "saved")
    await expect(registerLanguageEligibleSystemPrompt({
      decision: validateSystemPromptLanguageSource(source({ segments: [{ ...instruction, content: "한국어 지시" }] })), register,
    })).resolves.toEqual({ status: "blocked", reasonCode: "korean_instruction" })
    expect(register).not.toHaveBeenCalled()
    await expect(registerLanguageEligibleSystemPrompt({ decision: validateSystemPromptLanguageSource(source()), register })).resolves.toEqual({ status: "registered", result: "saved" })
    expect(register).toHaveBeenCalledTimes(1)
  })

  it("keeps language policy independent from external systems", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/system-prompt-language-boundary.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
