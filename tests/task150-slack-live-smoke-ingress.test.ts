import { describe, expect, it, vi } from "vitest"
import { SlackChannel } from "../packages/core/src/channels/slack/bot.ts"
import type { SlackLiveSmokeIngressReceipt } from "../packages/core/src/channels/slack/bot.ts"

interface Internals {
  socket: { send(data: string): void; close(): void } | null
  liveSmokeStartObservers: Map<string, (receipt: SlackLiveSmokeIngressReceipt) => void>
  handleSocketMessage(raw: string): Promise<void>
}

function channel() {
  return new SlackChannel(
    {
      enabled: true,
      botToken: "xoxb-test",
      appToken: "xapp-test",
      allowedUserIds: ["U150ACTOR"],
      allowedChannelIds: ["C150TARGET"],
    },
    {} as ConstructorParameters<typeof SlackChannel>[1],
  )
}

describe("Task 150 Slack live smoke inbound boundary", () => {
  it("rejects inactive and unauthorized targets before handler invocation", async () => {
    const instance = channel()
    const internals = instance as unknown as Internals
    const handler = vi.fn(async () => undefined)
    internals.handleSocketMessage = handler
    await expect(
      instance.acceptLiveSmokeRequest({
        request: "status",
        target: { channelId: "C150TARGET", userId: "U150ACTOR" },
      }),
    ).rejects.toThrow("slack_live_smoke_runtime_unavailable")
    internals.socket = { send: vi.fn(), close: vi.fn() }
    await expect(
      instance.acceptLiveSmokeRequest({
        request: "status",
        target: { channelId: "C150TARGET", userId: "U_BLOCKED" },
      }),
    ).rejects.toThrow("slack_live_smoke_target_not_allowed")
    expect(handler).not.toHaveBeenCalled()
  })

  it("injects through the existing socket handler and returns its canonical run", async () => {
    const instance = channel()
    const internals = instance as unknown as Internals
    const socketSend = vi.fn()
    internals.socket = { send: socketSend, close: vi.fn() }
    internals.handleSocketMessage = vi.fn(async (raw) => {
      const payload = JSON.parse(raw) as {
        envelope_id?: string
        payload: { event: { channel: string; ts: string; thread_ts?: string } }
      }
      expect(payload.envelope_id).toBeUndefined()
      const event = payload.payload.event
      internals.liveSmokeStartObservers.get(`${event.channel}:${event.ts}`)?.({
        requestId: "run-150",
        runId: "run-150",
        requestGroupId: "run-150",
        threadTs: event.thread_ts ?? event.ts,
        finished: Promise.resolve(undefined),
      })
    })
    await expect(
      instance.acceptLiveSmokeRequest({
        request: "Report current status.",
        target: { channelId: "C150TARGET", userId: "U150ACTOR" },
      }),
    ).resolves.toMatchObject({ requestId: "run-150", threadTs: expect.any(String) })
    expect(internals.handleSocketMessage).toHaveBeenCalledOnce()
    expect(socketSend).not.toHaveBeenCalled()
  })
})
