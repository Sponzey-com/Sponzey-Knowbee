import { createHash } from "node:crypto"
import {
  insertMemoryEmbeddingIfMissing,
  insertMemoryItem,
  markMemoryIndexJobCompleted,
  markMemoryIndexJobDisabled,
  markMemoryIndexJobFailed,
  recordMemoryAccessLog,
  searchMemoryItems,
  getRecentMemoryItems,
  getDb,
  storeMemoryDocument as storeMemoryDocumentRecord,
  type DbMemoryItem,
  type MemorySearchFilters,
  type MemoryScope,
  type StoreMemoryDocumentResult,
} from "../db/index.js"
import { getEmbeddingProvider, encodeEmbedding } from "./embedding.js"
import { searchMemoryChunks, searchMemoryItems2, type MemoryChunkSearchResult, type MemorySearchResult } from "./search.js"
import {
  buildMemoryJournalContext,
  type MemoryJournalRepository,
} from "./journal.js"
import { loadPromptValue } from "./prompt-fragments.js"
import type { PromptTemplateVariables } from "./knowbee-md.js"
import { appendRunEvent } from "../runs/store.js"
import { redactLogText } from "../logger/index.js"
import {
  validateLongTermMemoryWriteGate,
  type LongTermMemoryWriteGateDecision,
  type LongTermMemoryWriteGateInput,
} from "./long-term-write-gate.js"
import type { OwnerScope } from "../contracts/sub-agent-orchestration.js"
import type { MemoryConfig } from "../config/types.js"

export type { DbMemoryItem }
export type { MemorySearchResult }
export type { MemoryChunkSearchResult }
type MemorySearchMode = "fts" | "vector" | "hybrid"
type MemoryEmbeddingConfig = Pick<MemoryConfig, "embedding">

const MAX_MEMORY_CHUNK_LENGTH = 1600
const MEMORY_CHUNK_OVERLAP = 160

function memoryStoreErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}
const DEFAULT_MEMORY_CONTEXT_MAX_CHUNKS = 4
const DEFAULT_MEMORY_CONTEXT_MAX_CHARS = 2200
const DEFAULT_MEMORY_CONTEXT_MAX_CHUNK_CHARS = 420
const MEMORY_CONTEXT_OVERFLOW_NOTE = "..."
const MEMORY_PROMPT_CONTEXT_LABELS_SOURCE_ID = "memory_prompt_context_labels_user"

function memoryPromptContextLabel(key: string, variables: PromptTemplateVariables = {}): string {
  const value = loadPromptValue(MEMORY_PROMPT_CONTEXT_LABELS_SOURCE_ID, variables)
    .split(/\r?\n/u)
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1)
    .trim()
  return value ?? key
}

export interface StoreMemoryDocumentParams {
  rawText: string
  scope: MemoryScope
  ownerId?: string
  scheduleId?: string
  sourceType: string
  sourceRef?: string
  title?: string
  metadata?: Record<string, unknown>
  longTermWriteGate?: LongTermMemoryWriteGateInput
  memoryConfig?: MemoryEmbeddingConfig
}

export interface DetailedMemorySearchResult extends MemoryChunkSearchResult {}

export interface MemoryContextBudget {
  maxChunks?: number
  maxChars?: number
  maxChunkChars?: number
}

function checksumText(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4))
}

function chunkMemoryText(value: string): string[] {
  const normalized = value.trim()
  if (!normalized) return []
  if (normalized.length <= MAX_MEMORY_CHUNK_LENGTH) return [normalized]

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    const hardEnd = Math.min(start + MAX_MEMORY_CHUNK_LENGTH, normalized.length)
    const softBreak = normalized.lastIndexOf("\n", hardEnd)
    const end = softBreak > start + Math.floor(MAX_MEMORY_CHUNK_LENGTH * 0.6) ? softBreak : hardEnd
    const chunk = normalized.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= normalized.length) break
    start = Math.max(0, end - MEMORY_CHUNK_OVERLAP)
  }
  return chunks
}

