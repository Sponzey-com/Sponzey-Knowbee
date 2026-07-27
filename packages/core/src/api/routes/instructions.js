import { authMiddleware } from "../middleware/auth.js";
import { createInstructionRuntimeContext, loadMergedInstructions, } from "../../instructions/merge.js";
import { getApiRuntimeConfig, getApiRuntimePaths } from "../runtime-context.js";
import { authorizeSystemPromptDisclosure, } from "../../contracts/system-prompt-disclosure-boundary.js";
const AUTHORIZED_DISCLOSURE_PURPOSES = new Set([
    "prompt_review",
    "prompt_improvement",
    "administration",
    "security_review",
    "debugging",
    "audit",
]);
const INTERNAL_PATH_REDACTION = "[internal-path-redacted]";
const MERGED_INSTRUCTIONS_REDACTION = "[merged-instructions-redacted]";
const INSTRUCTION_SOURCE_ERROR_REDACTION = "[instruction-source-error-redacted]";
const ACTIVE_INSTRUCTIONS_DISCLOSURE_TARGET = "active-instructions";
function resolveWorkDir(value, fallbackWorkDir) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallbackWorkDir();
}
function normalizeDisclosureField(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function canonicalPurpose(purpose) {
    if (purpose === "prompt_review" || purpose === "prompt_improvement")
        return "prompt_review_or_improvement";
    if (purpose === "administration" || purpose === "debugging")
        return "administrator_debug";
    return "security_or_audit_validation";
}
function authorizeActiveInstructionsDisclosure(query, options) {
    const purpose = normalizeDisclosureField(query.purpose);
    const actor = normalizeDisclosureField(query.actor);
    const target = normalizeDisclosureField(query.target);
    const audience = normalizeDisclosureField(query.audience);
    const redactionMode = normalizeDisclosureField(query.redactionMode);
    const issues = [];
    if (!purpose || !AUTHORIZED_DISCLOSURE_PURPOSES.has(purpose)) {
        issues.push("purpose_missing_or_invalid");
    }
    if (!actor)
        issues.push("actor_missing");
    if (redactionMode === "raw_authorized" && !target) {
        issues.push("target_missing");
    }
    else if (redactionMode === "raw_authorized" && target !== ACTIVE_INSTRUCTIONS_DISCLOSURE_TARGET) {
        issues.push("target_mismatch");
    }
    if (!audience)
        issues.push("audience_missing");
    if (redactionMode !== "redacted" && redactionMode !== "raw_authorized") {
        issues.push("redaction_mode_missing_or_invalid");
    }
    if (issues.length === 0 && redactionMode === "raw_authorized") {
        const authorizationId = normalizeDisclosureField(query.authorizationId);
        const requestId = normalizeDisclosureField(query.requestId);
        const resolvedPurpose = canonicalPurpose(purpose);
        const receipt = authorizationId && requestId ? options.resolveAuthorizationReceipt?.(authorizationId, {
            requestId, actorRef: actor, audienceRef: audience, purpose: resolvedPurpose,
            targetSourceRef: ACTIVE_INSTRUCTIONS_DISCLOSURE_TARGET,
        }) : undefined;
        const decision = receipt ? authorizeSystemPromptDisclosure({
            surface: "authorized_workflow", requestId: requestId, actorRef: actor, audienceRef: audience,
            requestedPurpose: resolvedPurpose, requestedSourceRefs: [ACTIVE_INSTRUCTIONS_DISCLOSURE_TARGET],
            expectedSourceSetFingerprint: receipt.sourceSetFingerprint, receipt, now: options.now?.() ?? 0,
        }) : undefined;
        if (!receipt || receipt.authorizationId !== authorizationId || decision?.status !== "authorized") {
            issues.push("authorization_missing_or_invalid");
        }
    }
    if (issues.length > 0)
        return { ok: false, issues };
    return {
        ok: true,
        purpose: purpose,
        actor: actor,
        target: target ?? ACTIVE_INSTRUCTIONS_DISCLOSURE_TARGET,
        audience: audience,
        redactionMode: redactionMode,
    };
}
export function registerInstructionsRoute(app, options = {}) {
    app.get("/api/instructions/active", { preHandler: authMiddleware }, async (req, reply) => {
        const disclosure = authorizeActiveInstructionsDisclosure(req.query, options);
        if (!disclosure.ok) {
            return reply.status(403).send({
                error: "active_instructions_disclosure_not_authorized",
                issues: disclosure.issues,
                message: "Active instructions disclosure requires an authorized purpose, actor, audience, and redaction mode.",
            });
        }
        const paths = getApiRuntimePaths(req);
        const bundle = loadMergedInstructions(resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace), createInstructionRuntimeContext(paths.stateDir));
        const redacted = disclosure.redactionMode === "redacted";
        return {
            workDir: redacted ? INTERNAL_PATH_REDACTION : bundle.chain.workDir,
            ...(bundle.chain.gitRoot ? { gitRoot: redacted ? INTERNAL_PATH_REDACTION : bundle.chain.gitRoot } : {}),
            disclosure: {
                purpose: disclosure.purpose,
                actor: disclosure.actor,
                target: disclosure.target,
                audience: disclosure.audience,
                redactionMode: disclosure.redactionMode,
                state: disclosure.redactionMode === "raw_authorized" ? "raw_authorized" : "redacted",
            },
            mergedText: redacted ? MERGED_INSTRUCTIONS_REDACTION : bundle.mergedText,
            sources: bundle.chain.sources.map((source) => ({
                path: redacted ? INTERNAL_PATH_REDACTION : source.path,
                scope: source.scope,
                level: source.level,
                loaded: source.loaded,
                size: source.size,
                ...(source.error ? { error: redacted ? INSTRUCTION_SOURCE_ERROR_REDACTION : source.error } : {}),
            })),
        };
    });
}
//# sourceMappingURL=instructions.js.map