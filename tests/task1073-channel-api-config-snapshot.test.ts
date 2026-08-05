import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1073 channel API config snapshot", () => {
  it("threads route config snapshots through channel lookup and detail helpers", () => {
    const source = readFileSync("packages/core/src/api/routes/channels.ts", "utf-8")

    expect(source).toContain("function listConnections(config: KnowbeeConfig)")
    expect(source).toContain("config,")
    expect(source).toContain("buildKnownFutureConnection(connectionId, Date.now(), config)")
    expect(source).toContain("function buildKnownFutureConnection(channelId: string, now: number, config: KnowbeeConfig)")
    expect(source).toContain("function getPlaceholderConnection(channelId: string, config: KnowbeeConfig)")
    expect(source).toContain("buildKnownFutureConnection(channelId, now, config)")
    expect(source).toContain("function findConnection(channelId: string, config: KnowbeeConfig)")
    expect(source).toContain("function requireConnection(channelId: string, config: KnowbeeConfig)")
    expect(source).toContain("const channels = listConnections(config).map((connection) => channelSummary(connection, config))")
    expect(source).toContain("const connection = findConnection(req.params.channelId, config)")
    expect(source).toContain("return { channel: channelDetail(connection, config) }")
    expect(source).toContain("validation: connectionValidation(connection, config)")
    expect(source).not.toContain("channelDetail(connection, getConfig())")
    expect(source).not.toContain("connectionValidation(connection, getConfig())")
  })
})
