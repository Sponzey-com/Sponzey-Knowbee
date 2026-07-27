import { describe, expect, it, vi } from "vitest"
import type {
  ChannelSmokeScenario,
  ChannelSmokeTrace,
} from "../packages/core/src/channels/smoke-runner.ts"
import { createAvailableChannelSmokeLiveExecutor } from "../packages/core/src/api/server.ts"

const scenario = (channel: "webui" | "telegram" | "slack"): ChannelSmokeScenario => ({
  id: `task191-${channel}`,
  channel,
  kind: "basic_query",
  name: `${channel} live smoke`,
  request: "Reply with the requested smoke acknowledgement.",
  expected: {
    receipt: true,
    finalResponse: true,
    channelDelivery: true,
  },
})

const trace = (channel: "webui" | "telegram" | "slack"): ChannelSmokeTrace => ({
  sourceChannel: channel,
  receipt: true,
  finalResponse: true,
  channelDelivery: true,
})

describe("Task 191 partial channel live smoke composition", () => {
  it("executes an available Telegram smoke without requiring Slack", async () => {
    const telegram = vi.fn(async () => trace("telegram"))
    const executor = createAvailableChannelSmokeLiveExecutor({ telegram })

    await expect(executor?.(scenario("telegram"))).resolves.toEqual(trace("telegram"))
    expect(telegram).toHaveBeenCalledOnce()
  })

  it("fails only the requested unavailable channel", async () => {
    const executor = createAvailableChannelSmokeLiveExecutor({
      telegram: vi.fn(async () => trace("telegram")),
    })

    await expect(executor?.(scenario("slack"))).rejects.toThrow(
      "channel_live_smoke_executor_unavailable:slack",
    )
  })

  it("does not expose a live executor when no channel is available", () => {
    expect(createAvailableChannelSmokeLiveExecutor({})).toBeUndefined()
  })
})
