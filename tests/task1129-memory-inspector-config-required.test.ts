import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1129 memory inspector config required", () => {
  it("requires explicit config snapshots without singleton fallback", () => {
    const source = readFileSync("packages/core/src/memory/inspector.ts", "utf-8")

    expect(source).toContain("config: MemoryInspectorConfigSnapshot")
    expect(source).toContain("const config = input.config")
    expect(source).toContain("const controlConfig = input.config")
    expect(source).not.toContain("import { getConfig }")
    expect(source).not.toContain("input.config ?? getConfig()")
    expect(source).not.toContain("} = {}): MemoryInspectorSnapshot")
  })

  it("threads the bootstrap config through API and admin boundaries", () => {
    const memoryRoute = readFileSync("packages/core/src/api/routes/memory.ts", "utf-8")
    const server = readFileSync("packages/core/src/api/server.ts", "utf-8")
    const adminRoute = readFileSync("packages/core/src/api/routes/admin.ts", "utf-8")

    expect(memoryRoute).toContain("registerMemoryRoute(app: FastifyInstance, config: KnowbeeConfig)")
    expect(memoryRoute).toContain("config,")
    expect(server).toContain("registerMemoryRoute(server, cfg)")
    expect(adminRoute).toContain("buildAdminRuntimeInspectors({\n        config,")
  })
})
