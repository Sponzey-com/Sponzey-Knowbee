import { describe, expect, it } from "vitest"
import type { ChannelCapabilityFallbackNotice as ChannelBarrelNotice } from "../packages/core/src/channels/index.ts"
import type { ChannelCapabilityFallbackNotice as CoreRootNotice } from "../packages/core/src/index.ts"

type RootAndChannelExportsMatch = ChannelBarrelNotice extends CoreRootNotice
  ? CoreRootNotice extends ChannelBarrelNotice
    ? true
    : false
  : false

describe("task0827 public notice type exports", () => {
  it("exports channel capability fallback notice through channel and core barrels", () => {
    const compatible: RootAndChannelExportsMatch = true
    expect(compatible).toBe(true)
  })
})
