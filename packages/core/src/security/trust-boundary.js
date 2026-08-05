import { isInternalChannelSurface } from "../channels/contracts.js";
import { createHash } from "node:crypto";
export const UNTRUSTED_EVIDENCE_SOURCE_KINDS = [
    "web",
    "mcp",
    "skill",
    "yeonjang",
    "tool",
    "child",
    "memory",
    "file",
    "channel",
];
export function redactUntrustedEvidenceContent(value) {
    let redacted = false;
    const replace = () => {
        redacted = true;
        return "[redacted-secret]";
    };
    const content = value
        .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, replace)
        .replace(/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/gu, replace)
        .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/gu, replace)
        .replace(/\b(api[_-]?key|auth[_-]?token|password|secret|token)\b\s*[:=]\s*["']?[^"'\s,}]+/giu, (_match, key) => {
        redacted = true;
        return `${key}=[redacted-secret]`;
    });
    return Object.freeze({ content, redacted });
}
function requiredTrimmed(value, reasonCode) {
    const trimmed = value.trim();
    if (!trimmed)
        throw new Error(reasonCode);
    return trimmed;
}
export function createUntrustedEvidenceEnvelope(input) {
    if (!UNTRUSTED_EVIDENCE_SOURCE_KINDS.includes(input.sourceKind)) {
        throw new Error("untrusted_evidence_source_kind_invalid");
    }
    const sourceRef = requiredTrimmed(input.sourceRef, "untrusted_evidence_source_ref_missing");
    const contentLabel = input.contentLabel?.trim() || input.sourceKind;
    if (!["knowbee", "sub_agent", "team", "system"].includes(input.ownerScope.ownerType)) {
        throw new Error("untrusted_evidence_owner_invalid");
    }
    const ownerId = requiredTrimmed(input.ownerScope.ownerId, "untrusted_evidence_owner_missing");
    if (input.redactionState !== "redacted" && input.redactionState !== "not_required") {
        throw new Error("untrusted_evidence_redaction_incomplete");
    }
    const content = input.content.trim();
    const ownerScope = Object.freeze({
        ownerType: input.ownerScope.ownerType,
        ownerId,
    });
    return Object.freeze({
        schemaVersion: "untrusted-evidence-v1",
        sourceKind: input.sourceKind,
        sourceRef,
        contentLabel,
        ownerScope,
        trustClass: "untrusted_external",
        instructionIsolation: "data_only",
        redactionState: input.redactionState,
        contentFingerprint: createHash("sha256").update(content).digest("hex"),
        content,
    });
}
export function projectUntrustedEvidenceForPrompt(envelope) {
    return Object.freeze({
        role: "external_data",
        policyAuthority: "none",
        sourceKind: envelope.sourceKind,
        sourceRef: envelope.sourceRef,
        contentLabel: envelope.contentLabel,
        trustClass: envelope.trustClass,
        instructionIsolation: envelope.instructionIsolation,
        redactionState: envelope.redactionState,
        contentFingerprint: envelope.contentFingerprint,
        content: envelope.content,
    });
}
export function renderUntrustedEvidenceForPrompt(envelope) {
    return JSON.stringify(projectUntrustedEvidenceForPrompt(envelope));
}
export function evaluateUntrustedEvidenceConsumption(input) {
    const sourceRef = input.envelope.sourceRef.trim();
    if (!sourceRef) {
        return { allowed: false, reasonCode: "untrusted_evidence_provenance_missing", sourceRef: "unavailable" };
    }
    if (input.envelope.instructionIsolation !== "data_only") {
        return { allowed: false, reasonCode: "untrusted_evidence_isolation_invalid", sourceRef };
    }
    if (input.envelope.redactionState !== "redacted" && input.envelope.redactionState !== "not_required") {
        return { allowed: false, reasonCode: "untrusted_evidence_redaction_incomplete", sourceRef };
    }
    if (input.envelope.ownerScope.ownerType !== input.expectedOwnerScope.ownerType ||
        input.envelope.ownerScope.ownerId !== input.expectedOwnerScope.ownerId) {
        return { allowed: false, reasonCode: "untrusted_evidence_owner_mismatch", sourceRef };
    }
    if (input.purpose === "memory_write" &&
        containsPromptInjectionDirective(input.envelope.content)) {
        return {
            allowed: false,
            reasonCode: "untrusted_evidence_instructional_memory_write",
            sourceRef,
        };
    }
    return { allowed: true, reasonCode: "untrusted_evidence_data_only", sourceRef };
}
export const TRUST_TAGS = [
    "trusted",
    "user_input",
    "channel_input",
    "web_content",
    "file_content",
    "tool_result",
    "mcp_result",
    "capability_result",
    "yeonjang_result",
    "diagnostic",
];
const UNTRUSTED_TAGS = new Set([
    "user_input",
    "channel_input",
    "web_content",
    "file_content",
    "tool_result",
    "mcp_result",
    "capability_result",
    "yeonjang_result",
]);
const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /이전\s*(지시|명령|규칙).*무시/i,
    /승인\s*(없이|생략|건너)/i,
    /without\s+approval/i,
    /run\s+(a\s+)?shell/i,
    /shell\s*(을|를)?\s*실행/i,
    /토큰\s*(을|를)?\s*(출력|보여|공개)/i,
    /print\s+(the\s+)?token/i,
    /메모리\s*(에)?\s*(저장|기억)/i,
    /remember\s+this/i,
    /change\s+(the\s+)?policy/i,
    /정책\s*(을|를)?\s*(변경|수정)/i,
];
export function isUntrustedTag(tag) {
    return UNTRUSTED_TAGS.has(tag);
}
export function sourceToTrustTag(source) {
    return isInternalChannelSurface(source) ? "user_input" : "channel_input";
}
export function createContextBlock(params) {
    return {
        id: params.id,
        tag: params.tag,
        title: params.title,
        content: params.content,
        priority: params.priority ?? (isUntrustedTag(params.tag) ? "evidence" : "context"),
        ...(params.sourceRef ? { sourceRef: params.sourceRef } : {}),
    };
}
export function containsPromptInjectionDirective(content) {
    return INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}
