const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
function normalizedUnique(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
function createExecutionScope(input) {
    const runId = input.runId.trim();
    const ownerAgentId = input.ownerAgentId.trim();
    const receiptId = input.receiptId.trim();
    const selectedCapabilityId = input.selectedCapabilityId.trim();
    const toolNames = normalizedUnique(input.toolNames);
    if (!runId ||
        !ownerAgentId ||
        !receiptId ||
        !selectedCapabilityId ||
        toolNames.length === 0 ||
        !SHA256_PATTERN.test(input.capabilitySnapshotFingerprint)) {
        return { ok: false, reasonCode: "run_scoped_admission_invalid" };
    }
    return {
        ok: true,
        scope: Object.freeze({
            schemaVersion: 1,
            kind: "tool_bundle_skill",
            runId,
            ownerAgentId,
            receiptId,
            capabilitySnapshotFingerprint: input.capabilitySnapshotFingerprint,
            selectedCapabilityId,
            ...(input.selectedCapabilityIds
                ? {
                    selectedCapabilityIds: Object.freeze(normalizedUnique(input.selectedCapabilityIds)),
                }
                : {}),
            ...(input.selectedTargetIds
                ? {
                    selectedTargetIds: Object.freeze(normalizedUnique(input.selectedTargetIds)),
                }
                : {}),
            ...(input.approvalRequiredCapabilityIds &&
                input.approvalRequiredCapabilityIds.length > 0
                ? {
                    approvalRequiredCapabilityIds: Object.freeze(normalizedUnique(input.approvalRequiredCapabilityIds)),
                }
                : {}),
            toolNames: Object.freeze(toolNames),
        }),
    };
}
export function createAdmittedCapabilityExecutionScope(input) {
    const ownerAgentId = input.ownerAgentId.trim();
    const selectedCapabilityId = input.admission.selectedBinding.capabilityId.trim();
    if (input.admission.selectedBinding.targetId.trim() !== ownerAgentId) {
        return { ok: false, reasonCode: "run_scoped_admission_owner_mismatch" };
    }
    if (input.selectedCandidateContext?.kind === "instruction_skill") {
        const candidate = input.selectedCandidateContext;
        if (candidate.capabilityId.trim() !== selectedCapabilityId ||
            candidate.targetId.trim() !== ownerAgentId ||
            !candidate.content.trim() ||
            !SHA256_PATTERN.test(candidate.checksum)) {
            return { ok: false, reasonCode: "run_scoped_instruction_invalid" };
        }
        const runId = input.runId.trim();
        const receiptId = input.admission.receiptId.trim();
        if (!runId ||
            !receiptId ||
            !selectedCapabilityId ||
            !SHA256_PATTERN.test(input.capabilitySnapshotFingerprint)) {
            return { ok: false, reasonCode: "run_scoped_admission_invalid" };
        }
        return {
            ok: true,
            scope: Object.freeze({
                schemaVersion: 1,
                kind: "instruction_skill",
                runId,
                ownerAgentId,
                receiptId,
                capabilitySnapshotFingerprint: input.capabilitySnapshotFingerprint,
                selectedCapabilityId,
                toolNames: Object.freeze([]),
                instruction: Object.freeze({
                    content: `${candidate.content}`,
                    checksum: candidate.checksum,
                }),
            }),
        };
    }
    const matchingDefinitions = input.skillDefinitions.filter((definition) => definition.capabilityId.trim() === selectedCapabilityId);
    if (matchingDefinitions.length > 1) {
        return { ok: false, reasonCode: "run_scoped_skill_definition_ambiguous" };
    }
    if (selectedCapabilityId.startsWith("skill:") && matchingDefinitions.length === 0) {
        return { ok: false, reasonCode: "run_scoped_skill_definition_missing" };
    }
    const matchingBindings = input.skillBindings?.filter((binding) => binding.capabilityId.trim() === selectedCapabilityId &&
        binding.targetId.trim() === ownerAgentId);
    if (matchingBindings && matchingBindings.length === 0) {
        return { ok: false, reasonCode: "run_scoped_skill_binding_missing" };
    }
    if (matchingBindings && matchingBindings.length > 1) {
        return { ok: false, reasonCode: "run_scoped_skill_binding_ambiguous" };
    }
    return createExecutionScope({
        runId: input.runId,
        ownerAgentId,
        receiptId: input.admission.receiptId,
        capabilitySnapshotFingerprint: input.capabilitySnapshotFingerprint,
        selectedCapabilityId,
        toolNames: matchingBindings?.[0]?.toolNames ??
            matchingDefinitions[0]?.toolNames ?? [selectedCapabilityId],
    });
}
export function createPolicyCapabilityExecutionScope(input) {
    return createExecutionScope({
        runId: input.runId,
        ownerAgentId: input.ownerAgentId,
        receiptId: input.policyReceiptId,
        capabilitySnapshotFingerprint: input.capabilitySnapshotFingerprint,
        selectedCapabilityId: "policy:explicit-method",
        toolNames: input.toolNames,
    });
}
export function createPolicyMethodCapabilityExecutionScope(input) {
    const ownerAgentId = input.ownerAgentId.trim();
    const methodToolNames = normalizedUnique(input.methodToolNames);
    const availableToolNames = new Set(normalizedUnique(input.availableToolNames));
    const admittedToolNames = new Set(methodToolNames.filter((toolName) => availableToolNames.has(toolName)));
    for (const methodToolName of methodToolNames) {
        const owningBundles = input.skillDefinitions.flatMap((definition) => {
            if (!definition.toolNames.map((toolName) => toolName.trim()).includes(methodToolName)) {
                return [];
            }
            const bindings = input.skillBindings.filter((binding) => binding.capabilityId.trim() === definition.capabilityId.trim() &&
                binding.targetId.trim() === ownerAgentId &&
                binding.status === "enabled" &&
                binding.sourceSupported);
            if (bindings.length !== 1)
                return [];
            const binding = bindings[0];
            if (!binding)
                return [];
            const toolNames = normalizedUnique(binding.toolNames ?? definition.toolNames);
            return toolNames.includes(methodToolName) ? [{ toolNames }] : [];
        });
        if (owningBundles.length !== 1)
            continue;
        for (const toolName of owningBundles[0]?.toolNames ?? []) {
            if (availableToolNames.has(toolName))
                admittedToolNames.add(toolName);
        }
    }
    return createExecutionScope({
        runId: input.runId,
        ownerAgentId,
        receiptId: input.policyReceiptId,
        capabilitySnapshotFingerprint: input.capabilitySnapshotFingerprint,
        selectedCapabilityId: "policy:method-constraint",
        toolNames: admittedToolNames.size > 0
            ? [...admittedToolNames]
            : methodToolNames,
    });
}
export function createSolutionPlanCapabilityExecutionScope(input) {
    const ownerAgentId = input.ownerAgentId.trim();
    const entries = input.descriptor.entries;
    if ((input.descriptor.outcome !== "allowed" &&
        input.descriptor.outcome !== "approval_required") ||
        !ownerAgentId ||
        entries.length === 0) {
        return { ok: false, reasonCode: "run_scoped_admission_owner_mismatch" };
    }
    const instructionMatches = entries.flatMap((entry) => (input.instructionSkills ?? []).filter((skill) => skill.capabilityId.trim() === entry.capabilityId.trim() &&
        skill.targetId.trim() === ownerAgentId));
    if (instructionMatches.length > 0) {
        if (entries.length !== 1 || instructionMatches.length !== 1) {
            return { ok: false, reasonCode: "run_scoped_instruction_invalid" };
        }
        const instruction = instructionMatches[0];
        const entry = entries[0];
        if (!instruction || !entry) {
            return { ok: false, reasonCode: "run_scoped_instruction_invalid" };
        }
        return createAdmittedCapabilityExecutionScope({
            runId: input.descriptor.runId,
            ownerAgentId,
            capabilitySnapshotFingerprint: input.descriptor.capabilitySnapshotFingerprint,
            admission: {
                status: "allowed",
                receiptId: input.descriptor.receiptId,
                selectedBinding: {
                    capabilityId: entry.capabilityId,
                    targetId: entry.targetId,
                    risk: instruction.risk,
                },
            },
            selectedCandidateContext: {
                kind: "instruction_skill",
                capabilityId: instruction.capabilityId,
                targetId: instruction.targetId,
                content: instruction.content,
                checksum: instruction.checksum,
            },
            skillDefinitions: input.skillDefinitions,
            skillBindings: input.skillBindings,
        });
    }
    const capabilityIds = normalizedUnique(entries.map((entry) => entry.capabilityId));
    const toolNames = [];
    for (const capabilityId of capabilityIds) {
        const definitions = input.skillDefinitions.filter((definition) => definition.capabilityId.trim() === capabilityId);
        if (definitions.length > 1) {
            return { ok: false, reasonCode: "run_scoped_skill_definition_ambiguous" };
        }
        const bindings = input.skillBindings.filter((binding) => binding.capabilityId.trim() === capabilityId &&
            binding.targetId.trim() === ownerAgentId);
        if (bindings.length > 1) {
            return { ok: false, reasonCode: "run_scoped_skill_binding_ambiguous" };
        }
        if (capabilityId.startsWith("skill:")) {
            if (definitions.length === 0) {
                return { ok: false, reasonCode: "run_scoped_skill_definition_missing" };
            }
            if (bindings.length === 0) {
                return { ok: false, reasonCode: "run_scoped_skill_binding_missing" };
            }
            const binding = bindings[0];
            if (!binding || binding.status !== "enabled" || !binding.sourceSupported) {
                return { ok: false, reasonCode: "run_scoped_skill_binding_invalid" };
            }
        }
        toolNames.push(...(bindings[0]?.toolNames ??
            definitions[0]?.toolNames ??
            [capabilityId]));
    }
    return createExecutionScope({
        runId: input.descriptor.runId,
        ownerAgentId,
        receiptId: input.descriptor.receiptId,
        capabilitySnapshotFingerprint: input.descriptor.capabilitySnapshotFingerprint,
        selectedCapabilityId: capabilityIds[0] ?? "",
        selectedCapabilityIds: capabilityIds,
        selectedTargetIds: normalizedUnique(entries.map((entry) => entry.targetId)),
        approvalRequiredCapabilityIds: input.descriptor.approvalRequiredCapabilityIds,
        toolNames,
    });
}
function scopeMatches(input) {
    return (input.scope.schemaVersion === 1 &&
        input.scope.runId === input.runId.trim() &&
        input.scope.ownerAgentId === input.ownerAgentId.trim() &&
        Boolean(input.scope.receiptId.trim()) &&
        SHA256_PATTERN.test(input.scope.capabilitySnapshotFingerprint) &&
        (input.scope.kind === "instruction_skill"
            ? input.scope.toolNames.length === 0 &&
                Boolean(input.scope.instruction.content.trim()) &&
                SHA256_PATTERN.test(input.scope.instruction.checksum)
            : input.scope.toolNames.length > 0));
}
export function projectRunScopedInstruction(input) {
    if (input.scope.kind !== "instruction_skill" || !scopeMatches(input))
        return null;
    return Object.freeze({
        capabilityId: input.scope.selectedCapabilityId,
        content: `${input.scope.instruction.content}`,
        checksum: input.scope.instruction.checksum,
    });
}
export function projectRunScopedToolNames(input) {
    if (!scopeMatches(input) || input.scope.kind === "instruction_skill")
        return [];
    const available = new Set(normalizedUnique(input.availableToolNames));
    return input.scope.toolNames.filter((toolName) => available.has(toolName));
}
export async function dispatchRunScopedTool(input) {
    const admitted = projectRunScopedToolNames({
        scope: input.scope,
        runId: input.runId,
        ownerAgentId: input.ownerAgentId,
        availableToolNames: [input.toolName],
    });
    if (admitted.length !== 1 || admitted[0] !== input.toolName.trim()) {
        return {
            success: false,
            output: "선택된 실행 범위에 포함되지 않은 도구입니다.",
            error: "run_scoped_tool_not_admitted",
        };
    }
    const targetBound = bindRunScopedTarget({
        scope: input.scope,
        toolName: input.toolName,
        params: input.params,
        tool: input.dispatcher.get(input.toolName),
    });
    if (!targetBound.ok) {
        return {
            success: false,
            output: "",
            error: targetBound.reasonCode,
        };
    }
    return input.dispatcher.dispatch(input.toolName, targetBound.params, input.context);
}
const TARGET_ID_PARAMETER_NAMES = [
    "extensionId",
    "targetId",
    "clientId",
];
function bindRunScopedTarget(input) {
    const targetIds = normalizedUnique(input.scope.selectedTargetIds ?? []);
    if (targetIds.length === 0)
        return { ok: true, params: input.params };
    if (targetIds.length !== 1) {
        return { ok: false, reasonCode: "run_scoped_target_ambiguous" };
    }
    const properties = input.tool?.parameters.properties ?? {};
    const targetParameter = TARGET_ID_PARAMETER_NAMES.find((parameterName) => Object.hasOwn(properties, parameterName));
    if (!targetParameter)
        return { ok: true, params: input.params };
    const admittedTargetId = targetIds[0];
    if (!admittedTargetId) {
        return { ok: false, reasonCode: "run_scoped_target_ambiguous" };
    }
    const requestedTargetId = input.params[targetParameter];
    if (requestedTargetId !== undefined &&
        (typeof requestedTargetId !== "string" ||
            requestedTargetId.trim() !== admittedTargetId)) {
        return { ok: false, reasonCode: "run_scoped_target_mismatch" };
    }
    return {
        ok: true,
        params: {
            ...input.params,
            [targetParameter]: admittedTargetId,
        },
    };
}
//# sourceMappingURL=run-scoped-tool-admission.js.map