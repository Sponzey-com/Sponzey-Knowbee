import { PROMPT_ROLLBACK_SOURCE_MANIFEST, validatePromptImprovementRollbackSource, } from "./prompt-rollback-source-policy.js";
import { PROMPT_ROLLBACK_VERIFICATION_METHODS, } from "./prompt-change-rollback-readiness.js";
import { REQUIRED_HARNESS_GUARDRAILS, } from "./harness-guardrails.js";
export const REQUIRED_PROMPT_IMPROVEMENT_REGRESSION_AREAS = [
    "identity",
    "delegation",
    "memory_isolation",
    "yeonjang",
    "prompt_activation",
];
const baselineRollbackManifest = PROMPT_ROLLBACK_SOURCE_MANIFEST.filter((entry) => entry.sourceType !== "release_artifact_version");
export const PROMPT_IMPROVEMENT_BASELINE_ROLLBACK_SOURCE_TYPES = baselineRollbackManifest.map((entry) => entry.sourceType);
function present(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function uniquePresent(values) {
    return values.length > 0
        && values.every(present)
        && new Set(values.map((value) => value.trim())).size === values.length;
}
function exactCoverage(expected, actual) {
    if (!uniquePresent(expected) || !uniquePresent(actual) || expected.length !== actual.length)
        return false;
    const expectedSet = new Set(expected);
    return actual.every((value) => expectedSet.has(value));
}
function validChecksum(value) {
    return /^(?:sha256:)?[a-f0-9]{64}$/iu.test(value.trim());
}
function validVersion(value) {
    return present(value) && !/^(?:latest|current|head)$/iu.test(value.trim());
}
function freezeArray(values) {
    return Object.freeze(values.map((value) => Object.freeze({ ...value })));
}
function freezeSourceBaselines(values) {
    return Object.freeze(values.map((value) => Object.freeze({
        ...value,
        summarySourceRefs: Object.freeze([...value.summarySourceRefs]),
    })));
}
function block(reasonCode) {
    return { status: "blocked", reasonCode };
}
export function authorizePromptImprovementBaselineCapture(input) {
    if (!present(input.runId) || !present(input.actor) || !present(input.triggerSource)) {
        return block("baseline_identity_invalid");
    }
    if (!Number.isFinite(input.capturedAt) || !Number.isFinite(input.draftRequestedAt)
        || input.capturedAt >= input.draftRequestedAt) {
        return block("baseline_not_before_draft");
    }
    if (!uniquePresent(input.targetPromptSources) && input.changeKind === "prompt") {
        return block("target_source_invalid");
    }
    if (input.changeKind === "prompt"
        && (input.targetHarnessSources.length > 0 || input.harnessGuardrails.length > 0)) {
        return block("harness_fields_not_allowed");
    }
    if (input.changeKind === "harness" && !uniquePresent(input.targetHarnessSources)) {
        return block("harness_target_required");
    }
    if (input.targetPromptSources.length > 0 && !uniquePresent(input.targetPromptSources)) {
        return block("target_source_invalid");
    }
    const targetSources = [...input.targetPromptSources, ...input.targetHarnessSources];
    if (!exactCoverage(targetSources, input.sourceBaselines.map((item) => item.sourceRef))) {
        return block("source_baseline_coverage_invalid");
    }
    const promptTargets = new Set(input.targetPromptSources);
    for (const source of input.sourceBaselines) {
        const expectedKind = promptTargets.has(source.sourceRef) ? "prompt" : "harness";
        if (source.sourceKind !== expectedKind || !validVersion(source.baselineVersion)
            || !validChecksum(source.beforeChecksum) || !present(source.summary) || !present(source.evidenceRef)
            || !Number.isFinite(source.capturedAt) || !Number.isFinite(source.sourceLastModifiedAt)) {
            return block("source_baseline_invalid");
        }
        if (source.summarySourceRefs.length !== 1 || source.summarySourceRefs[0] !== source.sourceRef) {
            return block("source_summary_scope_invalid");
        }
        if (source.sourceLastModifiedAt > source.capturedAt || source.capturedAt > input.capturedAt) {
            return block("source_checksum_not_pre_write");
        }
    }
    if (!input.activeHarness)
        return block("active_harness_missing");
    if (!validVersion(input.activeHarness.version) || !validChecksum(input.activeHarness.checksum)
        || !validChecksum(input.activeHarness.controllingChecksum) || !present(input.activeHarness.evidenceRef)
        || !Number.isFinite(input.activeHarness.capturedAt)) {
        return block("active_harness_invalid");
    }
    if (input.activeHarness.checksum !== input.activeHarness.controllingChecksum) {
        return block("active_harness_mismatch");
    }
    if (input.activeHarness.capturedAt > input.capturedAt
        || input.activeHarness.capturedAt >= input.draftRequestedAt) {
        return block("active_harness_not_pre_draft");
    }
    if (input.activationState !== "unchanged")
        return block("activation_state_invalid");
    const allowedAreas = new Set(REQUIRED_PROMPT_IMPROVEMENT_REGRESSION_AREAS);
    if (!uniquePresent(input.affectedAreas)
        || input.affectedAreas.some((area) => !allowedAreas.has(area))) {
        return block("affected_area_invalid");
    }
    if (!exactCoverage(input.affectedAreas, input.invariantSnapshots.map((item) => item.area))
        || input.invariantSnapshots.some((item) => !present(item.invariantRef) || !present(item.evidenceRef))) {
        return block("invariant_coverage_invalid");
    }
    if (!exactCoverage(input.affectedAreas, input.regressionTests.map((item) => item.area))
        || input.regressionTests.some((item) => !present(item.testRef) || !present(item.evidenceRef))) {
        return block("regression_test_coverage_invalid");
    }
    if (input.changeKind === "harness") {
        if (!exactCoverage(REQUIRED_HARNESS_GUARDRAILS, input.harnessGuardrails.map((item) => item.guardrail))
            || input.harnessGuardrails.some((item) => !present(item.currentRuleRef) || !present(item.evidenceRef))) {
            return block("harness_guardrail_coverage_invalid");
        }
    }
    if (!exactCoverage(targetSources, input.rollbackTargets.map((item) => item.targetSourceRef))) {
        return block("rollback_target_coverage_invalid");
    }
    const baselineBySource = new Map(input.sourceBaselines.map((item) => [item.sourceRef, item]));
    for (const rollback of input.rollbackTargets) {
        if (!validatePromptImprovementRollbackSource(rollback).ok)
            return block("rollback_source_invalid");
        if (!PROMPT_IMPROVEMENT_BASELINE_ROLLBACK_SOURCE_TYPES.includes(rollback.sourceType))
            return block("rollback_source_not_allowed");
        const baseline = baselineBySource.get(rollback.targetSourceRef);
        if (!baseline || rollback.targetBaselineVersion !== baseline.baselineVersion
            || rollback.targetBaselineChecksum !== baseline.beforeChecksum) {
            return block("rollback_baseline_mismatch");
        }
        if (!present(rollback.executorId))
            return block("rollback_executor_missing");
        if (!PROMPT_ROLLBACK_VERIFICATION_METHODS.includes(rollback.verificationMethod))
            return block("rollback_verification_missing");
        if (!present(rollback.evidenceRef))
            return block("rollback_evidence_missing");
    }
    const receipt = Object.freeze({
        schemaVersion: 1,
        state: "baseline_captured",
        runId: input.runId.trim(),
        actor: input.actor.trim(),
        triggerSource: input.triggerSource.trim(),
        changeKind: input.changeKind,
        capturedAt: input.capturedAt,
        draftRequestedAt: input.draftRequestedAt,
        targetPromptSources: Object.freeze([...input.targetPromptSources]),
        targetHarnessSources: Object.freeze([...input.targetHarnessSources]),
        sourceBaselines: freezeSourceBaselines(input.sourceBaselines),
        activeHarness: Object.freeze({ ...input.activeHarness }),
        affectedAreas: Object.freeze([...input.affectedAreas]),
        invariantSnapshots: freezeArray(input.invariantSnapshots),
        regressionTests: freezeArray(input.regressionTests),
        harnessGuardrails: freezeArray(input.harnessGuardrails),
        activationState: "unchanged",
        rollbackTargets: freezeArray(input.rollbackTargets),
    });
    return { status: "authorized", receipt };
}
export async function draftFromAuthorizedPromptImprovementBaseline(input) {
    if (input.decision.status !== "authorized") {
        return { status: "blocked", reasonCode: "baseline_not_authorized" };
    }
    const result = await input.draft(input.decision.receipt);
    return { status: "drafted", baseline: input.decision.receipt, result };
}
//# sourceMappingURL=prompt-improvement-baseline-capture.js.map