import { describe, expect, it } from "vitest"
import {
  buildOpenAICodexModelsUrl,
  parseOpenAICodexModels,
} from "../packages/core/src/auth/openai-codex-oauth.ts"

describe("OpenAI Codex OAuth model discovery", () => {
  it("builds the account model catalog URL with the required client version", () => {
    expect(
      buildOpenAICodexModelsUrl(
        "https://chatgpt.com/backend-api/codex/",
        "0.146.0-alpha.3",
      ),
    ).toBe(
      "https://chatgpt.com/backend-api/codex/models?client_version=0.146.0-alpha.3",
    )
  })

  it("extracts account-visible model slugs in server order without duplicates", () => {
    expect(
      parseOpenAICodexModels({
        models: [
          { slug: "gpt-5.6-sol", display_name: "GPT-5.6 Sol" },
          { slug: "gpt-5.6-terra" },
          { slug: "gpt-5.6-sol" },
        ],
      }),
    ).toEqual(["gpt-5.6-sol", "gpt-5.6-terra"])
  })

  it("rejects labels when the response has no executable model identifier", () => {
    expect(parseOpenAICodexModels({ models: [{ display_name: "GPT 5.6" }] })).toEqual([])
  })
})
