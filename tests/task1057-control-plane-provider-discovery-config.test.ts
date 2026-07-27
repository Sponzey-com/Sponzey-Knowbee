import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1057 control-plane provider discovery config snapshot", () => {
  it("uses one config snapshot for provider discovery memory capability", () => {
    const source = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const start = source.indexOf("export async function discoverModelsFromEndpoint")
    const end = source.indexOf("function looksLikeOpenAIModelList", start)
    const body = source.slice(start, end)

    expect(body).toContain("config: Pick<KnowbeeConfig, \"memory\">")
    expect(body).toContain("memory: config.memory")
    expect(body).not.toContain("const config = getConfig()")
    expect(body).not.toContain("config: Pick<KnowbeeConfig, \"memory\"> = getConfig()")
    expect(body).not.toContain("memory: getConfig().memory")
  })
})
