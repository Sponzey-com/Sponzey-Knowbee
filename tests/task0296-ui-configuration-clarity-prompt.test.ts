import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const REQUIRED_UI_POLICY_MARKERS = [
  "Organize settings around user tasks and outcomes, not internal module names, database fields, graph schemas, or runtime implementation boundaries.",
  "Show agent configuration as user-facing `agent_name`, role, capabilities, model selection, tool and external feature connection availability, permission status, parent-child relationship, and operational state.",
  "Hide `agent_id`, raw prompt stack, raw persona traits, hidden system instructions, internal topology metadata, and raw execution contracts from ordinary agent configuration screens.",
  "Agent-specific persona, tendency, and style settings must not appear as ordinary UI controls unless the user explicitly enters an authorized agent-persona editing workflow.",
  "If a screen uses graph or canvas views, show only user-actionable nodes and user-facing names; implicit platform roots do not need visible editable nodes.",
  "If beginner and advanced routes or panels exist, they must read and write one canonical settings model and one canonical save path.",
  "Button labels must match persistence behavior. If an action saves and moves forward, label it as save-and-continue or show equivalent explicit save status.",
  "Navigation-only actions must not silently persist changes. Save actions must show success, failure, and unsaved-change state.",
  "Disabled actions must show the missing requirement or blocked reason close to the control.",
  "Validation messages must state what is wrong, why it blocks the task, and the next action the user can take.",
  "Prefer sidebars, drawers, or inline panels for focused configuration details instead of replacing the whole screen with a large unrelated surface.",
  "Do not show raw system prompt text in UI by default;",
] as const

describe("task0296 UI configuration clarity prompt contract", () => {
  it("documents user-facing settings, agent visibility, save semantics, and advanced containment", () => {
    const uiPolicy = readFileSync(join(process.cwd(), "prompts", "ui_policy.md"), "utf-8")
    const system = readFileSync(join(process.cwd(), "prompts", "system.md"), "utf-8")

    for (const marker of REQUIRED_UI_POLICY_MARKERS) {
      expect(uiPolicy).toContain(marker)
    }

    expect(system).toContain("`ui_policy.md` owns UI convenience, accessibility, recovery guidance, and user-facing configuration simplicity.")
    expect(system).not.toContain("Button labels must match persistence behavior")
  })
})
