import { describe, expect, it, vi } from "vitest"
import { authorizePromptImprovementTerminalOutput, renderAuthorizedPromptImprovementTerminalOutput } from "../packages/core/src/contracts/prompt-improvement-terminal-output.ts"

const facts = (state: "completed" | "blocked" | "rolled_back" = "completed") => ({
  state, inspectedPromptSources: ["prompt:identity"], changedPromptSources: ["prompt:identity"],
  changeReason: "Improve identity.", invariantsChecked: ["identity"], testsPassed: ["identity-test"], testsFailed: [],
  activeNow: state === "completed", reloadOrRestartRequired: false, rollbackPath: "git:abc1234", promptChanged: true, noChangeStatement: "",
})

describe("task1381 terminal output", () => {
  it.each(["completed", "blocked", "rolled_back"] as const)("authorizes complete %s facts", (state) => {
    expect(authorizePromptImprovementTerminalOutput(facts(state))).toMatchObject({ status: "authorized", facts: { state } })
  })
  it("requires explicit no-change reporting", () => {
    expect(authorizePromptImprovementTerminalOutput({ ...facts(), changedPromptSources: [], promptChanged: false }))
      .toEqual({ status: "blocked", reasonCode: "no_change_statement_missing" })
  })
  it("blocks source and state mismatches", () => {
    expect(authorizePromptImprovementTerminalOutput({ ...facts(), changedPromptSources: ["prompt:other"] })).toMatchObject({ status: "blocked" })
    expect(authorizePromptImprovementTerminalOutput({ ...facts(), reloadOrRestartRequired: true })).toEqual({ status: "blocked", reasonCode: "terminal_output_state_mismatch" })
  })
  it.each([
    { changeReason: "" },
    { invariantsChecked: [] },
    { testsPassed: [], testsFailed: [] },
    { rollbackPath: "" },
  ])("blocks incomplete terminal field %# with terminal_output_incomplete", (override) => {
    expect(authorizePromptImprovementTerminalOutput({ ...facts(), ...override }))
      .toEqual({ status: "blocked", reasonCode: "terminal_output_incomplete" })
  })
  it("renders only authorized facts through the LLM in the user language", async () => {
    const renderWithLlm = vi.fn(async () => "완료")
    const decision = authorizePromptImprovementTerminalOutput(facts())
    await expect(renderAuthorizedPromptImprovementTerminalOutput({ decision, userLanguage: "ko", renderWithLlm })).resolves.toEqual({ status: "rendered", text: "완료" })
    expect(renderWithLlm).toHaveBeenCalledWith(expect.any(Object), "ko")
  })
})
