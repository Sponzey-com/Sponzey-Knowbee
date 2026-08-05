import { createHash } from "node:crypto";
import { validateChildWorkResult, validateWorkHandoffPackage } from "./work-record.js";
import { validateResultReport } from "./sub-agent-orchestration.js";
const FORBIDDEN_DIRECT_CONTEXT_KEYS = new Set(["memory", "memoryStore", "sessionHistory", "transcript", "rawPrompt", "rawContext"]);
const TYPED_REFERENCE = /^(?:artifact|context|evidence|report|result|work|request|handoff):\S+$/;
function text(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function unique(values, field) {
    return [...new Set(values.map((value) => text(value, field)))];
}
function typedRefs(values, field) {
    return unique(values, field).map((value) => {
        if (!TYPED_REFERENCE.test(value))
            throw new Error(`${field} must contain typed references only.`);
        return value;
    });
}
function rejectDirectContext(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value))
        return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_DIRECT_CONTEXT_KEYS.has(key))
            throw new Error(`Direct agent context field is forbidden: ${key}.`);
        rejectDirectContext(child, seen);
    }
}
function fingerprint(value) {
    return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
export function createExplicitAgentExchange(input) {
    rejectDirectContext(input);
    const exchangeId = text(input.exchangeId, "Exchange ID");
    const senderAgentName = text(input.senderAgentName, "Sender agent name");
    const receiverAgentName = text(input.receiverAgentName, "Receiver agent name");
    if (senderAgentName === receiverAgentName)
        throw new Error("Exchange agents must differ.");
    const purpose = text(input.purpose, "Exchange purpose");
    let artifactRef;
    let sourceRefs;
    let approvedScope = [];
    if (input.kind === "work_handoff") {
        const validation = validateWorkHandoffPackage(input.artifact);
        if (!validation.ok)
            throw new Error("Work handoff exchange artifact is invalid.");
        if (validation.value.parent_agent_name !== senderAgentName || validation.value.target_agent_name !== receiverAgentName) {
            throw new Error("Work handoff exchange agents do not match the artifact.");
        }
        artifactRef = `handoff:${validation.value.handoff_id}`;
        sourceRefs = typedRefs(validation.value.context, "Handoff context");
    }
    else if (input.kind === "child_result") {
        const validation = validateChildWorkResult(input.artifact);
        if (!validation.ok)
            throw new Error("Child result exchange artifact is invalid.");
        if (validation.value.agent_name !== senderAgentName)
            throw new Error("Child result sender does not match the artifact agent name.");
        artifactRef = `result:${validation.value.work_id}`;
        sourceRefs = typedRefs(validation.value.evidence, "Child result evidence");
    }
    else if (input.kind === "result_report") {
        const validation = validateResultReport(input.artifact);
        if (!validation.ok)
            throw new Error("Result report exchange artifact is invalid.");
        artifactRef = `report:${validation.value.resultReportId}`;
        sourceRefs = typedRefs(validation.value.evidence.map((item) => item.sourceRef), "Result report evidence");
    }
    else {
        artifactRef = `context:${text(input.contextId, "Shared context ID")}`;
        text(input.approvedByAgentName, "Shared context approver");
        approvedScope = unique(input.scope, "Shared context scope");
        if (approvedScope.length === 0)
            throw new Error("Approved shared context requires scope.");
        sourceRefs = typedRefs(input.sourceRefs, "Shared context source");
        if (sourceRefs.length === 0)
            throw new Error("Approved shared context requires source references.");
        if (!Number.isFinite(input.evaluatedAt) || input.evaluatedAt < 0)
            throw new Error("Shared context evaluation time is invalid.");
        if (input.expiresAt !== undefined && (!Number.isFinite(input.expiresAt) || input.expiresAt <= input.evaluatedAt)) {
            throw new Error("Approved shared context must not be expired.");
        }
    }
    const unsigned = { schemaVersion: 1, exchangeId, kind: input.kind, senderAgentName, receiverAgentName, purpose, artifactRef, sourceRefs, approvedScope, memoryVisibility: "explicit_handoff_only" };
    return { ...unsigned, fingerprint: fingerprint(unsigned) };
}
//# sourceMappingURL=explicit-agent-exchange.js.map