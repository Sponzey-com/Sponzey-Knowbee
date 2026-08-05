import { describe, expect, it } from "vitest"
import {
  parseYeonjangCommandAttemptEvidence,
  projectYeonjangResponseFailure,
} from "../packages/core/src/yeonjang/command-attempt.ts"
import { createYeonjangCancellationRequest } from "../packages/core/src/yeonjang/mqtt-client.ts"
import { buildYeonjangRequestMetadata } from "../packages/core/src/tools/builtin/yeonjang-request-metadata.ts"
import { withYeonjangRequestMetadata } from "../packages/core/src/tools/builtin/yeonjang-request-metadata.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

describe("Yeonjang command attempt protocol", () => {
  it("accepts a versioned camera helper timeout bound to one command, operation, and target", () => {
    expect(parseYeonjangCommandAttemptEvidence({
      schema_version: 1,
      method: "camera.capture",
      command_id: "command-1",
      operation_id: "operation-1",
      target_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      terminal_stage: "helper_timeout",
      reason_code: "camera_helper_timeout",
      retry_safety: "change_strategy",
    })).toEqual({
      schemaVersion: 1,
      method: "camera.capture",
      commandId: "command-1",
      operationId: "operation-1",
      targetFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      terminalStage: "helper_timeout",
      reasonCode: "camera_helper_timeout",
      retrySafety: "change_strategy",
    })
  })

  it("rejects malformed or future attempt evidence instead of guessing its meaning", () => {
    expect(parseYeonjangCommandAttemptEvidence({
      schema_version: 2,
      method: "camera.capture",
      command_id: "command-1",
      terminal_stage: "helper_timeout",
      reason_code: "camera_capture_timeout",
      retry_safety: "change_strategy",
    })).toBeNull()
    expect(parseYeonjangCommandAttemptEvidence({
      schema_version: 1,
      method: "camera.capture",
      command_id: "",
      terminal_stage: "made_up_stage",
      reason_code: "camera_capture_timeout",
      retry_safety: "change_strategy",
    })).toBeNull()
  })

  it("keeps transport response timeout distinct from a reported helper timeout", () => {
    expect(projectYeonjangResponseFailure({
      kind: "response_timeout",
      method: "camera.capture",
      commandId: "command-1",
    })).toMatchObject({
      code: "camera_response_timeout",
      attempt: {
        schemaVersion: 1,
        commandId: "command-1",
        terminalStage: "response_timeout",
        retrySafety: "unknown_effect_state",
      },
    })

    expect(projectYeonjangResponseFailure({
      kind: "response_error",
      method: "camera.capture",
      commandId: "command-1",
      error: {
        code: "camera_helper_timeout",
        message: "Camera capture timed out before completion.",
      },
      attempt: {
        schema_version: 1,
        method: "camera.capture",
        command_id: "command-1",
        operation_id: "operation-1",
        target_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        terminal_stage: "helper_timeout",
        reason_code: "camera_helper_timeout",
        retry_safety: "change_strategy",
      },
    })).toMatchObject({
      code: "camera_helper_timeout",
      attempt: {
        commandId: "command-1",
        operationId: "operation-1",
        terminalStage: "helper_timeout",
        retrySafety: "change_strategy",
      },
    })
  })

  it("classifies a timeout after a handler-start receipt as a handler timeout", () => {
    expect(projectYeonjangResponseFailure({
      kind: "response_timeout",
      method: "camera.capture",
      commandId: "command-1",
      lastObservedStage: "handler_started",
    })).toMatchObject({
      code: "camera_handler_timeout",
      attempt: {
        commandId: "command-1",
        terminalStage: "handler_timeout",
        retrySafety: "unknown_effect_state",
      },
    })
  })

  it("projects caller cancellation as typed unknown-effect evidence", () => {
    expect(projectYeonjangResponseFailure({
      kind: "cancelled",
      method: "camera.capture",
      commandId: "command-1",
    })).toMatchObject({
      code: "camera_capture_cancelled",
      attempt: {
        commandId: "command-1",
        terminalStage: "cancelled",
        retrySafety: "unknown_effect_state",
      },
    })
  })

  it("does not bind attempt evidence from another command or method", () => {
    expect(projectYeonjangResponseFailure({
      kind: "response_error",
      method: "camera.capture",
      commandId: "command-1",
      error: { code: "camera_capture_timeout" },
      attempt: {
        schema_version: 1,
        method: "camera.list",
        command_id: "command-other",
        terminal_stage: "helper_timeout",
        reason_code: "camera_capture_timeout",
        retry_safety: "change_strategy",
      },
    })).not.toHaveProperty("attempt")
  })

  it("carries the canonical side-effect operation binding into Yeonjang metadata", () => {
    const metadata = buildYeonjangRequestMetadata({
      runId: "run-1",
      sessionId: "session-1",
      source: "telegram",
      sideEffectOperation: {
        operationId: "operation-1",
        targetFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    } as ToolContext)

    expect(metadata).toMatchObject({
      runId: "run-1",
      operationId: "operation-1",
      targetFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })
  })

  it("propagates the caller cancellation owner to the MQTT boundary", () => {
    const controller = new AbortController()
    const options = withYeonjangRequestMetadata({
      runId: "run-1",
      sessionId: "session-1",
      source: "telegram",
      signal: controller.signal,
    } as ToolContext)

    expect(options.signal).toBe(controller.signal)
  })

  it("binds a remote cancellation command to the exact command and cancel token", () => {
    const cancellation = createYeonjangCancellationRequest({
      commandId: "command-1",
      cancelToken: "cancel-1",
      targetSessionId: "runtime-session-1",
    })

    expect(cancellation).toMatchObject({
      method: "command.cancel",
      params: {
        command_id: "command-1",
        cancel_token: "cancel-1",
      },
      metadata: {
        targetSessionId: "runtime-session-1",
      },
    })
    expect(cancellation.metadata?.commandId).not.toBe("command-1")
  })
})
