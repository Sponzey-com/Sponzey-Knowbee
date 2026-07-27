import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1070 memory inspector AI config snapshot", () => {
  it("uses explicit config snapshots for memory inspector model and provider decisions", () => {
    const source = readFileSync("packages/core/src/memory/inspector.ts", "utf-8")

    expect(source).toContain("type MemoryInspectorConfigSnapshot = Pick<KnowbeeConfig, \"ai\" | \"memory\">")
    expect(source).toContain("config: MemoryInspectorConfigSnapshot")
    expect(source).toContain("const config = input.config")
    expect(source).toContain("const controlConfig = input.config")
    expect(source).toContain("const configuredExecutionModel = getDefaultModel(config).trim()")
    expect(source).toContain("buildMemoryInspectorSnapshot(buildInspectorSnapshotInput({ ...input, config: controlConfig }))")
    expect(source).toContain("const model = input.model?.trim() || getDefaultModel(controlConfig).trim()")
    expect(source).toContain("provider = input.provider ?? getProvider(undefined, controlConfig)")
    expect(source).not.toContain("getDefaultModel().trim()")
    expect(source).not.toContain("input.provider ?? getProvider()")
    expect(source).not.toContain("input.config ?? getConfig()")
  })
})
