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
    return [
        `tool_name: ${candidate.toolName}`,
        "manual_intervention_result: true",
        output ? `public_tool_output: ${output}` : "",
    ].filter(Boolean).join("\n");
}
function buildSanitizedManualResultDetails(details) {
    const value = record(details);
    if (!value)
        return {};
    return {
        kind: value.kind,
        ...(typeof value.operationId === "string" ? { operationId: value.operationId } : {}),
        ...(typeof value.reasonCode === "string" ? { reasonCode: value.reasonCode } : {}),
        ...(value.goalValidationCandidate === true ? { goalValidationCandidate: true } : {}),
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