function resolveDocumentOwnerId(params: { scope: MemoryScope; ownerId?: string; sessionId?: string; runId?: string; requestGroupId?: string; scheduleId?: string }): string | undefined {
  const explicitOwnerId = params.ownerId?.trim()
  if (explicitOwnerId) return explicitOwnerId
  if (params.scope === "global" || params.scope === "long-term") return "global"
  if (params.scope === "session" || params.scope === "short-term" || params.scope === "flash-feedback") return params.sessionId
  if (params.scope === "task") return params.requestGroupId ?? params.runId
  if (params.scope === "schedule") return params.scheduleId
  if (params.scope === "artifact") return params.requestGroupId ?? params.runId ?? params.sessionId
  if (params.scope === "diagnostic") return params.requestGroupId ?? params.runId ?? params.sessionId
  return undefined
}

function resolveLongTermDocumentOwnerId(ownerId: string | undefined): string {
  return ownerId?.trim() || "global"
}

function buildMissingLongTermWriteGate(ownerId: string): LongTermMemoryWriteGateInput {
  return {
    targetOwner: { ownerType: "knowbee", ownerId },
    category: undefined as never,
    storageNeed: undefined as never,
    sensitivity: undefined as never,
    userIntent: undefined as never,
    sourceEvidenceRefs: [],
    retentionPurpose: "",
  }
}

function validateStoreLongTermWriteGate(params: StoreMemoryDocumentParams): LongTermMemoryWriteGateDecision | undefined {
  if (params.scope !== "long-term") return undefined
  const ownerId = resolveLongTermDocumentOwnerId(params.ownerId)
  const input = params.longTermWriteGate ?? buildMissingLongTermWriteGate(ownerId)
  const expectedOwner: OwnerScope = {
    ownerType: input.targetOwner.ownerType,
    ownerId,
  }
  const decision = validateLongTermMemoryWriteGate(input, { expectedOwner })
  if (!decision.ok) {
    throw new Error(`long-term memory write gate failed: ${decision.issueCodes.join(", ")}`)
  }
  return decision
}

function buildLongTermWriteGateMetadata(
  decision: LongTermMemoryWriteGateDecision | undefined,
): Record<string, unknown> {
  if (!decision) return {}
  return {
    longTermWriteGate: "approved",
    longTermWriteGateCategory: decision.category,
    longTermWriteGateTargetOwnerScopeKey: decision.targetOwnerScopeKey,
    longTermWriteGateStorageNeed: decision.storageNeed,
    longTermWriteGateSensitivity: decision.sensitivity,
    longTermWriteGateUserIntent: decision.userIntent,
    longTermWriteGateSourceEvidenceRefs: decision.sourceEvidenceRefs,
    longTermWriteGateRetentionPurpose: decision.retentionPurpose,
  }
}

export async function storeMemoryDocument(params: StoreMemoryDocumentParams): Promise<StoreMemoryDocumentResult> {
  const rawText = params.rawText.trim()
  if (!rawText) throw new Error("memory document text is empty")
  const longTermWriteGate = validateStoreLongTermWriteGate(params)
  const chunks = chunkMemoryText(rawText)
  const result = storeMemoryDocumentRecord({
    scope: params.scope,
    ...(params.ownerId ?? params.scheduleId ? { ownerId: params.ownerId ?? params.scheduleId } : {}),
    sourceType: params.sourceType,
    ...(params.sourceRef ? { sourceRef: params.sourceRef } : {}),
    ...(params.title ? { title: params.title } : {}),
    rawText,
    checksum: checksumText(rawText),
    metadata: {
      ...(params.metadata ?? {}),
      ...buildLongTermWriteGateMetadata(longTermWriteGate),
    },
    chunks: chunks.map((content, ordinal) => ({
      ordinal,
      tokenEstimate: estimateTokens(content),
      content,
      checksum: checksumText(content),
      metadata: { ordinal },
    })),
  })

  if (!result.deduplicated) {
    await ensureChunkEmbeddings(result.documentId, result.chunkIds, params.memoryConfig)
  }

  return result
}

