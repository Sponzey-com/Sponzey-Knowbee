export type InternalRunPromptPrefixKey = "task_intake_bridge" | "filesystem_execution_required" | "approval_granted_continuation" | "scheduled_task" | "truncated_output_recovery" | "filesystem_verification";
export declare const INTERNAL_WORKER_PROMPT_PREFIX_KEYS: InternalRunPromptPrefixKey[];
export declare function internalRunPromptPrefix(key: InternalRunPromptPrefixKey): string;
export declare function internalRunPromptPrefixSnapshot(): Readonly<Record<InternalRunPromptPrefixKey, string>>;
export declare function internalWorkerPromptPrefixes(): string[];
//# sourceMappingURL=internal-prompt-prefixes.d.ts.map