export function renderContextBlockForPrompt(block) {
    if (!isUntrustedTag(block.tag)) {
        return [`[${block.title}]`, block.content.trim()].filter(Boolean).join("\n");
    }
    const sourceKindByTag = {
        channel_input: "channel",
        web_content: "web",
        file_content: "file",
        tool_result: "tool",
        mcp_result: "mcp",
        capability_result: "skill",
        yeonjang_result: "yeonjang",
        user_input: "channel",
    };
    const envelope = createUntrustedEvidenceEnvelope({
        sourceKind: sourceKindByTag[block.tag] ?? "tool",
        sourceRef: block.sourceRef?.trim() || `context:${block.id}`,
        contentLabel: block.title,
        ownerScope: { ownerType: "system", ownerId: "prompt-context" },
        content: block.content,
        redactionState: "redacted",
    });
    return renderUntrustedEvidenceForPrompt(envelope);
}
export function validatePromptAssemblyBlocks(blocks) {
    const violations = [];
    for (const block of blocks) {
        if (isUntrustedTag(block.tag) && (block.priority === "system" || block.priority === "policy")) {
            violations.push(`${block.id}: untrusted block cannot use ${block.priority} priority`);
        }
        if (isUntrustedTag(block.tag) && containsPromptInjectionDirective(block.content)) {
            violations.push(`${block.id}: untrusted directive kept as content only`);
        }
    }
    return { ok: violations.every((violation) => violation.endsWith("content only")), violations };
}
export function shouldBlockUntrustedMemoryWriteback(block) {
    return isUntrustedTag(block.tag) && containsPromptInjectionDirective(block.content);
}
//# sourceMappingURL=trust-boundary.js.map