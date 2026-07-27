import { describe, expect, it } from "vitest"
import {
  buildAgentTerminalFailureNotice,
} from "../packages/core/src/agent/terminal-failure-notice.ts"

describe("task0807 agent terminal failure notice", () => {
  it("builds sanitized terminal failure notice metadata", () => {
    expect(buildAgentTerminalFailureNotice({
      toolName: "screen_capture",
      failureTrust: "sanitized_tool_failure",
      reason: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
    })).toEqual({
      kind: "agent_terminal_failure",
      toolName: "screen_capture",
      failureTrust: "sanitized_tool_failure",
      reason: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
      deliveryMode: "diagnostic",
      textSource: "agent_terminal_failure_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("builds trusted deterministic terminal failure notice metadata", () => {
    expect(buildAgentTerminalFailureNotice({
      toolName: "screen_capture",
      failureTrust: "trusted_deterministic",
      reason: "path_bug",
    })).toMatchObject({
      kind: "agent_terminal_failure",
      toolName: "screen_capture",
      failureTrust: "trusted_deterministic",
      reason: "path_bug",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })
})
