import { collectBoundedChatAttempt, } from "./bounded-chat-attempt.js";
export async function collectStructuredToolAttempt(input) {
    const collected = await collectBoundedChatAttempt(input);
    if (collected.status !== "completed")
        return collected;
    const calls = collected.chunks.filter((chunk) => chunk.type === "tool_use");
    if (calls.length === 0)
        return { status: "response_tool_missing" };
    if (calls.length !== 1)
        return { status: "response_tool_multiple" };
    const call = calls[0];
    if (!call || call.name !== input.responseToolName) {
        return { status: "response_tool_name_invalid" };
    }
    if (!call.input || typeof call.input !== "object" || Array.isArray(call.input)) {
        return { status: "response_tool_input_invalid" };
    }
    return { status: "parsed", value: call.input };
}
//# sourceMappingURL=structured-tool-attempt.js.map