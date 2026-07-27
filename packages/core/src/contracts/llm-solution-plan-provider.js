import { createLlmSolutionPlanReceipt, } from "./llm-solution-plan-receipt.js";
const SOLUTION_PLAN_VALIDATION_ISSUES = [
    {
        code: "solution_plan_schema_invalid",
        path: "$",
        message: "Solution plan must match the scoped solution-plan schema.",
    },
];
function text(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function textList(values, field, allowEmpty = true) {
    if (!allowEmpty && values.length === 0)
        throw new Error(`${field} require at least one value.`);
    const normalized = values.map((value) => text(value, field));
    if (new Set(normalized).size !== normalized.length)
        throw new Error(`${field} must be unique.`);
    return normalized;
}
function providerPlan(value, ownerAgentName) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const candidate = value;
    if (candidate.ownerAgentName !== ownerAgentName ||
        !Array.isArray(candidate.steps) ||
        candidate.steps.length === 0)
        return undefined;
    return { ownerAgentName, steps: structuredClone(candidate.steps) };
}
function validateActionCapabilityRefs(plan, capabilityRefs) {
    const snapshotRefs = new Set(capabilityRefs);
    const selections = [];
    for (const step of plan.steps) {
        if (step.action_type !== "use_tool" && step.action_type !== "use_yeonjang")
            continue;
        const selectedRefs = [
            ...new Set(step.input_refs.map((reference) => reference.trim()).filter((reference) => reference.startsWith("capability:"))),
        ];
        if (selectedRefs.length === 0) {
            return { ok: false, reasonCode: "solution_plan_capability_ref_missing" };
        }
        if (selectedRefs.length > 1) {
            return { ok: false, reasonCode: "solution_plan_capability_ref_ambiguous" };
        }
        const selectedRef = selectedRefs[0];
        if (!selectedRef || !snapshotRefs.has(selectedRef)) {
            return { ok: false, reasonCode: "solution_plan_capability_ref_outside_snapshot" };
        }
        selections.push({ stepId: step.step_id.trim(), capabilityRef: selectedRef });
    }
    return { ok: true, selections };
}
function normalizeProviderInput(input) {
    return {
        workId: text(input.workId, "Work ID"),
        runId: text(input.runId, "Run ID"),
        ownerAgentName: text(input.ownerAgentName, "Owner agent name"),
        requestDiagnosisReceiptId: text(input.requestDiagnosisReceiptId, "Request diagnosis receipt ID"),
        goal: text(input.goal, "Goal"),
        constraints: textList(input.constraints, "Constraints"),
        capabilityRefs: textList(input.capabilityRefs, "Capability references").map((reference) => reference.startsWith("capability:") ? reference : `capability:${reference}`),
        completionCriteria: textList(input.completionCriteria, "Completion criteria", false),
    };
}
function resolvePlanOutput(input) {
    const plan = providerPlan(input.raw, input.providerInput.ownerAgentName);
    if (!plan) {
        return {
            status: "blocked",
            reasonCode: "invalid_solution_plan_output",
            workId: input.providerInput.workId,
            runId: input.providerInput.runId,
        };
    }
    const capabilityRefs = validateActionCapabilityRefs(plan, input.providerInput.capabilityRefs);
    if (!capabilityRefs.ok) {
        return {
            status: "blocked",
            reasonCode: capabilityRefs.reasonCode,
            workId: input.providerInput.workId,
            runId: input.providerInput.runId,
        };
    }
    try {
        const receipt = createLlmSolutionPlanReceipt({
            receiptId: `receipt:solution-plan:${input.providerInput.runId}:${input.issuedAt}`,
            workId: input.providerInput.workId,
            runId: input.providerInput.runId,
            requestDiagnosisReceiptId: input.providerInput.requestDiagnosisReceiptId,
            requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt,
            issuedAt: input.issuedAt,
            plan,
        });
        return {
            status: "valid",
            workId: input.providerInput.workId,
            runId: input.providerInput.runId,
            plan,
            receipt,
            capabilitySelections: capabilityRefs.selections,
        };
    }
    catch {
        return {
            status: "blocked",
            reasonCode: "invalid_solution_plan_receipt",
            workId: input.providerInput.workId,
            runId: input.providerInput.runId,
        };
    }
}
export async function runLlmSolutionPlanProvider(input) {
    const providerInput = normalizeProviderInput(input);
    const raw = await input.provider.planSolution(providerInput);
    return resolvePlanOutput({
        providerInput,
        raw,
        requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt,
        issuedAt: input.issuedAt,
    });
}
export async function runLlmSolutionPlanProviderWithRepair(input) {
    const providerInput = normalizeProviderInput(input);
    const raw = await input.provider.planSolution(providerInput);
    const initial = resolvePlanOutput({
        providerInput,
        raw,
        requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt,
        issuedAt: input.issuedAt,
    });
    if (initial.status === "valid")
        return { ...initial, repairAttempted: false };
    if (initial.reasonCode === "invalid_solution_plan_receipt" ||
        initial.reasonCode.startsWith("solution_plan_capability_ref_")) {
        return { ...initial, repairAttempted: false };
    }
    if (!input.repairProvider) {
        return {
            status: "blocked",
            reasonCode: "solution_plan_repair_provider_missing",
            workId: providerInput.workId,
            runId: providerInput.runId,
            repairAttempted: false,
            reanalysis: {
                action: "changed_strategy_reanalysis",
                failedInputRefs: ["llm-output:solution_plan", "llm-output:repaired_solution_plan"],
                failedStrategies: ["initial_llm_solution_plan", "schema_repair"],
            },
        };
    }
    const repairedRaw = await input.repairProvider.repairSolutionPlan({
        subject: providerInput,
        invalidRawOutput: raw,
        validationIssues: structuredClone(SOLUTION_PLAN_VALIDATION_ISSUES),
        failedInputRefs: ["llm-output:solution_plan"],
        failedStrategy: "initial_llm_solution_plan",
        repairAttemptNumber: 1,
    });
    const repaired = resolvePlanOutput({
        providerInput,
        raw: repairedRaw,
        requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt,
        issuedAt: input.issuedAt,
    });
    if (repaired.status === "valid")
        return { ...repaired, repairAttempted: true };
    return {
        status: "blocked",
        reasonCode: "invalid_solution_plan_after_schema_repair",
        workId: providerInput.workId,
        runId: providerInput.runId,
        repairAttempted: true,
        reanalysis: {
            action: "changed_strategy_reanalysis",
            failedInputRefs: ["llm-output:solution_plan", "llm-output:repaired_solution_plan"],
            failedStrategies: ["initial_llm_solution_plan", "schema_repair"],
        },
    };
}
//# sourceMappingURL=llm-solution-plan-provider.js.map