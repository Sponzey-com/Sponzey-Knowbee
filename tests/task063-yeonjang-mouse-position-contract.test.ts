import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { classifyYeonjangCapabilityMethod } from "../packages/core/src/capabilities/yeonjang-capability-schema.ts"
import { YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS } from "../packages/core/src/capabilities/yeonjang-side-effect-contract.ts"

describe("Task 063 Yeonjang mouse.position observation contract", () => {
  it("classifies mouse.position as safe read-only input observation", () => {
    expect(classifyYeonjangCapabilityMethod("mouse.position")).toMatchObject({
      group: "input",
      riskLevel: "safe",
      sideEffectClass: "read_local",
    })
    expect(YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS.map((item) => item.method)).not.toContain("mouse.position")
  })

  it("exposes mouse.position through Rust dispatch, capabilities and tool health", () => {
    const source = readFileSync("Yeonjang/src/node.rs", "utf8")

    expect(source).toContain('"mouse.position" =>')
    expect(source).toContain('"name": "mouse.position"')
    expect(source).toContain('"mouse.position": capability_entry')
    expect(source).toContain('"mouse.position": tool_health_entry')
  })

  it("adds a backend observation method instead of routing through system.exec", () => {
    const automation = readFileSync("Yeonjang/src/automation/mod.rs", "utf8")
    const mouseFeature = readFileSync("Yeonjang/src/features/mouse.rs", "utf8")

    expect(automation).toContain("MousePositionResult")
    expect(automation).toContain("fn mouse_position(&self)")
    expect(mouseFeature).toContain("current_position")
    expect(mouseFeature).not.toMatch(/system\.exec|Command::new/u)
  })
})