async function ensureChunkEmbeddings(documentId: string, chunkIds: string[], memoryConfig?: MemoryEmbeddingConfig): Promise<void> {
  const provider = getEmbeddingProvider(memoryConfig)
  if (provider.dimensions <= 0 || chunkIds.length === 0) {
    markMemoryIndexJobDisabled(documentId, "embedding provider is not configured")
    return
  }

  try {
    const rows = getDb()
      .prepare<unknown[], { id: string; content: string; checksum: string }>(
        `SELECT id, content, checksum FROM memory_chunks WHERE id IN (${chunkIds.map(() => "?").join(", ")}) ORDER BY ordinal ASC`,
      )
      .all(...chunkIds)
    const vectors = await provider.batchEmbed(rows.map((row) => row.content))
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const vector = vectors[i]
      if (!row || !vector || vector.length === 0) continue
      insertMemoryEmbeddingIfMissing({
        chunkId: row.id,
        provider: provider.providerId,
        model: provider.modelId,
        dimensions: provider.dimensions,
        textChecksum: row.checksum,
        vector: encodeEmbedding(vector),
      })
    }
    markMemoryIndexJobCompleted(documentId)
  } catch (err) {
    markMemoryIndexJobFailed(documentId, memoryStoreErrorMessage(err))
  }
}

/** Store a memory item, auto-embedding if provider available */
export async function storeMemory(params: {
  content: string
  tags?: string[]
  importance?: "low" | "medium" | "high"
  scope?: MemoryScope
  ownerId?: string
  scheduleId?: string
  sessionId?: string
  requestGroupId?: string
  runId?: string
  type?: "user_fact" | "session_summary" | "project_note"
  longTermWriteGate?: LongTermMemoryWriteGateInput
  memoryConfig?: MemoryEmbeddingConfig
}): Promise<string> {
  const id = insertMemoryItem(params)
  const ownerId = resolveDocumentOwnerId({
    scope: params.scope ?? "global",
    ...(params.ownerId ? { ownerId: params.ownerId } : {}),
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.runId ? { runId: params.runId } : {}),
    ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
    ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
  })

  await storeMemoryDocument({
    rawText: params.content,
    scope: params.scope ?? "global",
    ...(ownerId ? { ownerId } : {}),
    sourceType: params.type ?? "user_fact",
    sourceRef: id,
    title: params.type ?? "memory_item",
    ...(params.longTermWriteGate ? { longTermWriteGate: params.longTermWriteGate } : {}),
    ...(params.memoryConfig ? { memoryConfig: params.memoryConfig } : {}),
    metadata: {
      tags: params.tags ?? [],
      importance: params.importance ?? "medium",
      legacyMemoryItemId: id,
    },
  })

  // Async embed and update
  const provider = getEmbeddingProvider(params.memoryConfig)
  if (provider.dimensions > 0) {
    try {
      const vec = await provider.embed(params.content)
      const embBuf = encodeEmbedding(vec)
      getDb()
        .prepare("UPDATE memory_items SET embedding = ? WHERE id = ?")
        .run(embBuf, id)
    } catch {
      // embedding failed — memory still stored, just without vector
    }
  }

  return id
}

