import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1053 MQTT broker config snapshot boundary", () => {
  it("passes MqttConfig into broker startup instead of reading mqtt config inside startup", () => {
    const brokerSource = readFileSync("packages/core/src/mqtt/broker.ts", "utf-8")
    const indexSource = readFileSync("packages/core/src/runtime/bootstrap.ts", "utf-8")

    expect(brokerSource).toContain("export async function startMqttBroker(config: MqttConfig): Promise<void>")
    expect(brokerSource).toContain("export async function restartMqttBrokerFromConfig(config: Pick<KnowbeeConfig, \"mqtt\">): Promise<void>")
    expect(brokerSource).not.toContain("import { getConfig } from \"../config/index.js\"")
    expect(brokerSource).not.toContain("const config = getConfig().mqtt")
    expect(brokerSource).not.toContain("const runtimeConfig = getConfig()")
    expect(brokerSource).toContain("await startMqttBroker(config.mqtt)")

    expect(indexSource).not.toContain("getConfig")
    expect(indexSource).toContain("const runtimeConfig = resolveBootstrapConfig(config)")
    expect(indexSource).toContain("await startMqttBroker(runtimeConfig.mqtt)")
  })
})
