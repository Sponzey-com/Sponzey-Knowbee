import { collectBoundedChatAttempt } from "./bounded-chat-attempt.js";
export class StructuredJsonAttemptError extends Error {
    reasonCode;
    constructor(reasonCode) {
        super(reasonCode);
        this.reasonCode = reasonCode;
        this.name = "StructuredJsonAttemptError";
    }
}
function parseJsonObject(rawOutput) {
    let parsed;
    try {
        parsed = JSON.parse(rawOutput);
    }
    catch {
        return { status: "invalid_json" };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { status: "json_object_required" };
    }
    return { status: "parsed", value: parsed };
}
export async function collectStructuredJsonAttempt(input) {
    const collected = await collectBoundedChatAttempt({
        stream: (signal) => input.provider.chat({
            ...input.chatParams,
            signal,
        }),
        ...(input.chatParams.signal ? { signal: input.chatParams.signal } : {}),
        deadlineMs: input.deadlineMs,
        maxTextBytes: input.maxVisibleTextBytes,
        maxToolInputBytes: input.maxVisibleTextBytes,
    });
    if (collected.status !== "completed")
        return collected;
    return parseJsonObject(collected.chunks
        .filter((chunk) => chunk.type === "text_delta")
        .map((chunk) => chunk.delta)
        .join(""));
}
//# sourceMappingURL=structured-json-attempt.js.map