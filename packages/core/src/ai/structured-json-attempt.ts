import { collectBoundedChatAttempt } from "./bounded-chat-attempt.js"
import type { AIProvider, ChatParams } from "./types.js"

export type StructuredJsonAttemptFailureStatus =
  | "invalid_json"
  | "json_object_required"
  | "provider_failed"
  | "timed_out"
  | "cancelled"
  | "output_limit_exceeded"

export type StructuredJsonAttemptResult =
  | { status: "parsed"; value: Record<string, unknown> }
  | { status: StructuredJsonAttemptFailureStatus }

export class StructuredJsonAttemptError extends Error {
  constructor(readonly reasonCode: Exclude<
    StructuredJsonAttemptFailureStatus,
    "invalid_json" | "json_object_required"
  >) {
    super(reasonCode)
    this.name = "StructuredJsonAttemptError"
  }
}

interface StructuredJsonAttemptInput {
  provider: AIProvider
  chatParams: ChatParams
  deadlineMs: number
  maxVisibleTextBytes: number
}

function parseJsonObject(rawOutput: string): StructuredJsonAttemptResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawOutput)
  } catch {
    return { status: "invalid_json" }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "json_object_required" }
  }
  return { status: "parsed", value: parsed as Record<string, unknown> }
}

export async function collectStructuredJsonAttempt(
  input: StructuredJsonAttemptInput,
): Promise<StructuredJsonAttemptResult> {
  const collected = await collectBoundedChatAttempt({
    stream: (signal) => input.provider.chat({
      ...input.chatParams,
      signal,
    }),
    ...(input.chatParams.signal ? { signal: input.chatParams.signal } : {}),
    deadlineMs: input.deadlineMs,
    maxTextBytes: input.maxVisibleTextBytes,
    maxToolInputBytes: input.maxVisibleTextBytes,
  })
  if (collected.status !== "completed") return collected

  return parseJsonObject(
    collected.chunks
      .filter((chunk) => chunk.type === "text_delta")
      .map((chunk) => chunk.delta)
      .join(""),
  )
}
