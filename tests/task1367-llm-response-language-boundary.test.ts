import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  MULTILINGUAL_RESPONSE_EXCEPTION_KINDS,
  authorizeLlmResponseLanguages,
  renderAuthorizedResponseLanguages,
  type LlmOutputLanguageReceipt,
  type LlmPrimaryLanguageReceipt,
  type ResponseLanguageRequestReceipt,
} from "../packages/core/src/contracts/llm-response-language-boundary.ts"

const diagnosis: LlmPrimaryLanguageReceipt = {
  diagnosedBy: "llm",
  primaryLanguage: "ko",
  observedLanguages: ["ko", "en"],
  evidenceRef: "diagnosis:language:1367",
}

const request: ResponseLanguageRequestReceipt = {
  mode: "single_language",
  explicitRequest: false,
  requestedLanguages: ["ko"],
  evidenceRef: "request:language:1367",
}

const output: LlmOutputLanguageReceipt = {
  diagnosedBy: "llm",
  outputLanguages: ["ko"],
  evidenceRef: "output:language:1367",
}

describe("task1367 LLM response language boundary", () => {
  it.each(["ko", "en", "ja"])("answers a mixed-language request only in its LLM-diagnosed primary language %s", async (primaryLanguage) => {
    const render = vi.fn(async () => primaryLanguage)
    const decision = authorizeLlmResponseLanguages({
      diagnosis: { ...diagnosis, primaryLanguage, observedLanguages: [primaryLanguage, "fr"] },
      request: { ...request, requestedLanguages: [primaryLanguage] },
      output: { ...output, outputLanguages: [primaryLanguage] },
    })
    await expect(renderAuthorizedResponseLanguages({ decision, render })).resolves.toEqual({ status: "rendered", result: primaryLanguage })
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ allowedLanguages: [primaryLanguage] }))
  })

  it("rejects non-LLM, incomplete, and inconsistent primary-language diagnoses", () => {
    expect(authorizeLlmResponseLanguages({ diagnosis: { ...diagnosis, diagnosedBy: "heuristic" as never }, request, output }))
      .toEqual({ status: "blocked", reasonCode: "language_diagnosis_invalid" })
    expect(authorizeLlmResponseLanguages({ diagnosis: { ...diagnosis, evidenceRef: "" }, request, output }))
      .toEqual({ status: "blocked", reasonCode: "language_diagnosis_invalid" })
    expect(authorizeLlmResponseLanguages({ diagnosis: { ...diagnosis, observedLanguages: ["en"] }, request, output }))
      .toEqual({ status: "blocked", reasonCode: "language_diagnosis_invalid" })
  })

  it("blocks additional output languages for an ordinary mixed-language request", async () => {
    const render = vi.fn()
    const decision = authorizeLlmResponseLanguages({ ...{ diagnosis, request }, output: { ...output, outputLanguages: ["ko", "en"] } })
    expect(decision).toEqual({ status: "blocked", reasonCode: "single_language_mismatch" })
    await renderAuthorizedResponseLanguages({ decision, render })
    expect(render).not.toHaveBeenCalled()
  })

  it.each(MULTILINGUAL_RESPONSE_EXCEPTION_KINDS)("allows requested languages for an explicit %s request", (mode) => {
    expect(authorizeLlmResponseLanguages({
      diagnosis,
      request: { ...request, mode, explicitRequest: true, requestedLanguages: ["ko", "en"] },
      output: { ...output, outputLanguages: ["en", "ko"] },
    })).toMatchObject({ status: "authorized", mode, allowedLanguages: ["ko", "en"] })
  })

  it.each(MULTILINGUAL_RESPONSE_EXCEPTION_KINDS)("blocks a non-explicit %s exception before rendering", async (mode) => {
    const render = vi.fn()
    const decision = authorizeLlmResponseLanguages({
      diagnosis,
      request: { ...request, mode, explicitRequest: false, requestedLanguages: ["ko", "en"] },
      output,
    })
    expect(decision).toEqual({ status: "blocked", reasonCode: "language_exception_not_explicit" })
    await renderAuthorizedResponseLanguages({ decision, render })
    expect(render).not.toHaveBeenCalled()
  })

  it("blocks empty requested languages and an unrequested output language", () => {
    expect(authorizeLlmResponseLanguages({ diagnosis, request: { ...request, mode: "translation", explicitRequest: true, requestedLanguages: [] }, output }))
      .toEqual({ status: "blocked", reasonCode: "language_request_invalid" })
    expect(authorizeLlmResponseLanguages({
      diagnosis,
      request: { ...request, mode: "translation", explicitRequest: true, requestedLanguages: ["ko", "en"] },
      output: { ...output, outputLanguages: ["ja"] },
    })).toEqual({ status: "blocked", reasonCode: "unrequested_output_language" })
  })

  it("uses only injected LLM diagnosis and request receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/llm-response-language-boundary.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/detectPrimaryMessageLanguage|process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
