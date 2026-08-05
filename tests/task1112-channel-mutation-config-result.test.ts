import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentTexts,
  functionParameterTypes,
  interfacePropertyTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1112 channel mutation config result", () => {
  it("uses the config snapshot returned by channel config mutations for response projection", () => {
    const source = readFileSync("packages/core/src/api/routes/channels.ts", "utf-8")

    expect(legacyConfigAccesses(source)).toEqual([])
    expect(interfacePropertyTypes(source, "ChannelConfigMutationResult")).toEqual({
      connection: "ChannelConnectionRecord",
      config: "KnowbeeConfig",
    })
    expect(functionParameterTypes(source, "updateRawChannelEnabled")).toEqual([[
      "RuntimeProvider",
      "boolean",
      "KnowbeeConfig",
      "RuntimePaths",
    ]])
    expect(functionParameterTypes(source, "updateRawLocalBridgeEnabled")).toEqual([[
      "ChannelConnectionRecord",
      "boolean",
      "boolean",
      "KnowbeeConfig",
      "RuntimePaths",
    ]])
    expect(callArgumentTexts(source, "channelDetail")).toContainEqual([
      "updated.connection",
      "updated.config",
    ])
  })
})
