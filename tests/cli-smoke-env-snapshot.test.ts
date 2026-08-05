import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("CLI smoke env snapshot", () => {
  it("keeps channelSmokeCommand free of direct env reads", () => {
    const source = readFileSync(new URL("../packages/cli/src/commands/smoke.ts", import.meta.url), "utf-8")
    const commandBody = source.slice(source.indexOf("export async function channelSmokeCommand"))

    expect(source).toContain("const CHANNEL_SMOKE_LIVE_ENABLED")
    expect(commandBody).not.toContain("process.env")
  })
})
