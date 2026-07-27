function nonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function record(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export function admitCanonicalExecutionNextAction(toolUses) {
    if (toolUses.length === 0) {
        return Object.freeze({
            ok: true,
            action: Object.freeze({ kind: "response_only" }),
        });
    }
    if (toolUses.length !== 1) {
        return Object.freeze({
            ok: false,
            reasonCode: "canonical_next_action_multiple_tools",
        });
    }
    const toolUse = toolUses[0];
    if (!toolUse || !nonEmpty(toolUse.id) || !nonEmpty(toolUse.name) || !record(toolUse.input)) {
        return Object.freeze({
            ok: false,
            reasonCode: "canonical_next_action_tool_invalid",
        });
    }
    return Object.freeze({
        ok: true,
        action: Object.freeze({
            kind: "execute_tool",
            toolUseId: toolUse.id.trim(),
            toolName: toolUse.name.trim(),
            input: Object.freeze({ ...toolUse.input }),
        }),
    });
}
//# sourceMappingURL=canonical-next-action.js.map