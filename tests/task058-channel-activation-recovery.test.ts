import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import type { RuntimePaths } from "../packages/core/src/config/paths.ts"
import type { KnowbeeConfig } from "../packages/core/src/config/types.ts"
import {
  activateChannelsAndRecoverPendingResponses,
  recoverPendingResponsesForChannelRuntime,
} from "../packages/core/src/runtime/channel-activation-recovery.ts"

const config = Object.freeze({}) as KnowbeeConfig
const paths = Object.freeze({}) as RuntimePaths

describe("Task 058 channel activation recovery", () => {
  it("starts channels before replaying pending responses with the returned resolver", async () => {
    const order: string[] = []
    const resolveDeliveryHandler = vi.fn()
    const startChannels = vi.fn(async () => {
      order.push("start")
      return { resolveDeliveryHandler }
    })
    const recoverPendingResponses = vi.fn(async (options) => {
      order.push("recover")
      expect(options.resolveDeliveryHandler).toBe(resolveDeliveryHandler)
      return { recovered: 2, failed: 1, skipped: 3 }
    })

    const result = await activateChannelsAndRecoverPendingResponses(config, paths, {
      startChannels,
      recoverPendingResponses,
    })

    expect(order).toEqual(["start", "recover"])
    expect(startChannels).toHaveBeenCalledWith(config, paths)
    expect(result.recovery).toEqual({ recovered: 2, failed: 1, skipped: 3 })
    expect(result.channelRuntime.resolveDeliveryHandler).toBe(resolveDeliveryHandler)
  })

  it("does not recover when channel activation fails", async () => {
    const recoverPendingResponses = vi.fn()

    await expect(
      activateChannelsAndRecoverPendingResponses(config, paths, {
        startChannels: async () => {
          throw new Error("activation failed")
        },
        recoverPendingResponses,
      }),
    ).rejects.toThrow("activation failed")
    expect(recoverPendingResponses).not.toHaveBeenCalled()
  })

  it("propagates recovery infrastructure failure instead of reporting activation success", async () => {
    await expect(
      activateChannelsAndRecoverPendingResponses(config, paths, {
        startChannels: async () => ({ resolveDeliveryHandler: vi.fn() }),
        recoverPendingResponses: async () => {
          throw new Error("recovery storage unavailable")
        },
      }),
    ).rejects.toThrow("recovery storage unavailable")
  })

  it("can replay against an explicitly started single-channel runtime", async () => {
    const resolveDeliveryHandler = vi.fn()
    const recoverPendingResponses = vi.fn(async () => ({
      recovered: 1,
      failed: 0,
      skipped: 0,
    }))

    const recovery = await recoverPendingResponsesForChannelRuntime(
      { resolveDeliveryHandler },
      { recoverPendingResponses },
    )

    expect(recoverPendingResponses).toHaveBeenCalledWith({ resolveDeliveryHandler })
    expect(recovery.recovered).toBe(1)
  })

  it("uses the shared activation boundary in bootstrap and full restart routes", () => {
    const core = readFileSync("packages/core/src/runtime/bootstrap.ts", "utf8")
    const settings = readFileSync("packages/core/src/api/routes/settings.ts", "utf8")
    const channels = readFileSync("packages/core/src/api/routes/channels.ts", "utf8")

    expect(core).toContain(
      "activateChannelsAndRecoverPendingResponses(runtimeConfig, runtimePaths)",
    )
    expect(settings).toMatch(
      /activateChannelsAndRecoverPendingResponses\(\s*cfg,\s*getApiRuntimePaths\(req\),?\s*\)/,
    )
    expect(settings).toContain("recoverPendingResponsesForChannelRuntime(")
    expect(channels).toContain("activateChannelsAndRecoverPendingResponses(config, paths)")
    expect(channels).toContain("recoverPendingResponsesForChannelRuntime(")
  })
})
