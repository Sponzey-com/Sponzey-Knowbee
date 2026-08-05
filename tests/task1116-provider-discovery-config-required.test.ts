import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1116 provider discovery config boundary", () => {
  it("requires provider discovery callers to pass the memory config snapshot", () => {
    const controlPlaneSource = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const setupRouteSource = readFileSync("packages/core/src/api/routes/setup.ts", "utf-8")
    const providerCapabilityTestSource = readFileSync("tests/task008-provider-capability.test.ts", "utf-8")
    const start = controlPlaneSource.indexOf("export async function discoverModelsFromEndpoint")
    const end = controlPlaneSource.indexOf("function looksLikeOpenAIModelList", start)
    const body = controlPlaneSource.slice(start, end)

    expect(body).toContain("endpoint: string,\n  config: Pick<KnowbeeConfig, \"memory\">")
    expect(body).toContain("memory: config.memory")
    expect(body).not.toContain("config: Pick<KnowbeeConfig, \"memory\"> = getConfig()")
    expect(body).not.toContain("const config = getConfig()")
    expect(setupRouteSource).toContain("const result = await discoverModelsFromEndpoint(endpoint, config, providerType, credentials, authMode)")
    expect(providerCapabilityTestSource).toContain("discoverModelsFromEndpoint(\"http://127.0.0.1:8080/v1\", DEFAULT_CONFIG, \"custom\", {}, \"api_key\")")
    expect(providerCapabilityTestSource).not.toContain("reloadConfig")
  })
})
