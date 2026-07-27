import { createHash } from "node:crypto";
export const LLM_CAPABILITY_SELECTION_REJECTION_CODES = Object.freeze([
    "user_method_constraint_requires_policy_path",
    "selection_schema_invalid",
    "run_scope_mismatch",
    "snapshot_scope_mismatch",
    "selection_receipt_required",
    "selection_receipt_mismatch",
    "ambiguous_executable_snapshot",
    "no_executable_candidates",
    "executable_candidates_mismatch",
    "binding_assessments_mismatch",
    "binding_assessment_snapshot_mismatch",
    "selected_binding_not_compared",
    "selected_binding_unavailable",
    "selected_binding_role_unfit",
    "selected_binding_permission_denied",
    "external_transfer_not_allowed",
    "selection_cost_limit_exceeded",
    "failed_strategy_reselected",
    "changed_strategy_evidence_missing",
]);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
function normalized(value) {
    return value.trim();
}
function bindingKey(binding) {
    return `${normalized(binding.capabilityId)}\u0000${normalized(binding.targetId)}`;
}
function canonicalize(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalize).join(",")}]`;
    return `{${Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
        .join(",")}}`;
}
function fingerprint(value) {
    return createHash("sha256")
        .update(`knowbee:llm-capability-selection:${canonicalize(value)}`)
        .digest("hex");
}
function recordValue(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function nonEmptyString(value) {
    return typeof value === "string" && Boolean(value.trim());
}
function validBindingRef(value) {
    const record = recordValue(value);
    return Boolean(record && nonEmptyString(record.capabilityId) && nonEmptyString(record.targetId));
}
function validBindingAssessment(value) {
    const record = recordValue(value);
    return Boolean(record &&
        validBindingRef(record) &&
        ["fit", "partial", "unfit"].includes(String(record.roleFit)) &&
        ["allowed", "approval_required", "denied"].includes(String(record.permission)) &&
        ["none", "read", "write", "external"].includes(String(record.sideEffect)) &&
        ["direct", "indirect", "unknown"].includes(String(record.evidenceQuality)) &&
        ["none", "local_private", "external_private", "public"].includes(String(record.dataExposure)) &&
        typeof record.externalTransfer === "boolean" &&
        ["none", "low", "high"].includes(String(record.cost)) &&
        nonEmptyString(record.strategyFingerprint) &&
        typeof record.changedFromFailedStrategies === "boolean" &&
        nonEmptyString(record.reason));
}
export function validateLlmCapabilitySelectionDecision(value) {
    const record = recordValue(value);
    const reasonCodes = [];
    if (record?.schemaVersion !== 1)
        reasonCodes.push("schema_version_invalid");
    if (!nonEmptyString(record?.runId))
        reasonCodes.push("run_id_required");
    if (!nonEmptyString(record?.capabilitySnapshotId))
        reasonCodes.push("snapshot_id_required");
    if (!nonEmptyString(record?.capabilitySnapshotFingerprint) ||
        !SHA256_PATTERN.test(record.capabilitySnapshotFingerprint)) {
        reasonCodes.push("snapshot_fingerprint_invalid");
    }
    if (!Array.isArray(record?.comparedBindings) ||
        record.comparedBindings.length === 0 ||
        !record.comparedBindings.every(validBindingRef)) {
        reasonCodes.push("compared_bindings_invalid");
    }
    if (!Array.isArray(record?.bindingAssessments) ||
        record.bindingAssessments.length === 0 ||
        !record.bindingAssessments.every(validBindingAssessment)) {
        reasonCodes.push("binding_assessments_invalid");
    }
    if (!validBindingRef(record?.selectedBinding))
        reasonCodes.push("selected_binding_invalid");
    if (!nonEmptyString(record?.reason))
        reasonCodes.push("reason_required");
    return reasonCodes.length > 0
        ? { valid: false, reasonCodes }
        : { valid: true, decision: value };
}
function executableSnapshotBindings(snapshot) {
    const bindings = new Map();
    const observedRisks = new Map();
    let ambiguous = false;
    for (const raw of snapshot.bindings) {
        const binding = {
            capabilityId: normalized(raw.capabilityId),
            targetId: normalized(raw.targetId),
            risk: raw.risk,
        };
        if (!binding.capabilityId || !binding.targetId || binding.capabilityId.startsWith("action:")) {
            continue;
        }
        const key = bindingKey(binding);
        const risks = observedRisks.get(key) ?? new Set();
        risks.add(binding.risk);
        observedRisks.set(key, risks);
        if (risks.size > 1)
            ambiguous = true;
        const existing = bindings.get(key);
        if (binding.risk === "denied") {
            bindings.delete(key);
        }
        else {
            bindings.set(key, binding);
        }
    }
    const excluded = new Set((snapshot.exclusions ?? []).map(bindingKey));
    for (const key of bindings.keys()) {
        if (excluded.has(key))
            ambiguous = true;
    }
    const executableKeys = new Set(bindings.keys());
    const candidateContexts = [];
    const candidateKeys = new Set();
    for (const context of snapshot.candidateContexts ?? []) {
        const key = bindingKey(context);
        if (candidateKeys.has(key)) {
            ambiguous = true;
            continue;
        }
        candidateKeys.add(key);
        if (!executableKeys.has(key))
            continue;
        if (context.kind === "instruction_skill"
            ? !context.content.trim() || !SHA256_PATTERN.test(context.checksum)
            : context.toolNames.length === 0 ||
                context.toolNames.some((toolName) => !normalized(toolName))) {
            ambiguous = true;
            continue;
        }
        candidateContexts.push(context.kind === "instruction_skill"
            ? {
                kind: context.kind,
                capabilityId: normalized(context.capabilityId),
                targetId: normalized(context.targetId),
                content: context.content,
                checksum: context.checksum,
            }
            : {
                kind: context.kind,
                capabilityId: normalized(context.capabilityId),
                targetId: normalized(context.targetId),
                toolNames: [...new Set(context.toolNames.map(normalized).filter(Boolean))].sort(),
            });
    }
    candidateContexts.sort((left, right) => bindingKey(left).localeCompare(bindingKey(right)));
    return {
        bindings: [...bindings.values()].sort((left, right) => bindingKey(left).localeCompare(bindingKey(right))),
        candidateContexts,
        ambiguous,
    };
}
function sameKeys(left, right) {
    const leftKeys = [...new Set(left.map(bindingKey))].sort();
    const rightKeys = [...new Set(right.map(bindingKey))].sort();
    return (leftKeys.length === left.length &&
        rightKeys.length === right.length &&
        leftKeys.length === rightKeys.length &&
        leftKeys.every((key, index) => key === rightKeys[index]));
}
export function createLlmCapabilitySelectionReceipt(input) {
    const receiptId = normalized(input.receiptId);
    if (!receiptId)
        throw new Error("Capability selection receipt ID is required.");
    return {
        schemaVersion: 1,
        receiptId,
        runId: normalized(input.decision.runId),
        capabilitySnapshotId: normalized(input.decision.capabilitySnapshotId),
        capabilitySnapshotFingerprint: input.decision.capabilitySnapshotFingerprint,
        decisionFingerprint: fingerprint(input.decision),
    };
}
export async function runLlmCapabilitySelectionProvider(input) {
    const providerInput = projectLlmCapabilitySelectionProviderInput({
        runId: input.runId,
        capabilitySnapshot: input.capabilitySnapshot,
        selectionContext: input.selectionContext,
    });
    const decision = await input.provider.selectCapability(providerInput);
    return {
        decision,
        receipt: createLlmCapabilitySelectionReceipt({ receiptId: input.receiptId, decision }),
    };
}
export function projectLlmCapabilitySelectionProviderInput(input) {
    const executable = executableSnapshotBindings(input.capabilitySnapshot);
    if (executable.ambiguous)
        throw new Error("Executable capability snapshot is ambiguous.");
    if (executable.bindings.length === 0) {
        throw new Error("Executable capability snapshot has no selection candidates.");
    }
    return {
        runId: normalized(input.runId),
        capabilitySnapshotId: normalized(input.capabilitySnapshot.snapshotId),
        capabilitySnapshotFingerprint: input.capabilitySnapshot.fingerprint,
        selectionContext: input.selectionContext,
        executableBindings: executable.bindings,
        candidateContexts: executable.candidateContexts,
    };
}
export function admitLlmCapabilitySelection(input) {
    if (input.userMethodSpecified) {
        return { status: "rejected", reasonCodes: ["user_method_constraint_requires_policy_path"] };
    }
    const reasonCodes = [];
    if (!validateLlmCapabilitySelectionDecision(input.decision).valid) {
        return { status: "rejected", reasonCodes: ["selection_schema_invalid"] };
    }
    if (normalized(input.decision.runId) !== normalized(input.runId)) {
        reasonCodes.push("run_scope_mismatch");
    }
    if (normalized(input.decision.capabilitySnapshotId) !==
        normalized(input.capabilitySnapshot.snapshotId) ||
        input.decision.capabilitySnapshotFingerprint !== input.capabilitySnapshot.fingerprint) {
        reasonCodes.push("snapshot_scope_mismatch");
    }
    if (!input.receipt) {
        reasonCodes.push("selection_receipt_required");
    }
    else if (input.receipt.schemaVersion !== 1 ||
        normalized(input.receipt.runId) !== normalized(input.decision.runId) ||
        normalized(input.receipt.capabilitySnapshotId) !==
            normalized(input.decision.capabilitySnapshotId) ||
        input.receipt.capabilitySnapshotFingerprint !== input.decision.capabilitySnapshotFingerprint ||
        input.receipt.decisionFingerprint !== fingerprint(input.decision)) {
        reasonCodes.push("selection_receipt_mismatch");
    }
    const executable = executableSnapshotBindings(input.capabilitySnapshot);
    if (executable.ambiguous)
        reasonCodes.push("ambiguous_executable_snapshot");
    if (executable.bindings.length === 0)
        reasonCodes.push("no_executable_candidates");
    if (!sameKeys(input.decision.comparedBindings, executable.bindings)) {
        reasonCodes.push("executable_candidates_mismatch");
    }
    const assessments = Array.isArray(input.decision.bindingAssessments)
        ? input.decision.bindingAssessments
        : [];
    if (!sameKeys(assessments, executable.bindings)) {
        reasonCodes.push("binding_assessments_mismatch");
    }
    const executableByKey = new Map(executable.bindings.map((binding) => [bindingKey(binding), binding]));
    if (assessments.some((assessment) => {
        const binding = executableByKey.get(bindingKey(assessment));
        const expectedPermission = binding?.risk === "safe"
            ? "allowed"
            : binding?.risk === "approval_required"
                ? "approval_required"
                : undefined;
        return expectedPermission !== undefined && assessment.permission !== expectedPermission;
    })) {
        reasonCodes.push("binding_assessment_snapshot_mismatch");
    }
    const selectedKey = bindingKey(input.decision.selectedBinding);
    if (!input.decision.comparedBindings.some((binding) => bindingKey(binding) === selectedKey)) {
        reasonCodes.push("selected_binding_not_compared");
    }
    const selectedBinding = executable.bindings.find((binding) => bindingKey(binding) === selectedKey);
    if (!selectedBinding)
        reasonCodes.push("selected_binding_unavailable");
    const selectedAssessment = assessments.find((assessment) => bindingKey(assessment) === selectedKey);
    if (selectedAssessment?.roleFit === "unfit")
        reasonCodes.push("selected_binding_role_unfit");
    if (selectedAssessment?.permission === "denied") {
        reasonCodes.push("selected_binding_permission_denied");
    }
    if (selectedAssessment &&
        !input.externalTransferAllowed &&
        (selectedAssessment.externalTransfer || selectedAssessment.dataExposure === "public")) {
        reasonCodes.push("external_transfer_not_allowed");
    }
    const costRank = { none: 0, low: 1, high: 2 };
    if (selectedAssessment && costRank[selectedAssessment.cost] > costRank[input.maxCost]) {
        reasonCodes.push("selection_cost_limit_exceeded");
    }
    const failedStrategies = new Set(input.failedStrategyFingerprints.map(normalized).filter(Boolean));
    if (selectedAssessment &&
        failedStrategies.has(normalized(selectedAssessment.strategyFingerprint))) {
        reasonCodes.push("failed_strategy_reselected");
    }
    else if (selectedAssessment &&
        failedStrategies.size > 0 &&
        !selectedAssessment.changedFromFailedStrategies) {
        reasonCodes.push("changed_strategy_evidence_missing");
    }
    if (reasonCodes.length > 0 || !input.receipt || !selectedBinding) {
        return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] };
    }
    return {
        status: selectedBinding.risk === "approval_required" ? "approval_required" : "allowed",
        receiptId: input.receipt.receiptId,
        selectedBinding,
    };
}
//# sourceMappingURL=llm-capability-selection.js.map