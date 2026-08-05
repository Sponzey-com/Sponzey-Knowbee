import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { classifyYeonjangCapabilityMethod } from "../packages/core/src/capabilities/yeonjang-capability-schema.ts"
import { YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS } from "../packages/core/src/capabilities/yeonjang-side-effect-contract.ts"

describe("Task 064 Yeonjang input.focused_target observation contract", () => {
  it("classifies input.focused_target as safe read-only input observation", () => {
    expect(classifyYeonjangCapabilityMethod("input.focused_target")).toMatchObject({
      group: "input",
      riskLevel: "safe",
      sideEffectClass: "read_local",
    })
    expect(YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS.map((item) => item.method)).not.toContain("input.focused_target")
  })

  it("exposes input.focused_target through Rust dispatch, capabilities and tool health", () => {
    const source = readFileSync("Yeonjang/src/node.rs", "utf8")

    expect(source).toContain('"input.focused_target" =>')
    expect(source).toContain('"name": "input.focused_target"')
    expect(source).toContain('"input.focused_target": capability_entry')
    expect(source).toContain('"input.focused_target": tool_health_entry')
  })

  it("returns sanitized focused target data without raw title output", () => {
    const automation = readFileSync("Yeonjang/src/automation/mod.rs", "utf8")
    const inputFeature = readFileSync("Yeonjang/src/features/input.rs", "utf8")

    expect(automation).toContain("FocusedTargetResult")
    expect(automation).toContain("fn focused_target(&self)")
    expect(automation).toContain("title_hash")
    expect(automation).toContain("title_length")
    expect(automation).not.toContain("pub title:")
    expect(inputFeature).toContain("focused_target")
    expect(inputFeature).not.toMatch(/system\.exec|Command::new/u)
  })
})
