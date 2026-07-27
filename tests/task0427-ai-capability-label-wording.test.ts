import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "setup", "BackendHealthCard.tsx"), "utf-8")

describe("task0427 AI capability label wording", () => {
  it("uses Korean labels for AI connection capability rows", () => {
    expect(source).not.toContain('text("Chat", "Chat")')
    expect(source).not.toContain('text("Responses", "Responses")')
    expect(source).not.toContain('text("Embedding", "Embedding")')
    expect(source).not.toContain('text("Auth refresh", "Auth refresh")')
    expect(source).not.toContain('text("Context", "Context")')

    expect(source).toContain('text("대화", "Chat")')
    expect(source).toContain('text("응답 처리", "Responses")')
    expect(source).toContain('text("임베딩", "Embedding")')
    expect(source).toContain('text("인증 갱신", "Auth refresh")')
    expect(source).toContain('text("문맥 길이", "Context")')
  })
})
