import { describe, expect, it } from "vitest"
import {
  resolvePromptLocaleForRequest,
} from "../packages/core/src/agent/main-agent-identity.ts"

describe("task0861 main agent prompt locale primary language boundary", () => {
  it("uses Korean when Korean is the primary language in a mixed request", () => {
    expect(resolvePromptLocaleForRequest("en", "메인 화면 capture 해줘")).toBe("ko")
  })

  it("uses English when English is the primary language in a mixed request", () => {
    expect(resolvePromptLocaleForRequest("ko", "Please ask 노비 to capture the screen")).toBe("en")
  })

  it("falls back to profile language when the request has no supported language signal", () => {
    expect(resolvePromptLocaleForRequest("ko", "12345")).toBe("ko")
    expect(resolvePromptLocaleForRequest("en", "12345")).toBe("en")
  })
})
