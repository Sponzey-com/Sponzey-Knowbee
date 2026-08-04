import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
import { getToolDispatcher } from "../tools/runtime-dispatcher.js";
import { buildSuccessfulToolEvidenceFromYeonjangGoalValidation } from "./completion-evidence-adapter.js";
import { validateRuntimeYeonjangSideEffectGoal, } from "./side-effect-goal-validation-runtime.js";
export function collectYeonjangSideEffectGoalValidationCandidate(input) {
    if (input.success)
        return false;
    const details = record(input.details);
    if (!details)
        return false;
    if (details.kind !== "side_effect_manual_intervention")
        return false;
    if (details.goalValidationCandidate !== true)
        return false;
    if (typeof details.operationId !== "string" || !details.operationId.trim())
        return false;
    if (sanitizedAttemptFailure(details.failure)
        && !sanitizedRecoveryEvidence(details.recoveryEvidence)) {
        return false;
    }
    input.candidates.push({
        toolName: input.toolName,
        output: input.output,
        details: input.details,
    });
    return true;
}
export function resolveRuntimeToolMetadataFromDispatcher(toolName) {
    let tool;
    try {
        tool = getToolDispatcher().get(toolName);
    }
    catch {
        return null;
    }
    if (!tool)
        return null;
    return resolveRuntimeToolMetadataFromTool(tool);
}
export function resolveRuntimeToolMetadataFromTool(tool) {
    const methodIds = (tool.runtimeMethodIds ?? []).map((value) => value.trim()).filter(Boolean);
    if (methodIds.length === 0)
        return null;
    if (!isYeonjangRiskLevel(tool.riskLevel))
        return null;
    return {
        methodIds,
        group: inferToolGroup(tool.name, methodIds),
        riskLevel: tool.riskLevel,
        requiresApproval: tool.requiresApproval,
    };
}
export async function validateAndAppendYeonjangSideEffectGoalValidationEvidence(input) {
    const skipped = [];
    if (input.candidates.length === 0)
        return { added: 0, skipped };
    if (!input.provider) {
        for (const candidate of input.candidates) {
            skipped.push({ toolName: candidate.toolName, reasonCode: "provider_missing" });
        }
        return { added: 0, skipped };
    }
    const resolveToolMetadata = input.resolveToolMetadata ?? resolveRuntimeToolMetadataFromDispatcher;
    const validateRuntimeGoal = input.validateRuntimeGoal ?? validateRuntimeYeonjangSideEffectGoal;
    let added = 0;
    for (const candidate of input.candidates) {
        const metadata = resolveToolMetadata(candidate.toolName);
        if (!metadata) {
            skipped.push({ toolName: candidate.toolName, reasonCode: "tool_metadata_missing" });
            continue;
        }
        if (metadata.methodIds.length === 0) {
            skipped.push({ toolName: candidate.toolName, reasonCode: "tool_metadata_invalid" });
            continue;
        }
        const validationInput = {
            db: input.db,
            manualResultDetails: buildSanitizedManualResultDetails(candidate.details),
            expectedRunId: input.runId,
            expectedWorkId: canonicalWorkIdForRootRun(input.runId),
            provider: input.provider,
            ownerAgentName: input.ownerAgentName,
            toolName: candidate.toolName,
            methodIds: metadata.methodIds,
            group: metadata.group,
            riskLevel: metadata.riskLevel,
            requiresApproval: metadata.requiresApproval,
            targetRef: `tool:${candidate.toolName}:side-effect-goal`,
            userRequestSummary: input.originalRequest,
            expectedOutput: buildExpectedOutput(input.originalRequest, input.completionConditions),
            publicToolOutput: candidate.output,
            sanitizedObservedStateSummary: buildSanitizedObservedStateSummary(candidate),
            risks: ["manual_side_effect_goal_validation_requires_llm_diagnosis"],
        };
        const validation = await validateRuntimeGoal(validationInput);
        if (validation.status !== "validated") {
            skipped.push({
                toolName: candidate.toolName,
                reasonCode: "candidate_not_validated",
                detail: validation.reasonCode,
            });
            continue;
        }
        input.successfulTools.push(buildSuccessfulToolEvidenceFromYeonjangGoalValidation({
            evidence: validation.evidence,
            output: `${candidate.toolName} 목표 검증 완료`,
        }));
        added += 1;
    }
    return { added, skipped };
}
function buildExpectedOutput(originalRequest, completionConditions) {
    const conditions = completionConditions.map((value) => value.trim()).filter(Boolean);
    if (conditions.length > 0)
        return conditions.join("\n");
    return originalRequest.trim() || "The requested side effect goal is satisfied.";
}
function buildSanitizedObservedStateSummary(candidate) {
    const output = candidate.output.trim();
    const details = record(candidate.details);
    const recoveryEvidence = sanitizedRecoveryEvidence(details?.recoveryEvidence);
    const failure = sanitizedAttemptFailure(details?.failure);
    return [
        `tool_name: ${candidate.toolName}`,
        "manual_intervention_result: true",
        output ? `public_tool_output: ${output}` : "",
        recoveryEvidence ? `artifact_ref: ${recoveryEvidence.artifactRef}` : "",
        recoveryEvidence ? `artifact_mime: ${recoveryEvidence.mimeType}` : "",
        recoveryEvidence ? `artifact_size_bytes: ${recoveryEvidence.sizeBytes}` : "",
        recoveryEvidence ? `post_check_reason: ${recoveryEvidence.reasonCode}` : "",
        recoveryEvidence
            ? `resolved_device_present: ${recoveryEvidence.resolvedDevicePresent ? "true" : "false"}`
            : "",
        failure ? `command_failure_reason: ${failure.reasonCode}` : "",
        failure ? `command_terminal_stage: ${failure.terminalStage}` : "",
        failure ? `command_retry_safety: ${failure.retrySafety}` : "",
    ].filter(Boolean).join("\n");
}
function buildSanitizedManualResultDetails(details) {
    const value = record(details);
    if (!value)
        return {};
    const recoveryEvidence = sanitizedRecoveryEvidence(value.recoveryEvidence);
    const failure = sanitizedAttemptFailure(value.failure);
    return {
        kind: value.kind,
        ...(typeof value.operationId === "string" ? { operationId: value.operationId } : {}),
        ...(typeof value.reasonCode === "string" ? { reasonCode: value.reasonCode } : {}),
        ...(value.goalValidationCandidate === true ? { goalValidationCandidate: true } : {}),
        ...(failure ? { failure } : {}),
        ...(recoveryEvidence ? { recoveryEvidence } : {}),
    };
}
function sanitizedAttemptFailure(value) {
    const failure = record(value);
    const allowedReasons = new Set([
        "camera_response_timeout",
        "camera_handler_timeout",
        "camera_helper_timeout",
        "camera_capture_timeout",
        "camera_busy",
        "camera_capture_cancelled",
        "camera_permission_denied",
        "camera_permission_restricted",
        "camera_permission_not_determined",
    ]);
    const allowedStages = new Set([
        "response_timeout",
        "handler_timeout",
        "helper_timeout",
        "handler_failed",
        "cancelled",
        "rejected",
    ]);
    const allowedRetrySafety = new Set([
        "safe_same_command",
        "change_strategy",
        "unknown_effect_state",
        "completed",
    ]);
    if (typeof failure?.reasonCode !== "string"
        || !allowedReasons.has(failure.reasonCode)
        || typeof failure.terminalStage !== "string"
        || !allowedStages.has(failure.terminalStage)
        || typeof failure.retrySafety !== "string"
        || !allowedRetrySafety.has(failure.retrySafety)
        || failure.retrySameStrategy !== false) {
        return undefined;
    }
    return {
        reasonCode: failure.reasonCode,
        terminalStage: failure.terminalStage,
        retrySafety: failure.retrySafety,
        retrySameStrategy: false,
    };
}
function sanitizedRecoveryEvidence(value) {
    const evidence = record(value);
    if (evidence?.kind !== "artifact_candidate" ||
        typeof evidence.artifactRef !== "string" ||
        !/^artifact:[0-9a-f-]{36}$/iu.test(evidence.artifactRef) ||
        typeof evidence.mimeType !== "string" ||
        !["image/jpeg", "image/png", "image/webp"].includes(evidence.mimeType) ||
        typeof evidence.sizeBytes !== "number" ||
        !Number.isSafeInteger(evidence.sizeBytes) ||
        evidence.sizeBytes <= 0 ||
        typeof evidence.reasonCode !== "string" ||
        ![
            "camera_resolved_device_missing",
            "camera_resolved_device_mismatch",
            "camera_device_constraint_evidence_missing",
        ].includes(evidence.reasonCode) ||
        typeof evidence.resolvedDevicePresent !== "boolean") {
        return undefined;
    }
    return {
        kind: "artifact_candidate",
        artifactRef: evidence.artifactRef,
        mimeType: evidence.mimeType,
        sizeBytes: evidence.sizeBytes,
        reasonCode: evidence.reasonCode,
        resolvedDevicePresent: evidence.resolvedDevicePresent,
    };
}
function inferToolGroup(toolName, methodIds) {
    const methodGroup = methodIds[0]?.split(".")[0]?.trim();
    if (methodGroup)
        return methodGroup;
    const nameGroup = toolName.split("_")[0]?.trim();
    return nameGroup || "side_effect";
}
function isYeonjangRiskLevel(value) {
    return value === "safe" || value === "moderate" || value === "dangerous";
}
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
//# sourceMappingURL=side-effect-goal-validation-review.js.map