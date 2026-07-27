import { type DbMemoryItem, type MemorySearchFilters, type MemoryScope, type StoreMemoryDocumentResult } from "../db/index.js";
import { type MemoryChunkSearchResult, type MemorySearchResult } from "./search.js";
import { type MemoryJournalRepository } from "./journal.js";
import { type LongTermMemoryWriteGateInput } from "./long-term-write-gate.js";
import type { MemoryConfig } from "../config/types.js";
export type { DbMemoryItem };
export type { MemorySearchResult };
export type { MemoryChunkSearchResult };
type MemorySearchMode = "fts" | "vector" | "hybrid";
type MemoryEmbeddingConfig = Pick<MemoryConfig, "embedding">;
export interface StoreMemoryDocumentParams {
    rawText: string;
    scope: MemoryScope;
    ownerId?: string;
    scheduleId?: string;
    sourceType: string;
    sourceRef?: string;
    title?: string;
    metadata?: Record<string, unknown>;
    longTermWriteGate?: LongTermMemoryWriteGateInput;
    memoryConfig?: MemoryEmbeddingConfig;
}
export interface DetailedMemorySearchResult extends MemoryChunkSearchResult {
}
export interface MemoryContextBudget {
    maxChunks?: number;
    maxChars?: number;
    maxChunkChars?: number;
}
export declare function storeMemoryDocument(params: StoreMemoryDocumentParams): Promise<StoreMemoryDocumentResult>;
/** Store a memory item, auto-embedding if provider available */
export declare function storeMemory(params: {
    content: string;
    tags?: string[];
    importance?: "low" | "medium" | "high";
    scope?: MemoryScope;
    ownerId?: string;
    scheduleId?: string;
    sessionId?: string;
    requestGroupId?: string;
    runId?: string;
    type?: "user_fact" | "session_summary" | "project_note";
    longTermWriteGate?: LongTermMemoryWriteGateInput;
    memoryConfig?: MemoryEmbeddingConfig;
}): Promise<string>;
/** Synchronous version for compressor (no embedding) */
export declare function storeMemorySync(params: {
    content: string;
    tags?: string[];
    importance?: "low" | "medium" | "high";
    scope?: MemoryScope;
    ownerId?: string;
    scheduleId?: string;
    sessionId?: string;
    requestGroupId?: string;
    runId?: string;
    type?: "user_fact" | "session_summary" | "project_note";
    longTermWriteGate?: LongTermMemoryWriteGateInput;
    memoryConfig?: MemoryEmbeddingConfig;
}): string;
export declare function searchMemoryDetailed(query: string, limit?: number, filters?: MemorySearchFilters, options?: {
    searchMode?: MemorySearchMode | undefined;
    memoryConfig?: MemoryEmbeddingConfig;
}): Promise<DetailedMemorySearchResult[]>;
export declare function searchMemory(query: string, limit?: number, filters?: {
    sessionId?: string;
    runId?: string;
    requestGroupId?: string;
}, options?: {
    searchMode?: MemorySearchMode | undefined;
    memoryConfig?: MemoryEmbeddingConfig;
}): Promise<DbMemoryItem[]>;
export declare function searchMemorySync(query: string, limit?: number, filters?: {
    sessionId?: string;
    runId?: string;
    requestGroupId?: string;
}): DbMemoryItem[];
export declare function recentMemories(limit?: number, filters?: {
    sessionId?: string;
    runId?: string;
    requestGroupId?: string;
}): DbMemoryItem[];
export declare function buildMemoryInjectionContext(results: DetailedMemorySearchResult[], budget?: MemoryContextBudget): string;
/** Build a formatted memory context block for system prompt injection */
export declare function buildMemoryContext(params: {
    journalRepository: MemoryJournalRepository;
    query: string;
    sessionId?: string;
    requestGroupId?: string;
    runId?: string;
    scheduleId?: string;
    ownerScope?: MemorySearchFilters["ownerScope"];
    recipientScope?: MemorySearchFilters["recipientScope"];
    includeSchedule?: boolean;
    includeArtifact?: boolean;
    includeDiagnostic?: boolean;
    includeFlashFeedback?: boolean;
    searchMode?: MemorySearchMode;
    memoryConfig?: MemoryEmbeddingConfig;
    budget?: MemoryContextBudget;
}): Promise<string>;
//# sourceMappingURL=store.d.ts.map