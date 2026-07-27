import {
  redactUiValue,
  renderUserFacingNoticeText,
  sanitizeUserFacingError,
  type AgentChunk,
  type UserFacingNoticeRenderDependencies,
} from "@knowbee/core"
import { buildCliChunkErrorNotice } from "./chunk-error-notice.js"
import { isCliNoColorDisabled } from "./runtime-env.js"

const RESET = "\x1b[0m"
const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const DIM = "\x1b[2m"
const CLI_NO_COLOR_DISABLED = isCliNoColorDisabled()

function useColor(stdoutIsTty: boolean): boolean {
  return !CLI_NO_COLOR_DISABLED && stdoutIsTty
}

function colorize(stdoutIsTty: boolean, color: string, text: string): string {
  return useColor(stdoutIsTty) ? `${color}${text}${RESET}` : text
}

function redactCliValue<T>(value: T): T {
  return redactUiValue(value, { audience: "advanced" }).value as T
}

function redactCliText(value: string): string {
  return redactUiValue(value, { audience: "advanced" }).value as string
}

export interface CliChunkDeliveryContext {
  stdout: { write(text: string): void; isTTY?: boolean }
  stderr: { write(text: string): void }
  originalRequest?: string | undefined
  noticeRendering?: UserFacingNoticeRenderDependencies | undefined
}

export function createCliChunkDeliveryHandler(context: CliChunkDeliveryContext) {
  const stdoutIsTty = context.stdout.isTTY === true

  return async (chunk: AgentChunk): Promise<void> => {
    switch (chunk.type) {
      case "text":
        if (chunk.textSource !== "llm_reviewed") break
        context.stdout.write(chunk.delta)
        break

      case "tool_start":
        context.stderr.write(
          "\n" + colorize(stdoutIsTty, CYAN, `🔧 ${chunk.toolName}`) + " "
          + colorize(stdoutIsTty, DIM, JSON.stringify(redactCliValue(chunk.params))) + "\n",
        )
        break

      case "tool_end":
        const failureMessage = chunk.success
          ? ""
          : redactCliText(sanitizeUserFacingError(chunk.output).userMessage)
        context.stderr.write(
          chunk.success
            ? colorize(stdoutIsTty, GREEN, `   ✓ ${chunk.toolName}\n`)
            : colorize(stdoutIsTty, RED, `   ✗ ${chunk.toolName}: ${failureMessage}\n`),
        )
        break

      case "error":
        const notice = buildCliChunkErrorNotice({
          reason: sanitizeUserFacingError(chunk.message).userMessage,
        })
        const renderedNotice = await renderUserFacingNoticeText({
          originalRequest: context.originalRequest ?? "CLI request",
          rawText: notice.text,
          reasonPrefix: "cli_chunk_notice",
          dependencies: context.noticeRendering,
        })
        if (renderedNotice.status !== "ready") break
        context.stderr.write("\n" + colorize(stdoutIsTty, RED, renderedNotice.text) + "\n")
        break

      case "done":
        break
    }
  }
}
