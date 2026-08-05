export const IDENTITY_NAME_MUTATION_TARGETS = ["main_agent_name", "user_name"];
export function authorizeIdentityNameMutation(input) {
    if (!input.requestedTarget || !input.intent || !input.intent.requestId.trim() || !input.intent.requester.trim() || !["user", "administrator"].includes(input.intent.requesterType)) {
        return { status: "blocked", reasonCode: "explicit_name_target_missing" };
    }
    if (input.intent.target !== input.requestedTarget)
        return { status: "blocked", reasonCode: "name_target_mismatch" };
    if (input.intent.requestedAt > input.now || input.intent.expiresAt <= input.now)
        return { status: "blocked", reasonCode: "request_expired" };
    return { status: "authorized", target: input.requestedTarget, requestId: input.intent.requestId };
}
export async function executeAuthorizedIdentityNameMutation(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    if (input.decision.target !== input.writerTarget)
        return { status: "blocked", reasonCode: "name_target_mismatch" };
    return { status: "written", result: await input.write(input.writerTarget) };
}
//# sourceMappingURL=identity-name-mutation-authorization.js.map