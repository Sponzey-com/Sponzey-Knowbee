import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildCodexOAuthFallbackPrompt } from "../packages/core/src/ai/providers/openai.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { loadPromptValue } from "../packages/core/src/memory/prompt-fragments.ts"

const SOURCE_ID = "codex_oauth_fallback_prompt_labels_user"
const repoRoot = process.cwd()

describe("task0977 Codex OAuth fallback prompt labels", () => {
  it("registers Codex OAuth fallback labels as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot)
      .find((item) => item.sourceId === SOURCE_ID && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: SOURCE_ID,
      required: false,
      usageScope: "internal",
      enabled: true,
    })

    const value = loadPromptValue(SOURCE_ID, {}, { required: true })
    expect(value).toContain("user_label=User")
    expect(value).toContain("assistant_label=Assistant")
    expect(value).toContain("tool_result_prefix=[tool result]")
    expect(value).toContain("default_prompt=Continue the conversation.")
  })

  it("renders fallback transcripts from the prompt-owned labels", () => {
    expect(buildCodexOAuthFallbackPrompt([])).toBe("Continue the conversation.")

    const prompt = buildCodexOAuthFallbackPrompt([
      {
        role: "assistant",
        content: [
          { type: "text", text: "checking" },
          { type: "tool_use", id: "call_1", name: "search", input: { q: "weather" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "done" },
        ],
      },
    ])

    expect(prompt).toContain("Assistant: checking")
    expect(prompt).toContain("[tool request] search {\"q\":\"weather\"}")
    expect(prompt).toContain("User: [tool result] done")
  })

  it("keeps fallback prompt wording out of the OpenAI provider adapter", () => {
    const providerSource = readFileSync(join(repoRoot, "packages/core/src/ai/providers/openai.ts"), "utf8")
    const promptSource = readFileSync(join(repoRoot, "prompts/codex_oauth_fallback_prompt_labels_user.md"), "utf8")

    expect(promptSource).toContain("Continue the conversation.")
    expect(providerSource).not.toContain('"Continue the conversation."')
    expect(providerSource).not.toContain("'Continue the conversation.'")
    expect(providerSource).not.toContain("'[tool request] '")
    expect(providerSource).not.toContain("'[tool result] '")
    expect(providerSource).not.toContain('? "Assistant" : "User"')
  })
})
