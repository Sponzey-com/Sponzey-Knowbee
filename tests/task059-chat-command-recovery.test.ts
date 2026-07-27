import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { UserRecoveryNotice } from "../packages/webui/src/components/UserRecoveryNotice.tsx"
import {
  initialInputSubmission,
  reduceInputSubmission,
} from "../packages/webui/src/lib/input-submission.ts"
import {
  UiRequestFailure,
  projectUserRecovery,
} from "../packages/webui/src/lib/user-recovery.ts"

describe("Task059 chat and command recovery", () => {
  it("keeps failed input and ignores an obsolete completion", () => {
    const submitting = reduceInputSubmission(initialInputSubmission, {
      type: "submit_started",
      sequence: 4,
      draft: "keep this request",
    })
    expect(() =>
      reduceInputSubmission(submitting, {
        type: "submit_started",
        sequence: 5,
        draft: "duplicate",
      }),
    ).toThrow("Input submission is already active")

    const failed = reduceInputSubmission(submitting, {
      type: "submit_failed",
      sequence: 4,
      recovery: {
        kind: "unavailable",
        reasonCode: "service_unavailable",
        messageKey: "unavailable",
        action: "refresh_state",
        actionLabelKey: "refresh_state",
      },
    })
    expect(failed).toMatchObject({
      status: "failed",
      draft: "keep this request",
      sequence: 4,
    })
    expect(reduceInputSubmission(failed, { type: "submit_succeeded", sequence: 3 })).toBe(failed)
  })

  it("forbids raw exception rendering in chat and command owners", () => {
    const chat = readFileSync(
      new URL("../packages/webui/src/pages/ChatPage.tsx", import.meta.url),
      "utf8",
    )
    const palette = readFileSync(
      new URL("../packages/webui/src/components/CommandPalette.tsx", import.meta.url),
      "utf8",
    )
    const store = readFileSync(
      new URL("../packages/webui/src/stores/chat.ts", import.meta.url),
      "utf8",
    )

    for (const source of [chat, palette]) {
      expect(source).not.toContain("error instanceof Error ? error.message")
      expect(source).not.toContain("String(error)")
      expect(source).toContain("projectUserRecovery")
      expect(source).toContain("UserRecoveryNotice")
    }
    expect(chat).not.toContain("setInput(\"\")\n    addUserMessage")
    expect(store).not.toContain("mapChatErrorMessage(run.summary")
  })

  it("renders bounded chat recovery without private failure details", () => {
    const html = renderToStaticMarkup(
      createElement(UserRecoveryNotice, {
        subject: "chat",
        text: (ko: string) => ko,
        projection: {
          kind: "unavailable",
          reasonCode: "private_chat_adapter_503_secret",
          messageKey: "unavailable",
          action: "refresh_state",
          actionLabelKey: "refresh_state",
        },
      }),
    )
    expect(html).toContain("요청을 전송하지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).not.toContain("private_chat_adapter_503_secret")
  })

  it.each([
    [400, "invalid_input"],
    [403, "authorization"],
    [409, "conflict"],
    [503, "unavailable"],
    [418, "unknown"],
  ] as const)("projects status %i to %s without public exception text", (status, kind) => {
    const recovery = projectUserRecovery(new UiRequestFailure({
      status,
      reasonCode: "private_failure_code",
      safeMessage: "private backend detail",
    }), "mutation")
    expect(recovery.kind).toBe(kind)
    if (kind === "unknown") expect(recovery.reasonCode).toBe("request_failed")
  })

  it("retains approval and cancellation actions until authoritative success", () => {
    const approval = readFileSync(
      new URL("../packages/webui/src/components/runs/RunApprovalActions.tsx", import.meta.url),
      "utf8",
    )
    const modal = readFileSync(
      new URL("../packages/webui/src/components/ApprovalModal.tsx", import.meta.url),
      "utf8",
    )
    const cancellation = readFileSync(
      new URL("../packages/webui/src/components/runs/CancelRunButton.tsx", import.meta.url),
      "utf8",
    )
    expect(approval).toContain("const sent = sendWs")
    expect(approval).not.toContain("setPendingApproval(null)")
    expect(modal).not.toContain("setPendingApproval(null)")
    expect(cancellation).toContain("await onCancel()")
    expect(cancellation).toContain("keep confirmation open for retry")
  })
})
