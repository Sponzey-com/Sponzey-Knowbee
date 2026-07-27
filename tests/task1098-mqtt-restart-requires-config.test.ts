import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1098 MQTT restart requires config", () => {
  it("removes the broker restart runtime config fallback and keeps callers explicit", () => {
    const brokerSource = readFileSync("packages/core/src/mqtt/broker.ts", "utf-8")
    const settingsRouteSource = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")

    expect(brokerSource).toContain("export async function restartMqttBrokerFromConfig(config: Pick<KnowbeeConfig, \"mqtt\">): Promise<void>")
    expect(brokerSource).toContain("await startMqttBroker(config.mqtt)")
    expect(brokerSource).not.toContain("import { getConfig } from \"../config/index.js\"")
    expect(brokerSource).not.toContain("restartMqttBrokerFromConfig(config: Pick<KnowbeeConfig, \"mqtt\"> = getConfig())")

    expect(settingsRouteSource).not.toContain("restartMqttBrokerFromConfig")
    expect(settingsRouteSource).toContain("restartRequired: true")
  })
})
