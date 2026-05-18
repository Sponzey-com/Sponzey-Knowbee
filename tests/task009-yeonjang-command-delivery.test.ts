import { describe, expect, it, vi } from "vitest"
import {
  createYeonjangCommandDispatch,
  isYeonjangSafeRetryMethod,
} from "../packages/core/src/yeonjang/mqtt-client.ts"

describe("task009 yeonjang command delivery", () => {
  it("builds an idempotent command envelope with target session binding", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-17T09:00:00.000Z"))

    const dispatch = createYeonjangCommandDispatch("screen.capture", { display: 1 }, {
      extensionId: "yeonjang-win",
      timeoutMs: 15_000,
      metadata: {
        runId: "run-1",
        requestGroupId: "request-group-1",
        sessionId: "session-1",
        targetSessionId: "sess-remote-1",
        source: "telegram",
      },
    })

    expect(dispatch.commandId).toBeTruthy()
    expect(dispatch.deliveryId).toBeTruthy()
    expect(dispatch.requestId).toBe(dispatch.deliveryId)
    expect(dispatch.idempotencyKey).toMatch(/^yeonjang-command:/)
    expect(dispatch.cancelToken).toBe(`yeonjang-cancel:${dispatch.commandId}`)
    expect(dispatch.expiresAt).toBe(Date.parse("2026-05-17T09:00:15.000Z"))
    expect(dispatch.metadata).toEqual(expect.objectContaining({
      runId: "run-1",
      requestGroupId: "request-group-1",
      sessionId: "session-1",
      targetSessionId: "sess-remote-1",
      source: "telegram",
      commandId: dispatch.commandId,
      deliveryId: dispatch.deliveryId,
      idempotencyKey: dispatch.idempotencyKey,
      expiresAt: dispatch.expiresAt,
      cancelToken: dispatch.cancelToken,
    }))
    expect(dispatch.request).toEqual(expect.objectContaining({
      id: dispatch.deliveryId,
      method: "screen.capture",
      params: { display: 1 },
      metadata: dispatch.metadata,
    }))

    vi.useRealTimers()
  })

  it("keeps caller-provided command identity stable while delivery ids rotate per attempt", () => {
    const first = createYeonjangCommandDispatch("screen.capture", {}, {
      metadata: {
        commandId: "command-fixed",
        idempotencyKey: "idem-fixed",
        expiresAt: 1_800_000_000_000,
        cancelToken: "cancel-fixed",
      },
    })
    const second = createYeonjangCommandDispatch("screen.capture", {}, {
      metadata: {
        commandId: "command-fixed",
        idempotencyKey: "idem-fixed",
        expiresAt: 1_800_000_000_000,
        cancelToken: "cancel-fixed",
      },
    })

    expect(first.commandId).toBe("command-fixed")
    expect(second.commandId).toBe("command-fixed")
    expect(first.idempotencyKey).toBe("idem-fixed")
    expect(second.idempotencyKey).toBe("idem-fixed")
    expect(first.cancelToken).toBe("cancel-fixed")
    expect(second.cancelToken).toBe("cancel-fixed")
    expect(first.deliveryId).not.toBe(second.deliveryId)
  })

  it("marks only observation-style methods as safe retry candidates", () => {
    expect(isYeonjangSafeRetryMethod("node.capabilities")).toBe(true)
    expect(isYeonjangSafeRetryMethod("system.info")).toBe(true)
    expect(isYeonjangSafeRetryMethod("camera.list")).toBe(true)
    expect(isYeonjangSafeRetryMethod("screen.capture")).toBe(true)
    expect(isYeonjangSafeRetryMethod("system.exec")).toBe(false)
    expect(isYeonjangSafeRetryMethod("mouse.action")).toBe(false)
    expect(isYeonjangSafeRetryMethod("keyboard.action")).toBe(false)
  })
})
