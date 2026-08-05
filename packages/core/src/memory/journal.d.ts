import BetterSqlite3 from "better-sqlite3";
import type { RuntimePaths } from "../config/paths.js";
export type MemoryJournalKind = "instruction" | "success" | "failure" | "response";
export type MemoryJournalScope = "global" | "session" | "task";
export interface MemoryJournalRecord {
    id: string;
    kind: MemoryJournalKind;
    scope: MemoryJournalScope;
    session_id: string | null;
    run_id: string | null;
    request_group_id: string | null;
    title: string;
    content: string;
    summary: string;
    tags: string | null;
    source: string | null;
    created_at: number;
    updated_at: number;
}
export interface MemoryJournalRecordInput {
    kind: MemoryJournalKind;
    scope?: MemoryJournalScope;
    content: string;
    title?: string;
    summary?: string;
    sessionId?: string;
    runId?: string;
    requestGroupId?: string;
    source?: string;
    tags?: string[];
}
export interface MemoryJournalStorageDependencies {
    makeDirectory(path: string): void;
    openDatabase(path: string): BetterSqlite3.Database;
}
export interface MemoryJournalRepository {
    readonly memoryDbFile: string;
    insert(input: MemoryJournalRecordInput): string;
    search(query: string, options?: MemoryJournalSearchOptions): MemoryJournalRecord[];
    buildContext(query: string, options?: MemoryJournalContextOptions): string;
    close(): void;
}
export interface MemoryJournalSearchOptions {
    limit?: number;
    kinds?: MemoryJournalKind[];
    sessionId?: string;
    requestGroupId?: string;
    runId?: string;
}
export interface MemoryJournalContextOptions {
    limit?: number;
    sessionId?: string;
    requestGroupId?: string;
    runId?: string;
}
export declare const NODE_MEMORY_JOURNAL_STORAGE: MemoryJournalStorageDependencies;
export declare function condenseMemoryText(text: string, maxChars?: number): string;
export declare function extractFocusedErrorMessage(text: string, maxChars?: number): string;
export declare function createMemoryJournalRepository(paths: Pick<RuntimePaths, "memoryDbFile">, dependencies?: MemoryJournalStorageDependencies): MemoryJournalRepository;
export declare function insertMemoryJournalRecord(input: MemoryJournalRecordInput, repository: MemoryJournalRepository): string;
export declare function searchMemoryJournal(query: string, options: MemoryJournalSearchOptions | undefined, repository: MemoryJournalRepository): MemoryJournalRecord[];
export declare function buildMemoryJournalContext(query: string, options: MemoryJournalContextOptions | undefined, repository: MemoryJournalRepository): string;
//# sourceMappingURL=journal.d.ts.map