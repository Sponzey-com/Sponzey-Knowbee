import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0597 channel runtime error redaction", () => {
  it("keeps legacy and registry channel startup errors behind redaction helpers", () => {
    const legacySource = readFileSync("packages/core/src/channels/index.ts", "utf-8")
    const registrySource = readFileSync("packages/core/src/channels/registry.ts", "utf-8")

    expect(legacySource).toContain("function channelRuntimeErrorMessage(error: unknown): string")
    expect(registrySource).toContain("function channelRegistryErrorMessage(error: unknown): string")
    expect(legacySource).toContain("return redactLogText(raw)")
    expect(registrySource).toContain("return redactLogText(raw)")
    expect(legacySource).not.toMatch(/const message = err instanceof Error \? err\.message : String\(err\)/u)
    expect(registrySource).not.toMatch(/const message = error instanceof Error \? error\.message : String\(error\)/u)
  })
})
