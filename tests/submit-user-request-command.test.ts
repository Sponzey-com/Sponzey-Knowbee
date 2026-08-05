import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  buildSubmitUserRequestCommand,
  submitUserRequest,
} from "../packages/core/src/runs/ingress.ts"

function sharedExecutionInput() {
  return {
    artifactStorage: {} as never,
    memoryJournal: {} as never,
    hierarchyStorage: {} as never,
    config: DEFAULT_CONFIG,
    message: "현재 실행 상태를 확인해줘",
    sessionId: "session-shared",
    model: "model-shared",
    workDir: "/workspace/shared",
  }
}

describe("SubmitUserRequest command", () => {
  it("keeps normalized execution fields equal while preserving transport identity", () => {
    const webui = buildSubmitUserRequestCommand({
      ...sharedExecutionInput(),
      runId: "run-webui",
      transport: {
        source: "webui",
        channelEventId: "webui-event-1",
        externalChatId: "session-shared",
        externalThreadId: "session-shared",
        externalMessageId: "webui-event-1",
      },
    })
    const telegram = buildSubmitUserRequestCommand({
      ...sharedExecutionInput(),
      runId: "run-telegram",
      transport: {
        source: "telegram",
        channelEventId: "telegram-chat:main:101",
        externalChatId: "telegram-chat",
        externalThreadId: "main",
        externalMessageId: 101,
        userId: 7,
      },
    })

    expect({
      message: webui.message,
      sessionId: webui.sessionId,
      model: webui.model,
      workDir: webui.workDir,
      config: webui.config,
    }).toEqual({
      message: telegram.message,
      sessionId: telegram.sessionId,
      model: telegram.model,
      workDir: telegram.workDir,
      config: telegram.config,
    })
    expect(webui.inboundMessage).toMatchObject({
      source: "webui",
      channelEventId: "webui-event-1",
      messageKey: "webui:session-shared:session-shared:session-shared:webui-event-1",
    })
    expect(telegram.inboundMessage).toMatchObject({
      source: "telegram",
      channelEventId: "telegram-chat:main:101",
      threadId: "main",
      userId: "7",
      messageKey: "telegram:session-shared:telegram-chat:main:101",
    })
  })

  it("submits the generated command through the shared ingress boundary", () => {
    const startRootRun = vi.fn((params) => ({
      runId: params.runId ?? "missing",
      sessionId: params.sessionId ?? "missing",
      status: "started" as const,
      finished: Promise.resolve(undefined),
    }))

    const result = submitUserRequest(
      {
        ...sharedExecutionInput(),
        runId: "run-submit",
        transport: {
          source: "telegram",
          channelEventId: "chat:thread:202",
          externalChatId: "chat",
          externalThreadId: "thread",
          externalMessageId: 202,
        },
      },
      { startRootRun },
    )

    expect(result.requestId).toBe("run-submit")
    expect(startRootRun).toHaveBeenCalledOnce()
    expect(startRootRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-submit",
        sessionId: "session-shared",
        source: "telegram",
        inboundMessage: expect.objectContaining({
          messageKey: "telegram:session-shared:chat:thread:202",
        }),
      }),
    )
  })

  it("routes Telegram and WebUI assembly through the shared command", () => {
    const telegramSource = readFileSync(
      new URL("../packages/core/src/channels/telegram/bot.ts", import.meta.url),
      "utf8",
    )
    const webuiSource = readFileSync(
      new URL("../packages/core/src/api/routes/runs.ts", import.meta.url),
      "utf8",
    )

    expect(telegramSource).toContain("submitUserRequest({")
    expect(telegramSource).not.toContain("inboundMessage: createInboundMessageRecord({")
    expect(webuiSource).toContain("submitUserRequest({")
    expect(webuiSource).not.toContain("inboundMessage: createInboundMessageRecord({")
  })

  it("starts one RootRun when the same transport message is submitted twice", () => {
    const reservations = new Map<string, string>()
    const startRootRun = vi.fn((params) => ({
      runId: params.runId ?? "missing",
      sessionId: params.sessionId ?? "missing",
      status: "started" as const,
      finished: Promise.resolve(undefined),
    }))
    const dependencies = {
      startRootRun,
      reserveIngressAdmission: ({ idempotencyKey, runId }) => {
        const existingRunId = reservations.get(idempotencyKey)
        if (existingRunId) return { status: "existing" as const, runId: existingRunId }
        reservations.set(idempotencyKey, runId)
        return { status: "admitted" as const }
      },
      getRootRun: () => undefined,
    }
    const request = {
      ...sharedExecutionInput(),
      runId: "run-first",
      transport: {
        source: "telegram",
        channelEventId: "chat:main:303",
        externalChatId: "chat",
        externalThreadId: "main",
        externalMessageId: 303,
      },
    }

    const first = submitUserRequest(request, dependencies)
    const duplicate = submitUserRequest({ ...request, runId: "run-should-not-start" }, dependencies)

    expect(startRootRun).toHaveBeenCalledOnce()
    expect(first.admission).toEqual({
      status: "admitted",
      idempotencyKey: "ingress-request:telegram:session-shared:chat:main:303",
    })
    expect(duplicate.admission).toEqual({
      status: "duplicate",
      idempotencyKey: "ingress-request:telegram:session-shared:chat:main:303",
      originalRunId: "run-first",
    })
    expect(duplicate.started.runId).toBe("run-first")
  })

  it("admits different transport message identities independently", () => {
    const reservations = new Map<string, string>()
    const startRootRun = vi.fn((params) => ({
      runId: params.runId ?? "missing",
      sessionId: params.sessionId ?? "missing",
      status: "started" as const,
      finished: Promise.resolve(undefined),
    }))
    const dependencies = {
      startRootRun,
      reserveIngressAdmission: ({ idempotencyKey, runId }) => {
        const existingRunId = reservations.get(idempotencyKey)
        if (existingRunId) return { status: "existing" as const, runId: existingRunId }
        reservations.set(idempotencyKey, runId)
        return { status: "admitted" as const }
      },
      getRootRun: () => undefined,
    }

    submitUserRequest(
      {
        ...sharedExecutionInput(),
        runId: "run-telegram-304",
        transport: {
          source: "telegram",
          channelEventId: "chat:main:304",
          externalChatId: "chat",
          externalThreadId: "main",
          externalMessageId: 304,
        },
      },
      dependencies,
    )
    submitUserRequest(
      {
        ...sharedExecutionInput(),
        runId: "run-webui-event",
        transport: {
          source: "webui",
          channelEventId: "webui-event-2",
          externalChatId: "session-shared",
          externalThreadId: "session-shared",
          externalMessageId: "webui-event-2",
        },
      },
      dependencies,
    )

    expect(startRootRun).toHaveBeenCalledTimes(2)
  })

  it("fails closed before RootRun creation when admission persistence is unavailable", () => {
    const startRootRun = vi.fn()
    const request = {
      ...sharedExecutionInput(),
      runId: "run-unavailable",
      transport: {
        source: "webui",
        channelEventId: "webui-event-unavailable",
        externalMessageId: "webui-event-unavailable",
      },
    }

    expect(() =>
      submitUserRequest(request, {
        startRootRun,
        reserveIngressAdmission: () => ({ status: "persistence_unavailable" }),
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "IngressAdmissionError",
        reasonCode: "ingress_admission_persistence_unavailable",
      }),
    )
    expect(startRootRun).not.toHaveBeenCalled()
  })
})
