import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  RECURSIVE_HARNESS_ADDENDUM_SENTENCES,
  auditRecursiveHarnessAddendum,
} from "../packages/core/src/contracts/recursive-harness-addendum.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { composeAgentPromptSources } from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

const promptPath = join(process.cwd(), "prompts", "prompt_improvement.md")

describe("task1382 recursive harness addendum coverage", () => {
  it("keeps every GOAL 9.18 sentence exactly once in the canonical source", () => {
    const content = readFileSync(promptPath, "utf8")

    expect(RECURSIVE_HARNESS_ADDENDUM_SENTENCES).toHaveLength(24)
    expect(auditRecursiveHarnessAddendum(content)).toEqual({
      status: "valid",
      sentenceCount: 24,
      issues: [],
    })
  })

  it.each(["knowbee", "sub_agent"] as const)(
    "loads prompt_improvement exactly once in the %s runtime bundle",
    (agentType) => {
      const registry = loadPromptSourceRegistry(process.cwd())
      const sources = composeAgentPromptSources({
        sources: registry,
        agentType,
        hasExplicitUserTraits: false,
      })
      const matching = sources.filter((source) => source.sourceId === "prompt_improvement")

      expect(matching).toHaveLength(1)
      expect(matching[0]).toMatchObject({ locale: "en", enabled: true })
      expect(auditRecursiveHarnessAddendum(matching[0]!.content).status).toBe("valid")
    },
  )

  it("rejects every missing addendum sentence", () => {
    const content = readFileSync(promptPath, "utf8")

    for (const sentence of RECURSIVE_HARNESS_ADDENDUM_SENTENCES) {
      const audit = auditRecursiveHarnessAddendum(content.replace(sentence, ""))
      expect(audit.status, sentence).toBe("invalid")
      expect(audit.issues, sentence).toContainEqual({
        code: "addendum_sentence_missing",
        sentence,
        occurrences: 0,
      })
    }
  })

  it("rejects every duplicated addendum sentence", () => {
    const content = readFileSync(promptPath, "utf8")

    for (const sentence of RECURSIVE_HARNESS_ADDENDUM_SENTENCES) {
      const audit = auditRecursiveHarnessAddendum(`${content}\n${sentence}`)
      expect(audit.status, sentence).toBe("invalid")
      expect(audit.issues, sentence).toContainEqual({
        code: "addendum_sentence_duplicate",
        sentence,
        occurrences: 2,
      })
    }
  })

  it("rejects a missing or duplicated addendum header", () => {
    const content = readFileSync(promptPath, "utf8")
    const header = "## Harness System Prompt Addendum"

    expect(auditRecursiveHarnessAddendum(content.replace(header, "")).issues)
      .toContainEqual({ code: "addendum_header_missing", occurrences: 0 })
    expect(auditRecursiveHarnessAddendum(`${content}\n${header}`).issues)
      .toContainEqual({ code: "addendum_header_duplicate", occurrences: 2 })
  })
})
