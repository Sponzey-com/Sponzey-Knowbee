import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1084 MQTT restart config snapshot", () => {
  it("keeps MQTT restart explicit and out of persisted settings writes", () => {
    const brokerSource = readFileSync("packages/core/src/mqtt/broker.ts", "utf-8")
    const settingsRouteSource = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")

    expect(brokerSource).toContain("import type { KnowbeeConfig, MqttConfig } from \"../config/types.js\"")
    expect(brokerSource).toContain("export async function restartMqttBrokerFromConfig(config: Pick<KnowbeeConfig, \"mqtt\">): Promise<void>")
    expect(brokerSource).toContain("await startMqttBroker(config.mqtt)")
    expect(brokerSource).not.toContain("import { getConfig } from \"../config/index.js\"")
    expect(brokerSource).not.toContain("const runtimeConfig = getConfig()")

    expect(settingsRouteSource).not.toContain("restartMqttBrokerFromConfig")
    expect(settingsRouteSource).not.toContain("reloadConfig()")
    expect(settingsRouteSource).toContain("restartRequired: true")
    expect(settingsRouteSource).toContain('appliesOn: "next_start"')
  })
})
