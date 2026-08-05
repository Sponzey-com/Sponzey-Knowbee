import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const pluginLoaderSource = readFileSync(
  new URL("../packages/core/src/plugins/loader.ts", import.meta.url),
  "utf-8",
)
const slackBotSource = readFileSync(
  new URL("../packages/core/src/channels/slack/bot.ts", import.meta.url),
  "utf-8",
)
const fileIndexerSource = readFileSync(
  new URL("../packages/core/src/memory/file-indexer.ts", import.meta.url),
  "utf-8",
)

describe("task0617 remaining logger error redaction", () => {
  it("routes plugin loader failures through redaction", () => {
    expect(pluginLoaderSource).toContain("import { createLogger, redactLogText }")
    expect(pluginLoaderSource).toContain("function pluginLoaderErrorMessage")
    expect(pluginLoaderSource).toContain('Failed to load plugin "${meta.name}": ${pluginLoaderErrorMessage(err)}')
    expect(pluginLoaderSource).not.toContain(
      'Failed to load plugin "${meta.name}": ${err instanceof Error ? err.message : String(err)}',
    )
  })

  it("routes Slack socket message failures through redaction", () => {
    expect(slackBotSource).toContain("import { createLogger, redactLogText }")
    expect(slackBotSource).toContain("function slackBotErrorMessage")
    expect(slackBotSource).toContain("Slack message handling failed: ${slackBotErrorMessage(error)}")
    expect(slackBotSource).not.toContain(
      "Slack message handling failed: ${error instanceof Error ? error.message : String(error)}",
    )
  })

  it("routes file indexer embedding failures and paths through redaction", () => {
    expect(fileIndexerSource).toContain("import { logger, redactLogText }")
    expect(fileIndexerSource).toContain("function fileIndexerErrorMessage")
    expect(fileIndexerSource).toContain("redactLogText(`embedding failed for ${filePath}: ${fileIndexerErrorMessage(err)}`)")
    expect(fileIndexerSource).not.toContain(
      "embedding failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}",
    )
  })
})
