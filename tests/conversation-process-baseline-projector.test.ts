import { describe, expect, it } from "vitest"
import {
  projectConversationProcessBaseline,
} from "../packages/core/src/channels/conversation-process-baseline.ts"

const validInput = {
  command: "pnpm exec vitest run --cache=false tests/conversation-process-verification-contract.test.ts",
  buildRevision: "0123456789abcdef0123456789abcdef01234567",
  capturedAt: "2026-07-25T05:00:00.000Z",
  testFiles: [
    {
      path: "tests/conversation-process-verification-contract.test.ts",
      status: "passed" as const,
      testCount: 5,
    },
  ],
}

describe("conversation process baseline projector", () => {
  it("projects only bounded working evidence fields", () => {
    expect(projectConversationProcessBaseline(validInput)).toEqual({
      status: "ready",
      evidence: {
        schemaVersion: 1,
        evidenceClass: "working_evidence_only",
        command: validInput.command,
        buildRevision: validInput.buildRevision,
        capturedAt: validInput.capturedAt,
        totals: {
          files: 1,
          tests: 5,
          passedFiles: 1,
          failedFiles: 0,
        },
        files: validInput.testFiles,
      },
    })
  })

  it.each([
    ["local path", "/Users/example/private/result.txt"],
    ["secret", "Bearer secret-token-value"],
    ["raw request", "raw_request=상태를 알려줘"],
    ["provider payload", "provider_payload={\"chat_id\":\"123456789\"}"],
  ])("rejects %s instead of redacting it into evidence", (_name, unsafe) => {
    expect(projectConversationProcessBaseline({
      ...validInput,
      testFiles: [{
        path: validInput.testFiles[0]!.path,
        status: "failed",
        testCount: 1,
        firstFailure: unsafe,
        classification: "product_defect",
      }],
    })).toEqual({
      status: "rejected",
      reasonCode: "unsafe_evidence_text",
    })
  })
})
