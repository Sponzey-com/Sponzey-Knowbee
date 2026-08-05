import { describe, expect, it } from "vitest"
import {
  createApiServerRuntimeContext,
  parseSlackLiveSmokeTarget,
} from "../packages/core/src/api/server-runtime-context.ts"
import { createStartupProcessContext } from "../packages/core/src/runtime/startup-process-context.ts"

describe("Task 150 Slack live smoke startup target", () => {
  it("captures an immutable explicit target once", () => {
    const runtime = createApiServerRuntimeContext(
      createStartupProcessContext({
        env: {
          KNOWBEE_CHANNEL_SMOKE_SLACK_CHANNEL_ID: "C150TARGET",
          KNOWBEE_CHANNEL_SMOKE_SLACK_USER_ID: "U150ACTOR",
          KNOWBEE_CHANNEL_SMOKE_SLACK_THREAD_TS: "1752740000.000150",
        },
        argv: [],
        cwd: "/workspace",
      }),
    )
    expect(runtime.slackLiveSmokeTarget).toEqual({
      channelId: "C150TARGET",
      userId: "U150ACTOR",
      threadTs: "1752740000.000150",
    })
    expect(Object.isFrozen(runtime.slackLiveSmokeTarget)).toBe(true)
  })

  it.each([
    [{}, "not_configured"],
    [{ KNOWBEE_CHANNEL_SMOKE_SLACK_CHANNEL_ID: "C150TARGET" }, "incomplete"],
    [
      {
        KNOWBEE_CHANNEL_SMOKE_SLACK_CHANNEL_ID: "invalid channel",
        KNOWBEE_CHANNEL_SMOKE_SLACK_USER_ID: "U150ACTOR",
      },
      "invalid",
    ],
    [
      {
        KNOWBEE_CHANNEL_SMOKE_SLACK_CHANNEL_ID: "C150TARGET",
        KNOWBEE_CHANNEL_SMOKE_SLACK_USER_ID: "U150ACTOR",
        KNOWBEE_CHANNEL_SMOKE_SLACK_THREAD_TS: "not-a-ts",
      },
      "invalid",
    ],
  ])("rejects absent or malformed target input", (env, reasonCode) => {
    expect(parseSlackLiveSmokeTarget(env)).toEqual({ status: "unavailable", reasonCode })
  })
})
