import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { projectRuntimeIntakeContext } from "../packages/core/src/agent/intake.ts"

describe("Task 100 intake target catalog", () => {
  it("gives the LLM an exact stable target for a connected Yeonjang user-facing name", () => {
    const context = projectRuntimeIntakeContext([
      {
        extensionId: "yeonjang-main",
        instanceId: "yi-3776553a3d06b737",
        displayName: "yeonjang-main",
        state: "online",
      },
    ])

    expect(context).toContain(
      '- Extension target: target_instance=yeonjang:yi-3776553a3d06b737, user_facing_names=["yeonjang-main"], state=online',
    )
    expect(context.join("\n")).not.toContain("target_instance=yeonjang:yeonjang-main")
  })

  it("requires exact catalog resolution without fuzzy or semantic alias matching", () => {
    const prompt = readFileSync("prompts/task_intake.md", "utf8")

    expect(prompt).toContain(
      "When the latest user message names exactly one `user_facing_name` from that catalog",
    )
    expect(prompt).toContain("copy only its paired `target_instance`")
    expect(prompt).toContain("Do not fuzzy-match")
  })
})
