import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  attachApprovalChannelBinding,
  createApprovalRegistryRequest,
  hashApprovalDecisionActor,
  listRequestedApprovalsForChannelCallback,
} from "../packages/core/src/runs/approval-registry.ts"
import {
  createTestDbRuntimeFixture,
  type TestDbRuntimeFixture,
} from "./fixtures/runtime-db.ts"

const getRootRunMock = vi.fn()
const resolveApprovalDecisionMock = vi.fn()
let runtime: TestDbRuntimeFixture

vi.mock("../packages/core/src/runs/store.js", () => ({
  getRootRun: (...args: unknown[]) => getRootRunMock(...args),
}))
vi.mock("../packages/core/src/tools/runtime-dispatcher.js", () => ({
  resolveApprovalDecision: (...args: unknown[]) =>
    resolveApprovalDecisionMock(...args),
}))

const {
  registerApprovalHandler,
  resetTelegramApprovalStateForTest,
} = await import(
  "../packages/core/src/channels/telegram/approval-handler.ts"
)

beforeEach(() => {
  runtime = createTestDbRuntimeFixture(
    "knowbee-telegram-approval-restart-binding-",
  )
  getRootRunMock.mockReset()
  resolveApprovalDecisionMock.mockReset()
  resolveApprovalDecisionMock.mockReturnValue({
    accepted: true,
    wokeLiveWaiter: false,
    approvalId: "approval:telegram:restart",
  })
  resetTelegramApprovalStateForTest()
})

afterEach(() => {
  resetTelegramApprovalStateForTest()
  runtime.dispose()
})

function prepareBoundApproval(): void {
  createApprovalRegistryRequest({
    id: "approval:telegram:restart",
    runId: "run-telegram-restart",
    requestGroupId: "group-telegram-restart",
    channel: "telegram",
    toolName: "yeonjang_camera_capture",
    riskLevel: "moderate",
    kind: "approval",
    params: {},
    now: Date.now(),
  })
  expect(attachApprovalChannelBinding({
    approvalId: "approval:telegram:restart",
    channelMessageId: "telegram:1001:3003:6501",
    decisionActorFingerprint: hashApprovalDecisionActor({
      channel: "telegram",
      actorId: "2002",
    }),
  })).toBe(true)
}

describe("Telegram approval restart binding", () => {
  it("stores no raw actor and resolves only the exact callback binding", () => {
    prepareBoundApproval()

    expect(listRequestedApprovalsForChannelCallback({
      runId: "run-telegram-restart",
      channel: "telegram",
      channelMessageId: "telegram:1001:3003:6501",
      decisionActorFingerprint: hashApprovalDecisionActor({
        channel: "telegram",
        actorId: "2002",
      }),
    })).toHaveLength(1)
    expect(listRequestedApprovalsForChannelCallback({
      runId: "run-telegram-restart",
      channel: "telegram",
      channelMessageId: "telegram:1001:3003:6501",
      decisionActorFingerprint: hashApprovalDecisionActor({
        channel: "telegram",
        actorId: "different-user",
      }),
    })).toEqual([])

    const stored = JSON.stringify(runtime.db.prepare(
      `SELECT decision_actor_fingerprint
       FROM approval_registry
       WHERE id = 'approval:telegram:restart'`,
    ).get())
    expect(stored).not.toContain("2002")
    expect(stored).toContain("sha256:")
  })

  it("accepts the exact durable callback after process-local pending state is gone", async () => {
    prepareBoundApproval()
    const callbackHandlers: Array<(ctx: {
      callbackQuery: {
        data: string
        message: {
          chat: { id: number }
          message_id: number
          message_thread_id?: number
        }
      }
      from: {
        id: number
        first_name?: string
        username?: string
        language_code?: string
      }
      answerCallbackQuery: (text?: string) => Promise<void>
    }) => Promise<void>> = []
    const bot = {
      api: {
        editMessageReplyMarkup: vi.fn(async () => undefined),
      },
      on: vi.fn((event: string, handler: (typeof callbackHandlers)[number]) => {
        if (event === "callback_query:data") callbackHandlers.push(handler)
      }),
    }
    registerApprovalHandler(bot as never)

    await callbackHandlers[0]?.({
      callbackQuery: {
        data: "approve:run-telegram-restart:once",
        message: {
          chat: { id: 1001 },
          message_id: 6501,
          message_thread_id: 3003,
        },
      },
      from: {
        id: 2002,
        first_name: "Tester",
        language_code: "ko-KR",
      },
      answerCallbackQuery: vi.fn(async () => undefined),
    })

    expect(resolveApprovalDecisionMock).toHaveBeenCalledOnce()
    expect(resolveApprovalDecisionMock).toHaveBeenCalledWith({
      approvalId: "approval:telegram:restart",
      runId: "run-telegram-restart",
      decision: "allow_once",
      decisionBy: "telegram",
      decisionSource: "user",
    })

    await callbackHandlers[0]?.({
      callbackQuery: {
        data: "approve:run-telegram-restart:once",
        message: {
          chat: { id: 1001 },
          message_id: 6501,
          message_thread_id: 3003,
        },
      },
      from: {
        id: 9999,
        first_name: "Other",
        language_code: "ko-KR",
      },
      answerCallbackQuery: vi.fn(async () => undefined),
    })
    expect(resolveApprovalDecisionMock).toHaveBeenCalledOnce()
  })

  it("does not replay a durable decision when Telegram rejects an expired callback acknowledgement", async () => {
    prepareBoundApproval()
    const callbackHandlers: Array<(ctx: {
      callbackQuery: {
        data: string
        message: {
          chat: { id: number }
          message_id: number
          message_thread_id?: number
        }
      }
      from: {
        id: number
        first_name?: string
        username?: string
        language_code?: string
      }
      answerCallbackQuery: (text?: string) => Promise<void>
    }) => Promise<void>> = []
    const bot = {
      api: {
        editMessageReplyMarkup: vi.fn(async () => undefined),
      },
      on: vi.fn((event: string, handler: (typeof callbackHandlers)[number]) => {
        if (event === "callback_query:data") callbackHandlers.push(handler)
      }),
    }
    registerApprovalHandler(bot as never)

    await expect(callbackHandlers[0]?.({
      callbackQuery: {
        data: "approve:run-telegram-restart:once",
        message: {
          chat: { id: 1001 },
          message_id: 6501,
          message_thread_id: 3003,
        },
      },
      from: {
        id: 2002,
        first_name: "Tester",
        language_code: "ko-KR",
      },
      answerCallbackQuery: vi.fn(async () => {
        throw new Error(
          "400: Bad Request: query is too old and response timeout expired",
        )
      }),
    })).resolves.toBeUndefined()

    expect(resolveApprovalDecisionMock).toHaveBeenCalledOnce()
  })
})
