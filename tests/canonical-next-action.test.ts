import { describe, expect, it } from "vitest"
import {
  admitCanonicalExecutionNextAction,
} from "../packages/core/src/contracts/canonical-next-action.ts"
import { evaluateCompletionReviewFollowupGate } from "../packages/core/src/agent/completion-review.ts"

describe("canonical execution next action", () => {
  it("admits response-only when the model emits no tool use", () => {
    expect(admitCanonicalExecutionNextAction([])).toEqual({
      ok: true,
      action: { kind: "response_only" },
    })
  })

  it("admits exactly one tool with its validated adapter input", () => {
    expect(admitCanonicalExecutionNextAction([
      {
        id: "tool-use:1",
        name: "web_fetch",
        input: { url: "https://example.com/source" },
      },
    ])).toEqual({
      ok: true,
      action: {
        kind: "execute_tool",
        toolUseId: "tool-use:1",
        toolName: "web_fetch",
        input: { url: "https://example.com/source" },
      },
    })
  })

  it("rejects multiple tool uses before any dispatch", () => {
    expect(admitCanonicalExecutionNextAction([
      { id: "tool-use:1", name: "web_search", input: { query: "current fact" } },
      { id: "tool-use:2", name: "web_fetch", input: { url: "https://example.com" } },
    ])).toEqual({
      ok: false,
      reasonCode: "canonical_next_action_multiple_tools",
    })
  })

  it("requires exactly one completion follow-up Tool name", () => {
    const gate = evaluateCompletionReviewFollowupGate({
      status: "followup",
      summary: "Use one changed source.",
      reason: "Current evidence is insufficient.",
      followupPrompt: "Fetch one observed source.",
      followupEvidenceRefs: ["evidence:search"],
      followupExecutionMode: "tool",
      followupRequiredToolNames: ["web_search", "web_fetch"],
      remainingItems: ["Verify the current fact."],
    }, [], ["evidence:search"])

    expect(gate).toEqual({
      ok: false,
      reasonCode: "completion_review_followup_execution_invalid",
    })
  })
})
