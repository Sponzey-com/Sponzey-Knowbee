import { loadPromptValue } from "../memory/prompt-fragments.js";
const INTERNAL_RUN_PROMPT_PREFIX_LABELS_SOURCE_ID = "internal_run_prompt_prefix_labels_user";
const INTERNAL_RUN_PROMPT_PREFIX_KEYS = [
    "task_intake_bridge",
    "filesystem_execution_required",
    "approval_granted_continuation",
    "scheduled_task",
    "truncated_output_recovery",
    "filesystem_verification",
];
export const INTERNAL_WORKER_PROMPT_PREFIX_KEYS = [
    "task_intake_bridge",
    "filesystem_execution_required",
    "approval_granted_continuation",
    "scheduled_task",
    "truncated_output_recovery",
];
export function internalRunPromptPrefix(key) {
    return internalRunPromptPrefixSnapshot()[key];
}
export function internalRunPromptPrefixSnapshot() {
    const lines = loadPromptValue(INTERNAL_RUN_PROMPT_PREFIX_LABELS_SOURCE_ID, {}, { required: true }).split(/\r?\n/u);
    const values = {};
    for (const key of INTERNAL_RUN_PROMPT_PREFIX_KEYS) {
        const value = lines
            .find((line) => line.startsWith(`${key}=`))
            ?.slice(key.length + 1)
            .trim();
        if (!value) {
            throw new Error(`internal run prompt prefix missing: ${key}`);
        }
        values[key] = value;
    }
    return Object.freeze(values);
}
function requireInternalRunPromptPrefix(value, key) {
    if (!value) {
        throw new Error(`internal run prompt prefix missing: ${key}`);
    }
    return value;
}
export function internalWorkerPromptPrefixes() {
    const snapshot = internalRunPromptPrefixSnapshot();
    return INTERNAL_WORKER_PROMPT_PREFIX_KEYS.map((key) => requireInternalRunPromptPrefix(snapshot[key], key));
}
//# sourceMappingURL=internal-prompt-prefixes.js.map