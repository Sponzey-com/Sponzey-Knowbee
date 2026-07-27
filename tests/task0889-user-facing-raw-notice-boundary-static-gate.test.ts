import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("task0889 user-facing raw notice boundary static gate", () => {
  it("blocks known raw notice direct-send patterns in channel, CLI, and API entry points", () => {
    const sources = new Map([
      ["telegramBot", readSource("packages/core/src/channels/telegram/bot.ts")],
      ["slackBot", readSource("packages/core/src/channels/slack/bot.ts")],
      ["slackApprovalHandler", readSource("packages/core/src/channels/slack/approval-handler.ts")],
      ["cliRun", readSource("packages/cli/src/commands/run.ts")],
      ["cliChunkDelivery", readSource("packages/cli/src/chunk-delivery.ts")],
      ["runsRoute", readSource("packages/core/src/api/routes/runs.ts")],
    ])

    const forbiddenPatterns = [
      "ctx.reply(notice.text)",
      "params.reply(notice.text)",
      "params.reply(describeLateApproval",
      "sendReceipt(receipt.text)",
      "sendReceipt(confirmationText)",
      "receipt: receipt.text",
      "`${receipt.text}\\n\\n`",
      "colorize(stdoutIsTty, RED, notice.text)",
    ]

    for (const [name, source] of sources) {
      for (const pattern of forbiddenPatterns) {
        expect(source, `${name} must not contain ${pattern}`).not.toContain(pattern)
      }
    }
  })

  it("keeps representative user-facing notice paths behind final response renderers", () => {
    expect(readSource("packages/core/src/channels/telegram/bot.ts")).toContain("renderChannelNoticeText")
    expect(readSource("packages/core/src/channels/slack/bot.ts")).toContain("renderChannelNoticeText")
    expect(readSource("packages/core/src/channels/slack/approval-handler.ts")).toContain("replyRenderedSlackApprovalText")
    expect(readSource("packages/cli/src/chunk-delivery.ts")).toContain("renderUserFacingNoticeText")
    expect(readSource("packages/cli/src/commands/run.ts")).toContain("renderIntakeAcknowledgementControl")
    expect(readSource("packages/core/src/api/routes/runs.ts")).toContain("acknowledgement,")
  })

  it("passes explicit notice rendering context through representative entry points", () => {
    const cliRun = readSource("packages/cli/src/commands/run.ts")
    const runsRoute = readSource("packages/core/src/api/routes/runs.ts")
    const channelsIndex = readSource("packages/core/src/channels/index.ts")

    expect(cliRun).toContain("buildFinalResponseIdentityContext")
    expect(cliRun).toContain("identityContext: finalResponseIdentityContext")
    expect(runsRoute).not.toContain("process.env")
    expect(channelsIndex).toContain("workDir: config.profile.workspace")
  })
})
