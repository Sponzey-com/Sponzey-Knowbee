import { describe, expect, it } from "vitest"
import {
  buildNodeDefinitionLlmNotConfiguredResult,
} from "../packages/core/src/topology/node-definition-suggestion.ts"

describe("task0797 topology LLM not configured notice", () => {
  it("builds the shared no-LLM result with control notice provenance", () => {
    expect(buildNodeDefinitionLlmNotConfiguredResult()).toEqual({
      ok: false,
      error: "llm_not_configured",
      message: "등록된 LLM이 없습니다. 설정에서 기본 모델을 등록한 뒤 다시 시도하세요.",
      warnings: [{ code: "llm_not_configured", message: "등록된 LLM이 없습니다." }],
      notice: {
        kind: "topology_llm_not_configured",
        textSource: "topology_control_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
      },
    })
  })
})
