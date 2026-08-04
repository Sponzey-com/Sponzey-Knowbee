import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const REQUIRED_YEONJANG_POLICY_MARKERS = [
  "Distinguish the local Knowbee runtime, the local Yeonjang instance, remote Yeonjang instances, and the user's visible computer or operating system.",
  "Treat one registered Yeonjang instance as one computer-control endpoint.",
  "Target the exact Yeonjang instance named by the user.",
  "Ask a clarification question when the target instance is ambiguous and the action would affect a computer.",
  "Broadcast to every Yeonjang instance only when the user explicitly requests every instance.",
  "Before dispatching a Yeonjang action, record the selected instance, selection reason, requested capability, required permission, and whether approval is required.",
  "Check the selected instance state, trust state, scope access, support profile, requested method, and output mode before execution.",
  "Do not dispatch when the selected instance is offline, untrusted, outside scope, missing the requested method, missing the requested output mode, or waiting for required approval.",
  "If no Yeonjang instance is available, continue with Knowbee-only conversation, reasoning, planning, guidance, and workflow drafting where those can help.",
  "Do not claim file operations, app launch, screen control, camera capture, keyboard input, mouse input, local command execution, or computer inspection succeeded when Yeonjang is unavailable.",
  "Provide selected-target, connectivity, permission, capability, timeout, approval, and tool-result evidence to `result_review.md` for failure diagnosis and retry recommendation.",
  "Provide completed, blocked, and Knowbee-only result facts to `final_response.md` for user-facing wording and next-action rendering.",
] as const

describe("task0290 Yeonjang targeting and fallback prompt contract", () => {
  it("documents target selection, capability validation, and unavailable fallback", () => {
    const yeonjangPolicy = readFileSync(join(process.cwd(), "prompts", "yeonjang_policy.md"), "utf-8")
    const system = readFileSync(join(process.cwd(), "prompts", "system.md"), "utf-8")

    for (const marker of REQUIRED_YEONJANG_POLICY_MARKERS) {
      expect(yeonjangPolicy).toContain(marker)
    }
    expect(system).toContain("`yeonjang_policy.md` owns Yeonjang targeting, computer-control boundaries, permissions, and unavailable-extension fallback.")
    expect(system).not.toContain("Before dispatching a Yeonjang action, record the selected instance")
  })
})
