import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  callArgumentCounts,
  functionParameterTypes,
  legacyConfigAccesses,
} from "./fixtures/typescript-source-contract.ts"

describe("task1054 Yeonjang MQTT config snapshot boundary", () => {
  it("creates Yeonjang MQTT clients from explicit config snapshots", () => {
    const clientSource = readFileSync("packages/core/src/yeonjang/mqtt-client.ts", "utf-8")
    const dispatcherSource = readFileSync("packages/core/src/tools/dispatcher.ts", "utf-8")
    const metadataSource = readFileSync("packages/core/src/tools/builtin/yeonjang-request-metadata.ts", "utf-8")
    const schedulerSource = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")
    const toolTypesSource = readFileSync("packages/core/src/tools/types.ts", "utf-8")

    expect(clientSource).not.toContain("getConfig().mqtt")
    expect(clientSource).not.toContain("from \"../config/index.js\"")
    expect(clientSource).toContain("mqttConfig?: MqttConfig")
    expect(clientSource).toContain("const mqttConfig = requireMqttClientConfig(options)")
    expect(clientSource).toContain("function createClient(config: MqttConfig): MqttClient")
    expect(clientSource).toContain("const client = createClient(mqttConfig)")

    expect(toolTypesSource).toContain("mqttConfig?: MqttConfig")
    expect(legacyConfigAccesses(dispatcherSource)).toEqual([])
    expect(functionParameterTypes(dispatcherSource, "buildRuntimeToolContext")[0]?.[0]).toContain("ctx: ToolContext")
    expect(functionParameterTypes(dispatcherSource, "buildRuntimeToolContext")[0]?.[0]).toContain("config: ToolRuntimeConfigSnapshot")
    expect(callArgumentCounts(dispatcherSource, "buildRuntimeToolContext")).toEqual([1])
    expect(dispatcherSource).toContain("const authorizedContext = {")
    expect(dispatcherSource).toContain("...runtimeToolContext,")
    expect(dispatcherSource).toContain("result = await executeToolWithSideEffectLedger({")
    expect(dispatcherSource).toContain("ctx: authorizedContext,")
    expect(dispatcherSource).toContain("authorizationReceipt: Object.freeze({")
    expect(metadataSource).toContain("const mqttConfig = callerOptions.mqttConfig ?? ctx.mqttConfig")
    expect(metadataSource).toContain("...(mqttConfig ? { mqttConfig } : {})")
    expect(schedulerSource).toContain("config: params.config")
  })
})
