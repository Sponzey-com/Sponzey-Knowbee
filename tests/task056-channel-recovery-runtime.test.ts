import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { createArtifactStorageContext } from "../packages/core/src/artifacts/lifecycle.ts"
import { createStartedChannelRecoveryRuntime } from "../packages/core/src/channels/pending-response-delivery.ts"
import { SlackChannel } from "../packages/core/src/channels/slack/bot.ts"
import { parseSlackSessionKey } from "../packages/core/src/channels/slack/session.ts"
import { TelegramChannel } from "../packages/core/src/channels/telegram/bot.ts"
import { insertSession } from "../packages/core/src/db/index.js"
import { createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

describe("Task 056 channel recovery runtime", () => {
  it("parses only canonical Slack channel and thread session keys", () => {
    expect(parseSlackSessionKey("slack:C012345:1710000000.000100")).toEqual({
      channelId: "C012345",
      threadTs: "1710000000.000100",
    })
    expect(parseSlackSessionKey("telegram:55:main")).toBeNull()
    expect(parseSlackSessionKey("slack::1710000000.000100")).toBeNull()
    expect(parseSlackSessionKey("slack:C012345:")).toBeNull()
    expect(parseSlackSessionKey("slack:C012345:thread:extra")).toBeNull()
  })

  it("routes only supported sources to the started channel instances", () => {
    const telegramHandler = vi.fn()
    const slackHandler = vi.fn()
    const telegram = {
      createPendingResponseDeliveryHandler: vi.fn(() => telegramHandler),
    }
    const slack = {
      createPendingResponseDeliveryHandler: vi.fn(() => slackHandler),
    }
    const runtime = createStartedChannelRecoveryRuntime({ telegram, slack })

    expect(
      runtime.resolveDeliveryHandler({
        runId: "run:telegram",
        sessionId: "session:telegram",
        source: "telegram",
        language: "ko",
      }),
    ).toBe(telegramHandler)
    expect(
      runtime.resolveDeliveryHandler({
        runId: "run:slack",
        sessionId: "session:slack",
        source: "slack",
        language: "en",
      }),
    ).toBe(slackHandler)
    expect(
      runtime.resolveDeliveryHandler({
        runId: "run:discord",
        sessionId: "session:discord",
        source: "discord",
      }),
    ).toBeUndefined()
    expect(telegram.createPendingResponseDeliveryHandler).toHaveBeenCalledWith({
      runId: "run:telegram",
      sessionId: "session:telegram",
      language: "ko",
    })
    expect(slack.createPendingResponseDeliveryHandler).toHaveBeenCalledWith({
      runId: "run:slack",
      sessionId: "session:slack",
      language: "en",
    })
  })

  it("delegates same-run recovery re-entry to the runtime owner", async () => {
    const resumeExistingRootRun = vi.fn(async () => true)
    const runtime = createStartedChannelRecoveryRuntime({
      resumeExistingRootRun,
    })

    await expect(runtime.resumeExistingRootRun("run:recovered")).resolves.toBe(
      true,
    )
    expect(resumeExistingRootRun).toHaveBeenCalledWith("run:recovered")
  })

  it("reconstructs handlers only from matching canonical persisted session targets", () => {
    const runtime = createTestDbRuntimeFixture("knowbee-task056-channel-target-")
    try {
      const now = Date.now()
      insertSession({
        id: "session:task056:telegram",
        source: "telegram",
        source_id: "telegram:-5500:77",
        created_at: now,
        updated_at: now,
        summary: null,
      })
      insertSession({
        id: "session:task056:slack",
        source: "slack",
        source_id: "slack:C_TASK056:1710000000.000056",
        created_at: now,
        updated_at: now,
        summary: null,
      })
      insertSession({
        id: "session:task056:malformed",
        source: "telegram",
        source_id: "telegram:not-a-chat:main",
        created_at: now,
        updated_at: now,
        summary: null,
      })
      const artifactStorage = createArtifactStorageContext(runtime.paths)
      const telegram = new TelegramChannel(
        {
          enabled: true,
          botToken: "test:token",
          allowedUserIds: [],
          allowedGroupIds: [],
        },
        artifactStorage,
      )
      const slack = new SlackChannel(
        {
          enabled: true,
          botToken: "xoxb-test",
          appToken: "xapp-test",
          allowedUserIds: [],
          allowedChannelIds: [],
        },
        artifactStorage,
      )

      expect(
        telegram.createPendingResponseDeliveryHandler({
          runId: "run:task056:telegram",
          sessionId: "session:task056:telegram",
          language: "ko",
        }),
      ).toBeTypeOf("function")
      expect(
        slack.createPendingResponseDeliveryHandler({
          runId: "run:task056:slack",
          sessionId: "session:task056:slack",
          language: "en",
        }),
      ).toBeTypeOf("function")
      expect(
        telegram.createPendingResponseDeliveryHandler({
          runId: "run:task056:mismatch",
          sessionId: "session:task056:slack",
        }),
      ).toBeUndefined()
      expect(
        telegram.createPendingResponseDeliveryHandler({
          runId: "run:task056:malformed",
          sessionId: "session:task056:malformed",
        }),
      ).toBeUndefined()
    } finally {
      runtime.dispose()
    }
  })

  it("passes the started channel resolver explicitly through the activation boundary", () => {
    const bootstrapSource = readFileSync("packages/core/src/runtime/bootstrap.ts", "utf8")
    const activationSource = readFileSync(
      "packages/core/src/runtime/channel-activation-recovery.ts",
      "utf8",
    )

    expect(bootstrapSource).toContain(
      "const channelActivation = await activateChannelsAndRecoverPendingResponses(",
    )
    expect(bootstrapSource).toContain(
      "channelRecoveryRuntime = channelActivation.channelRuntime",
    )
    expect(activationSource).toContain(
      "resolveDeliveryHandler: channelRuntime.resolveDeliveryHandler",
    )
  })
})