/** Synchronous version for compressor (no embedding) */
export function storeMemorySync(params: {
  content: string
  tags?: string[]
  importance?: "low" | "medium" | "high"
  scope?: MemoryScope
  ownerId?: string
  scheduleId?: string
  sessionId?: string
  requestGroupId?: string
  runId?: string
  type?: "user_fact" | "session_summary" | "project_note"
  longTermWriteGate?: LongTermMemoryWriteGateInput
  memoryConfig?: MemoryEmbeddingConfig
}): string {
  const id = insertMemoryItem(params)
  const ownerId = resolveDocumentOwnerId({
    scope: params.scope ?? "global",
    ...(params.ownerId ? { ownerId: params.ownerId } : {}),
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.runId ? { runId: params.runId } : {}),
    ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
    ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
  })
  void storeMemoryDocument({
    rawText: params.content,
    scope: params.scope ?? "global",
    ...(ownerId ? { ownerId } : {}),
    sourceType: params.type ?? "session_summary",
    sourceRef: id,
    title: params.type ?? "memory_item",
    ...(params.longTermWriteGate ? { longTermWriteGate: params.longTermWriteGate } : {}),
    ...(params.memoryConfig ? { memoryConfig: params.memoryConfig } : {}),
    metadata: {
      tags: params.tags ?? [],
      importance: params.importance ?? "medium",
      legacyMemoryItemId: id,
      syncWrite: true,
    },
  }).catch(() => undefined)
  return id
}

export async function searchMemoryDetailed(
  query: string,
  limit = 5,
  filters?: MemorySearchFilters,
  options: { searchMode?: MemorySearchMode | undefined; memoryConfig?: MemoryEmbeddingConfig } = {},
): Promise<DetailedMemorySearchResult[]> {
  const mode = options.searchMode ?? "fts"
  const results = await searchMemoryChunks(
    query,
    limit,
    mode,
    filters,
    options.memoryConfig ? { memoryConfig: options.memoryConfig } : undefined,
  )
  for (const result of results) {
    recordMemoryAccessLog({
      ...(filters?.runId ? { runId: filters.runId } : {}),
      ...(filters?.sessionId ? { sessionId: filters.sessionId } : {}),
      ...(filters?.requestGroupId ? { requestGroupId: filters.requestGroupId } : {}),
      documentId: result.chunk.document_id,
      chunkId: result.chunkId,
      sourceChecksum: result.chunk.source_checksum,
      scope: result.chunk.scope,
      query,
      resultSource: result.source,
      score: result.score,
      latencyMs: result.latencyMs,
      reason: "accepted_retrieval_candidate",
    })
  }
  appendMemorySearchLatencyEvents(filters?.runId, results)
  return results
}

function appendMemorySearchLatencyEvents(runId: string | undefined, results: DetailedMemorySearchResult[]): void {
  if (!runId || results.length === 0) return
  const maxLatencyBySource = new Map<string, number>()
  for (const result of results) {
    maxLatencyBySource.set(result.source, Math.max(maxLatencyBySource.get(result.source) ?? 0, result.latencyMs))
  }
  for (const [source, latencyMs] of maxLatencyBySource) {
    try {
      appendRunEvent(runId, `memory_${source}_ms=${Math.max(0, Math.floor(latencyMs))}ms`)
    } catch {
      // Memory search tracing must never affect retrieval.
    }
  }
}

export async function searchMemory(query: string, limit = 5, filters?: {
  sessionId?: string
  runId?: string
  requestGroupId?: string
}, options: { searchMode?: MemorySearchMode | undefined; memoryConfig?: MemoryEmbeddingConfig } = {}): Promise<DbMemoryItem[]> {
  const mode = options.searchMode ?? "fts"
  try {
    const results = await searchMemoryItems2(
      query,
      limit,
      mode,
      filters,
      options.memoryConfig ? { memoryConfig: options.memoryConfig } : undefined,
    )
    return results.map((r) => r.item)
  } catch {
    return []
  }
}

export function searchMemorySync(query: string, limit = 5, filters?: {
  sessionId?: string
  runId?: string
  requestGroupId?: string
}): DbMemoryItem[] {
  try {
    return searchMemoryItems(query, limit, filters)
  } catch {
    return []
  }
}

export function recentMemories(limit = 10, filters?: {
  sessionId?: string
  runId?: string
  requestGroupId?: string
}): DbMemoryItem[] {
  return getRecentMemoryItems(limit, filters)
}

