import type { AgentTool, ToolContext, ToolResult } from "../types.js"
import { searchOwnerScopedMemory, storeOwnerScopedMemory } from "../../memory/isolation.js"
import { decideProductMemoryWritePolicy } from "../../memory/product-parameter-policy.js"
import type { OwnerScope } from "../../contracts/sub-agent-orchestration.js"
import { fileIndexer } from "../../memory/file-indexer.js"

// ── memory_store ─────────────────────────────────────────────────────────

const MAIN_AGENT_MEMORY_OWNER_SCOPE: OwnerScope = { ownerType: "knowbee", ownerId: "agent:knowbee" }

function resolveToolMemoryOwnerScope(ctx: ToolContext): OwnerScope {
  const agentId = ctx.agentId?.trim()
  if (agentId && ctx.agentType === "sub_agent") {
    return { ownerType: "sub_agent", ownerId: agentId }
  }
  if (agentId && ctx.agentType === "knowbee") {
    return { ownerType: "knowbee", ownerId: agentId }
  }
  return MAIN_AGENT_MEMORY_OWNER_SCOPE
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function formatTags(value: unknown): string {
  if (!Array.isArray(value)) return ""
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .join(", ")
}

interface MemoryStoreParams {
  content: string
  tags?: string[]
  importance?: "low" | "medium" | "high"
}

export const memoryStoreTool: AgentTool<MemoryStoreParams> = {
  name: "memory_store",
  evidenceSourceKind: "memory",
  description: "Store information in long-term memory only when the user explicitly asks to remember it and runtime long-term retention is configured.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "기억할 내용 (구체적이고 명확하게)" },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "분류 태그 (예: [\"사용자\", \"선호\", \"프로젝트\"])",
      },
      importance: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "중요도 (기본: medium)",
      },
    },
    required: ["content"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  execute: async (params: MemoryStoreParams, ctx: ToolContext): Promise<ToolResult> => {
    const owner = resolveToolMemoryOwnerScope(ctx)
    const longTermRetentionDays = ctx.memoryConfig?.longTermRetentionDays
    const productMemoryPolicy = decideProductMemoryWritePolicy({
      trigger: "explicit_user_save_request",
      runtimeLongTermRetentionConfigured: Number.isSafeInteger(longTermRetentionDays)
        && (longTermRetentionDays ?? 0) > 0,
    })
    if (!productMemoryPolicy.longTermAllowed) {
      return {
        success: false,
        output: "장기 메모리 보존 기간이 설정되지 않아 이 내용은 장기 저장하지 않았습니다.",
        error: "LONG_TERM_MEMORY_RETENTION_NOT_CONFIGURED",
        details: {
          policyDecision: productMemoryPolicy.decision,
          reasonCode: productMemoryPolicy.reasonCode,
        },
      }
    }
    const stored = await storeOwnerScopedMemory({
      owner,
      visibility: "private",
      retentionPolicy: "long_term",
      longTermWriteGate: {
        targetOwner: owner,
        category: "approved_work_context",
        storageNeed: "durable_user_fact",
        sensitivity: "personal",
        userIntent: "explicit_user_request",
        sourceEvidenceRefs: [
          ...(ctx.runId ? [`run:${ctx.runId}`] : []),
          ...(ctx.sessionId ? [`session:${ctx.sessionId}`] : []),
          "tool:memory_store",
        ],
        retentionPurpose: "user requested memory_store persistence",
      },
      rawText: params.content,
      sourceType: "user_fact",
      title: "memory_store",
      metadata: {
        tags: params.tags ?? [],
        importance: params.importance ?? "medium",
        productMemoryPolicyDecision: productMemoryPolicy.decision,
        productMemoryPolicyReasonCode: productMemoryPolicy.reasonCode,
        productMemoryPolicyNotes: productMemoryPolicy.notes,
        sessionId: ctx.sessionId,
        runId: ctx.runId,
        ...(ctx.requestGroupId ? { requestGroupId: ctx.requestGroupId } : {}),
      },
    })
    return { success: true, output: `메모리에 저장됨 (id: ${stored.documentId.slice(0, 8)}…)` }
  },
}

// ── memory_search ─────────────────────────────────────────────────────────

interface MemorySearchParams {
  query: string
  limit?: number
}

export const memorySearchTool: AgentTool<MemorySearchParams> = {
  name: "memory_search",
  evidenceSourceKind: "memory",
  description: "장기 메모리에서 관련 내용을 검색합니다. 사용자가 이전에 말한 내용이나 저장된 사실이 필요할 때 사용하세요.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "검색어 (자연어 또는 키워드)" },
      limit: { type: "number", description: "최대 결과 수 (기본: 5, 최대: 20)" },
    },
    required: ["query"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  execute: async (params: MemorySearchParams, ctx: ToolContext): Promise<ToolResult> => {
    const limit = Math.min(params.limit ?? 5, 20)
    const owner = resolveToolMemoryOwnerScope(ctx)
    const result = await searchOwnerScopedMemory({
      requester: owner,
      owner,
      query: params.query,
      limit,
      filters: {
        sessionId: ctx.sessionId,
        runId: ctx.runId,
        ...(ctx.requestGroupId ? { requestGroupId: ctx.requestGroupId } : {}),
      },
    })
    const results = result.memoryResults
    if (results.length === 0) {
      return { success: true, output: "관련 메모리를 찾을 수 없습니다." }
    }
    const text = results
      .map((r, i) => {
        const date = new Date(r.chunk.updated_at).toLocaleDateString("ko-KR")
        const metadata = parseMetadata(r.chunk.document_metadata_json)
        const tags = formatTags(metadata["tags"])
        return `${i + 1}. [${date}${tags ? ` | ${tags}` : ""}] ${r.chunk.content}`
      })
      .join("\n")
    return { success: true, output: text }
  },
}

// ── file_semantic_search ──────────────────────────────────────────────────

interface FileSearchParams {
  query: string
  limit?: number
  mode?: "text" | "vector" | "hybrid"
}

export const fileSemanticSearchTool: AgentTool<FileSearchParams> = {
  name: "file_semantic_search",
  evidenceSourceKind: "file",
  description: "인덱싱된 로컬 파일에서 의미적/키워드 검색을 수행합니다. `knowbee index` 명령으로 파일을 먼저 인덱싱해야 합니다.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "검색어 (자연어 또는 키워드)" },
      limit: { type: "number", description: "최대 결과 수 (기본: 5, 최대: 20)" },
      mode: {
        type: "string",
        enum: ["text", "vector", "hybrid"],
        description: "검색 모드: text(FTS), vector(의미 검색), hybrid(혼합, 기본값)",
      },
    },
    required: ["query"],
  },
  riskLevel: "safe",
  requiresApproval: false,
  execute: async (params: FileSearchParams, ctx: ToolContext): Promise<ToolResult> => {
    const limit = Math.min(params.limit ?? 5, 20)
    const mode = params.mode ?? "hybrid"
    const vectorSearchOptions = ctx.memoryConfig ? { memoryConfig: ctx.memoryConfig } : undefined

    let results: Array<{ file_path: string; chunk_index: number; content: string; score: number }>

    if (mode === "text") {
      results = fileIndexer.searchByText(params.query, limit)
    } else if (mode === "vector") {
      results = await fileIndexer.searchByVector(params.query, limit, vectorSearchOptions)
    } else {
      // hybrid: merge text + vector results
      const [textRes, vecRes] = await Promise.all([
        Promise.resolve(fileIndexer.searchByText(params.query, limit)),
        fileIndexer.searchByVector(params.query, limit, vectorSearchOptions),
      ])
      const seen = new Set<string>()
      results = []
      for (const r of [...textRes, ...vecRes]) {
        const key = `${r.file_path}:${r.chunk_index}`
        if (!seen.has(key)) { seen.add(key); results.push(r) }
      }
      results = results.slice(0, limit)
    }

    if (!results.length) {
      return { success: true, output: "검색 결과가 없습니다. `knowbee index <경로>` 명령으로 파일을 먼저 인덱싱하세요." }
    }

    const text = results
      .map((r, i) => `${i + 1}. [${r.file_path}:${r.chunk_index}]\n${r.content.slice(0, 400)}…`)
      .join("\n\n")
    return { success: true, output: text }
  },
}
