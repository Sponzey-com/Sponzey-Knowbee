import type { RunChunkDeliveryHandler } from "./delivery.js"
import type { UserFacingTextSource } from "./loop-directive.js"
import {
  moveRunToAwaitingUser,
  moveRunToCancelledAfterStop,
  type AwaitingUserParams,
  type FinalizationDependencies,
  type FinalizationSource,
  type CanonicalDeliveryRecorder,
  type StandaloneAssistantMessageResponseContext,
} from "./finalization.js"
import type { CanonicalFinalOutcome } from "./canonical-work-run-projection.js"
import type { CanonicalResultReportFacts } from "../contracts/canonical-result-report.js"
import { decideTerminalApplicationOutcome } from "./terminal-outcome-policy.js"
import { buildTerminalControlNotice } from "./terminal-control-notice.js"

export type TerminalApplication =
  | ({ kind: "awaiting_user"; userMessageSource?: UserFacingTextSource } & AwaitingUserParams)
  | ({ kind: "stop"; userMessageSource?: UserFacingTextSource } & AwaitingUserParams)

interface TerminalApplicationDependencies {
  moveRunToAwaitingUser: typeof moveRunToAwaitingUser
  moveRunToCancelledAfterStop: typeof moveRunToCancelledAfterStop
}

const defaultTerminalApplicationDependencies: TerminalApplicationDependencies = {
  moveRunToAwaitingUser,
  moveRunToCancelledAfterStop,
}

export async function applyTerminalApplication(
  params: {
    runId: string
    sessionId: string
    source: FinalizationSource
    onChunk: RunChunkDeliveryHandler | undefined
    application: TerminalApplication
    responseContext?: StandaloneAssistantMessageResponseContext | undefined
    recordCanonicalDelivery?: CanonicalDeliveryRecorder | undefined
    canonicalFinalOutcome?: CanonicalFinalOutcome | undefined
    terminalReport?: CanonicalResultReportFacts | undefined
    dependencies: FinalizationDependencies
  },
  dependencies: TerminalApplicationDependencies = defaultTerminalApplicationDependencies,
): Promise<"awaiting_user" | "cancelled" | "failed"> {
  const messageSource = params.application.userMessageSource ?? "runtime_deterministic"
  const notice = buildTerminalControlNotice({
    terminalKind: params.application.kind,
    messageSource,
  })
  params.dependencies.appendRunEvent(
    params.runId,
    `user_facing_terminal_notice:${notice.textSource}:${notice.terminalKind}:non_final`,
  )
  params.dependencies.appendRunEvent(
    params.runId,
    `user_facing_terminal_message_source:${params.application.kind}:${messageSource}`,
  )
  const terminalOutcome = decideTerminalApplicationOutcome({
    applicationKind: params.application.kind,
  })

  if (terminalOutcome === "awaiting_user") {
    await dependencies.moveRunToAwaitingUser({
      runId: params.runId,
      sessionId: params.sessionId,
      source: params.source,
      onChunk: params.onChunk,
      awaitingUser: {
        preview: params.application.preview,
        summary: params.application.summary,
        ...(params.application.reason ? { reason: params.application.reason } : {}),
        ...(params.application.rawMessage ? { rawMessage: params.application.rawMessage } : {}),
        ...(params.application.userMessage ? { userMessage: params.application.userMessage } : {}),
        ...(params.application.remainingItems ? { remainingItems: params.application.remainingItems } : {}),
      },
      textSource: messageSource,
      ...(params.responseContext ? { responseContext: params.responseContext } : {}),
      dependencies: params.dependencies,
    })
    return "awaiting_user"
  }

  await dependencies.moveRunToCancelledAfterStop({
    runId: params.runId,
    sessionId: params.sessionId,
    source: params.source,
      onChunk: params.onChunk,
      cancellation: {
        preview: params.application.preview,
        summary: params.application.summary,
        ...(params.application.reason ? { reason: params.application.reason } : {}),
        ...(params.application.rawMessage ? { rawMessage: params.application.rawMessage } : {}),
        ...(params.application.userMessage ? { userMessage: params.application.userMessage } : {}),
        ...(params.application.remainingItems ? { remainingItems: params.application.remainingItems } : {}),
      },
      textSource: messageSource,
      ...(params.responseContext ? { responseContext: params.responseContext } : {}),
      ...(params.recordCanonicalDelivery
        ? { recordCanonicalDelivery: params.recordCanonicalDelivery }
        : {}),
      ...(params.canonicalFinalOutcome
        ? { canonicalFinalOutcome: params.canonicalFinalOutcome }
        : {}),
      ...(params.terminalReport ? { terminalReport: params.terminalReport } : {}),
      dependencies: params.dependencies,
    })
  return params.canonicalFinalOutcome === "blocked"
    || params.canonicalFinalOutcome === "exhausted"
    ? "failed"
    : "cancelled"
}
