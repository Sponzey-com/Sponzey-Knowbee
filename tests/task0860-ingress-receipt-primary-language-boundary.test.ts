import { describe, expect, it } from "vitest"
import { buildIngressAcknowledgement } from "../packages/core/src/runs/ingress.ts"

describe("task0860 ingress receipt primary language boundary", () => {
  it("uses Korean when Korean is the primary language in a mixed request", () => {
    expect(buildIngressAcknowledgement("메인 화면 capture 해줘")).toMatchObject({
      language: "ko",
    })
  })

  it("uses English when English is the primary language in a mixed request", () => {
    expect(buildIngressAcknowledgement("Please ask 노비 to capture the screen")).toMatchObject({
      language: "en",
    })
  })

  it("keeps unknown language metadata on the English fallback text", () => {
    expect(buildIngressAcknowledgement("12345")).toMatchObject({
      language: "unknown",
    })
  })
})
