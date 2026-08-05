import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1099 channel start requires config", () => {
  it("removes the channel start runtime config fallback and keeps callers explicit", () => {
    const channelSource = readFileSync("packages/core/src/channels/index.ts", "utf-8")
    const coreIndexSource = readFileSync("packages/core/src/runtime/bootstrap.ts", "utf-8")
    const settingsRouteSource = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")
    const channelsRouteSource = readFileSync("packages/core/src/api/routes/channels.ts", "utf-8")

    expect(channelSource).toContain("export async function startChannels(")
    expect(channelSource).toContain("): Promise<StartedChannelRecoveryRuntime>")
    expect(channelSource).not.toContain("import { getConfig } from \"../config/index.js\"")
    expect(channelSource).not.toContain("startChannels(config: KnowbeeConfig = getConfig())")

    expect(coreIndexSource).toMatch(/await activateChannelsAndRecoverPendingResponses\(\s*runtimeConfig,\s*runtimePaths,?\s*\)/u)
    expect(settingsRouteSource).toMatch(
      /await activateChannelsAndRecoverPendingResponses\(\s*cfg,\s*getApiRuntimePaths\(req\),?\s*\)/u,
    )
    expect(channelsRouteSource).toContain(
      "await activateChannelsAndRecoverPendingResponses(config, paths)",
    )
    expect(settingsRouteSource).not.toContain(
      "await activateChannelsAndRecoverPendingResponses()",
    )
    expect(channelsRouteSource).not.toContain(
      "await activateChannelsAndRecoverPendingResponses()",
    )
  })
})
