import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  createOpenAICodexOAuthEnvironmentSnapshot,
  resolveOpenAICodexAuthFilePath,
} from "../packages/core/src/auth/openai-codex-oauth.ts"

describe("OpenAI Codex OAuth env snapshot", () => {
  it("keeps CODEX_HOME fixed in an explicit snapshot and allows explicit config override", () => {
    const env: Record<string, string | undefined> = { CODEX_HOME: "/tmp/knowbee-codex-home-a" }
    const snapshot = createOpenAICodexOAuthEnvironmentSnapshot(env)

    expect(resolveOpenAICodexAuthFilePath(undefined, snapshot)).toBe(join("/tmp/knowbee-codex-home-a", "auth.json"))

    env.CODEX_HOME = "/tmp/knowbee-codex-home-b"
    expect(resolveOpenAICodexAuthFilePath(undefined, snapshot)).toBe(join("/tmp/knowbee-codex-home-a", "auth.json"))
    expect(resolveOpenAICodexAuthFilePath({ codexHome: "/tmp/knowbee-codex-home-c" }, snapshot))
      .toBe(join("/tmp/knowbee-codex-home-c", "auth.json"))
  })

  it("keeps path and client id resolution free of direct env reads", () => {
    const source = readFileSync(new URL("../packages/core/src/auth/openai-codex-oauth.ts", import.meta.url), "utf-8")
    const pathBody = source.slice(
      source.indexOf("export function resolveOpenAICodexAuthFilePath"),
      source.indexOf("export function hasOpenAICodexAuthFile"),
    )
    const clientIdBody = source.slice(
      source.indexOf("function inferClientId"),
      source.indexOf("function readCodexAuthFile"),
    )

    expect(source).toContain("const OPENAI_CODEX_OAUTH_ENV")
    expect(pathBody).not.toContain("process.env")
    expect(clientIdBody).not.toContain("process.env")
  })
})
