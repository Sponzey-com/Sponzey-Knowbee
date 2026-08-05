import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1082 memory inspector control config snapshot", () => {
  it("allows memory inspector control actions to receive explicit config snapshots", () => {
    const source = readFileSync("packages/core/src/memory/inspector.ts", "utf-8")

    expect(source).toContain("config: MemoryInspectorConfigSnapshot")
    expect(source).toContain("const controlConfig = input.config")
    expect(source).toContain("buildMemoryInspectorSnapshot(buildInspectorSnapshotInput({ ...input, config: controlConfig }))")
    expect(source).toContain("const model = input.model?.trim() || getDefaultModel(controlConfig).trim()")
    expect(source).toContain("provider = input.provider ?? getProvider(undefined, controlConfig)")
    expect(source).toContain("memoryConfig: controlConfig.memory")
  })
})
