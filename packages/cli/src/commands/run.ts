import {
  bootstrapRuntime,
  buildFinalResponseIdentityContext,
  captureRuntimePaths,
  createArtifactStorageContext,
  createAgentHierarchyStorage,
  createMemoryJournalRepository,
  renderIntakeAcknowledgementControl,
  startIngressRun,
} from "@knowbee/core"
import type { AgentChunk } from "@knowbee/core"
import { createCliChunkDeliveryHandler } from "../chunk-delivery.js"
import { isCliNoColorDisabled } from "../runtime-env.js"

const RESET = "\x1b[0m"
const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const DIM = "\x1b[2m"
const BOLD = "\x1b[1m"
const CLI_NO_COLOR_DISABLED = isCliNoColorDisabled()

function useColor(): boolean {
  return !CLI_NO_COLOR_DISABLED && process.stdout.isTTY === true
}

function c(color: string, text: string): string {
  return useColor() ? `${color}${text}${RESET}` : text
}

export async function runCommand(message: string, options: {
  session?: string
  model?: string
  workDir?: string
  yes?: boolean
}) {
  const runtimeConfig = await bootstrapRuntime()
  const runtimePaths = captureRuntimePaths()
  const artifactStorage = createArtifactStorageContext(runtimePaths)
  const memoryJournal = createMemoryJournalRepository(runtimePaths)
  const hierarchyStorage = createAgentHierarchyStorage(runtimePaths)
  const effectiveWorkDir = options.workDir ?? runtimeConfig.profile.workspace
  const finalResponseIdentityContext = buildFinalResponseIdentityContext({
    config: runtimeConfig,
    originalRequest: message,
    workDir: effectiveWorkDir,
  })

  const abortController = new AbortController()
  process.on("SIGINT", () => {
    process.stderr.write("\n" + c(YELLOW, "Cancelling...") + "\n")
    abortController.abort()
  })

  if (options.yes) {
    const { eventBus } = await import("@knowbee/core")
    eventBus.on("approval.request", ({ resolve }) => {
      process.stderr.write(c(YELLOW, "  [auto-approved with --yes]\n"))
      resolve("allow_run")
    })
  } else {
    const { eventBus } = await import("@knowbee/core")
    eventBus.on("approval.request", async ({ toolName, params, resolve }) => {
      const paramsStr = JSON.stringify(params, null, 2)
        .split("\n")
        .map((l) => "    " + l)
        .join("\n")
      process.stderr.write(
        "\n" +
        c(YELLOW, `⚠  Approval required`) + "\n" +
        c(DIM, `   Tool:   `) + c(BOLD, toolName) + "\n" +
        c(DIM, `   Params:\n`) + c(DIM, paramsStr) + "\n" +
        c(CYAN, "   Decision? [a=all / y=once / N=deny] "),
      )
      const answer = await readLine()
      const normalized = answer.trim().toLowerCase()
      resolve(
        normalized === "a"
          ? "allow_run"
          : normalized === "y"
            ? "allow_once"
            : "deny",
      )
    })
  }

  process.stdout.write("\n")
  const handleChunk = createCliChunkDeliveryHandler({
    stdout: process.stdout,
    stderr: process.stderr,
    originalRequest: message,
    noticeRendering: {
      config: runtimeConfig,
      workDir: effectiveWorkDir,
      identityContext: finalResponseIdentityContext,
    },
  })
  const { started, acknowledgement } = startIngressRun({
    artifactStorage,
    memoryJournal,
    hierarchyStorage,
    config: runtimeConfig,
    message,
    sessionId: options.session,
    model: options.model,
    workDir: effectiveWorkDir,
    source: "cli",
    onChunk: async (chunk: AgentChunk) => {
      await handleChunk(chunk)
      return undefined
    },
  })
  process.stderr.write(c(DIM, `${renderIntakeAcknowledgementControl(acknowledgement)}\n\n`))

  const startMs = Date.now()
  try {
    await started.finished
  } finally {
    memoryJournal.close()
  }

  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1)
  process.stdout.write("\n" + c(DIM, `\n⏱  Done in ${durationSec}s\n`))
}

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    process.stdin.resume()
    process.stdin.setEncoding("utf-8")

    const onData = (chunk: string) => {
      if (chunk.includes("\n")) {
        process.stdin.off("data", onData)
        process.stdin.pause()
        resolve(chunks.join("").trimEnd())
      } else {
        chunks.push(Buffer.from(chunk))
      }
    }
    process.stdin.on("data", onData)
  })
}
