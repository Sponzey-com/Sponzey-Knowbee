import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const chatPageSource = readFileSync("packages/webui/src/pages/ChatPage.tsx", "utf8")

describe("task0367 chat session id redaction", () => {
  it("does not render internal session id slices in the chat header", () => {
    expect(chatPageSource).not.toContain("sessionId.slice")
    expect(chatPageSource).not.toContain("font-mono")
    expect(chatPageSource).toContain("대화 연결됨")
  })
})