function condenseForMemoryInjection(value: string, maxChars: number): string {
  const normalized = value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, Math.max(0, maxChars - MEMORY_CONTEXT_OVERFLOW_NOTE.length)).trimEnd()}${MEMORY_CONTEXT_OVERFLOW_NOTE}`
}

export function buildMemoryInjectionContext(
  results: DetailedMemorySearchResult[],
  budget: MemoryContextBudget = {},
): string {
  const maxChunks = Math.max(0, budget.maxChunks ?? DEFAULT_MEMORY_CONTEXT_MAX_CHUNKS)
  const maxChars = Math.max(0, budget.maxChars ?? DEFAULT_MEMORY_CONTEXT_MAX_CHARS)
  const maxChunkChars = Math.max(80, budget.maxChunkChars ?? DEFAULT_MEMORY_CONTEXT_MAX_CHUNK_CHARS)
  if (maxChunks === 0 || maxChars === 0) return ""

  const lines: string[] = []
  let usedChars = 0
  for (const result of results.slice(0, maxChunks)) {
    const score = Number.isFinite(result.score) ? result.score.toFixed(3) : "n/a"
    const date = new Date(result.chunk.updated_at).toLocaleDateString("ko-KR")
    const snippet = condenseForMemoryInjection(result.chunk.content, Math.min(maxChunkChars, Math.max(0, maxChars - usedChars)))
    const line = `- [${result.source}:${result.chunkId}; score=${score}; date=${date}] ${snippet}`
    if (usedChars + line.length > maxChars) break
    lines.push(line)
    usedChars += line.length + 1
  }

  return lines.length > 0 ? `${memoryPromptContextLabel("relevant_memory_header")}\n${lines.join("\n")}` : ""
}

/** Build a formatted memory context block for system prompt injection */
export async function buildMemoryContext(params: {
  journalRepository: MemoryJournalRepository
  query: string
  sessionId?: string
  requestGroupId?: string
  runId?: string
  scheduleId?: string
  ownerScope?: MemorySearchFilters["ownerScope"]
  recipientScope?: MemorySearchFilters["recipientScope"]
  includeSchedule?: boolean
  includeArtifact?: boolean
  includeDiagnostic?: boolean
  includeFlashFeedback?: boolean
  searchMode?: MemorySearchMode
  memoryConfig?: MemoryEmbeddingConfig
  budget?: MemoryContextBudget
}): Promise<string> {
  const memoryBudget = params.budget ?? {}
  const maxChunks = Math.max(0, memoryBudget.maxChunks ?? DEFAULT_MEMORY_CONTEXT_MAX_CHUNKS)
  const [results, journalContext] = await Promise.all([
    searchMemoryDetailed(params.query, Math.max(maxChunks, 1), {
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
      ...(params.runId ? { runId: params.runId } : {}),
      ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
      ...(params.ownerScope ? { ownerScope: params.ownerScope } : {}),
      ...(params.recipientScope ? { recipientScope: params.recipientScope } : {}),
      ...(params.includeSchedule ? { includeSchedule: params.includeSchedule } : {}),
      ...(params.includeArtifact ? { includeArtifact: params.includeArtifact } : {}),
      ...(params.includeDiagnostic ? { includeDiagnostic: params.includeDiagnostic } : {}),
      ...(params.includeFlashFeedback ? { includeFlashFeedback: params.includeFlashFeedback } : {}),
    }, {
      searchMode: params.searchMode ?? "fts",
      ...(params.memoryConfig ? { memoryConfig: params.memoryConfig } : {}),
    }),
    Promise.resolve(buildMemoryJournalContext(params.query, {
      limit: 6,
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
      ...(params.runId ? { runId: params.runId } : {}),
    }, params.journalRepository)),
  ])

  const relatedMemoryContext = buildMemoryInjectionContext(results, memoryBudget)

  return [relatedMemoryContext, journalContext].filter(Boolean).join("\n\n")
}
