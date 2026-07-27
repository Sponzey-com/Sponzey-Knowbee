import {
  collectBoundedChatAttempt,
  type BoundedChatAttemptFailureStatus,
  type BoundedChatAttemptResult,
} from "./bounded-chat-attempt.js"
import type { AIChunk } from "./types.js"

export type StructuredToolAttemptFailureStatus =
  | BoundedChatAttemptFailureStatus
  | "response_tool_missing"
  | "response_tool_multiple"
  | "response_tool_name_invalid"
  | "response_tool_input_invalid"

export type StructuredToolAttemptResult =
  | { status: "parsed"; value: Record<string, unknown> }
  | Exclude<BoundedChatAttemptResult, { status: "completed" }>
  | {
      status: Exclude<
        StructuredToolAttemptFailureStatus,
        BoundedChatAttemptFailureStatus
      >
    }

export async function collectStructuredToolAttempt(input: {
  stream: (signal: AbortSignal) => AsyncGenerator<AIChunk>
  signal?: AbortSignal
  deadlineMs: number
  responseToolName: string
  maxTextBytes: number
  maxToolInputBytes: number
}): Promise<StructuredToolAttemptResult> {
  const collected = await collectBoundedChatAttempt(input)
  if (collected.status !== "completed") return collected

  const calls = collected.chunks.filter(
    (chunk): chunk is Extract<AIChunk, { type: "tool_use" }> => chunk.type === "tool_use",
  )
  if (calls.length === 0) return { status: "response_tool_missing" }
  if (calls.length !== 1) return { status: "response_tool_multiple" }

  const call = calls[0]
  if (!call || call.name !== input.responseToolName) {
    return { status: "response_tool_name_invalid" }
  }
  if (!call.input || typeof call.input !== "object" || Array.isArray(call.input)) {
    return { status: "response_tool_input_invalid" }
  }
  return { status: "parsed", value: call.input as Record<string, unknown> }
}
