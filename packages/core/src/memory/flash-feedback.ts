import { getDb, insertFlashFeedback } from "../db/index.js"
import type { PromptTemplateVariables } from "./knowbee-md.js"
import { loadPromptValue } from "./prompt-fragments.js"

const MEMORY_PROMPT_CONTEXT_LABELS_SOURCE_ID = "memory_prompt_context_labels_user"

function memoryPromptContextLabel(key: string, variables: PromptTemplateVariables = {}): string {
  const value = loadPromptValue(MEMORY_PROMPT_CONTEXT_LABELS_SOURCE_ID, variables)
    .split(/\r?\n/u)
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1)
    .trim()
  return value ?? key
}

export interface ActiveFlashFeedback {
  id: string
  content: string
  severity: "low" | "normal" | "high"
  expiresAt: number
  createdAt: number
}

export function recordFlashFeedback(input: {
  sessionId: string
  content: string
  runId?: string
  requestGroupId?: string
  severity?: "low" | "normal" | "high"
  ttlMs?: number
  metadata?: Record<string, unknown>
}): string | null {
  const sessionId = input.sessionId.trim()
  const content = input.content.trim()
  if (!sessionId || !content) return null

  return insertFlashFeedback({
    sessionId,
    content,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
    severity: input.severity ?? "normal",
    ...(input.ttlMs !== undefined ? { ttlMs: input.ttlMs } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  })
}

export function getActiveFlashFeedback(input: {
  sessionId: string
  nowMs?: number
  limit?: number
}): ActiveFlashFeedback[] {
  const sessionId = input.sessionId.trim()
  if (!sessionId) return []
  const nowMs = input.nowMs ?? Date.now()
  const limit = Math.max(1, Math.min(10, input.limit ?? 5))
  try {
    return getDb()
      .prepare<[string, number, number], {
        id: string
        content: string
        severity: "low" | "normal" | "high"
        expires_at: number
        created_at: number
      }>(
        `SELECT id, content, severity, expires_at, created_at
         FROM flash_feedback
         WHERE session_id = ?
           AND expires_at > ?
         ORDER BY
           CASE severity WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC,
           created_at DESC
         LIMIT ?`,
      )
      .all(sessionId, nowMs, limit)
      .map((row) => ({
        id: row.id,
        content: row.content,
        severity: row.severity,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      }))
  } catch {
    return []
  }
}

export function buildFlashFeedbackContext(input: {
  sessionId: string
  nowMs?: number
  limit?: number
  maxChars?: number
}): string {
  const feedback = getActiveFlashFeedback(input)
  if (feedback.length === 0) return ""
  const maxChars = Math.max(120, input.maxChars ?? 800)
  const lines: string[] = []
  let used = 0

  for (const item of feedback) {
    const line = `- (${item.severity}) ${item.content.replace(/\s+/gu, " ").trim()}`
    if (used + line.length > maxChars) break
    lines.push(line)
    used += line.length + 1
  }

  return lines.length > 0
    ? `${memoryPromptContextLabel("flash_feedback_header")}\n${lines.join("\n")}\n${memoryPromptContextLabel("flash_feedback_note")}`
    : ""
}
