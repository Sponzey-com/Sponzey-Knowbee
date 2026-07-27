import { authorizeDiagnosisActionRoute, transitionDiagnosisRouting, } from "./diagnosis-action-routing.js";
import { validateLlmSolutionPlanReceipt, } from "./llm-solution-plan-receipt.js";
function requireText(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function requireUniqueText(values, field) {
    const normalized = values.map((value) => requireText(value, field));
    if (new Set(normalized).size !== normalized.length)
        throw new Error(`${field} values must be unique.`);
    return normalized;
}
function assertCount(value, field) {
    if (!Number.isInteger(value) || value < 0)
        throw new Error(`${field} must be a non-negative integer.`);
}
function classify(complexity) {
    assertCount(complexity.toolCount, "toolCount");
    assertCount(complexity.subAgentCount, "subAgentCount");
    return complexity.toolCount > 1 ||
        complexity.subAgentCount > 0 ||
        complexity.usesYeonjang ||
        complexity.requiresApproval ||
        complexity.changesFiles ||
        complexity.longRunning
        ? "complex"
        : "simple";
}
function validateSteps(steps, classification) {
    if (classification === "simple" && steps.length !== 1) {
        throw new Error("Simple work requires exactly one execution step.");
    }
    if (classification === "complex" && steps.length < 2) {
        throw new Error("Complex work requires at least two explicit steps.");
    }
    const ids = new Set();
    return steps.map((step) => {
        const stepId = requireText(step.step_id, "Step ID");
        if (ids.has(stepId))
            throw new Error("Step IDs must be unique.");
        ids.add(stepId);
        const owner = requireText(step.owner_agent_name, "Step owner");
        const expectedOutput = requireText(step.expected_output, "Step expected output");
        const completionCriteria = requireText(step.completion_criteria, "Step completion criteria");
        const inputRefs = requireUniqueText(step.input_refs, "Step input references");
        if (inputRefs.length === 0)
            throw new Error("Step input references require at least one value.");
        if (step.status !== "pending")
            throw new Error("A new lifecycle plan requires pending steps.");
        return {
            ...step,
            step_id: stepId,
            owner_agent_name: owner,
            input_refs: inputRefs,
            expected_output: expectedOutput,
            completion_criteria: completionCriteria,
        };
    });
}
function requestPlanningStates() {
    const states = ["received"];
    states.push(transitionDiagnosisRouting(states.at(-1), "diagnosis_requested"));
    states.push(transitionDiagnosisRouting(states.at(-1), "request_diagnosed"));
    states.push(transitionDiagnosisRouting(states.at(-1), "route_selected"));
    return states;
}
export function planStructuredWorkLifecycle(input) {
    const workId = requireText(input.workId, "Work ID");
    const runId = requireText(input.runId ?? "", "Run ID");
    const ownerAgentName = requireText(input.ownerAgentName, "Owner agent name");
    const route = authorizeDiagnosisActionRoute({
        receipt: input.receipt,
        subjectPayload: input.subjectPayload,
        diagnosis: input.diagnosis,
    });
    const classification = classify(input.complexity);
    const solutionPlanReceipt = input.solutionPlanReceipt;
    const planValidation = validateLlmSolutionPlanReceipt({
        receipt: solutionPlanReceipt,
        workId,
        runId,
        requestDiagnosisReceiptId: route.receiptId,
        requestDiagnosisIssuedAt: input.requestDiagnosisIssuedAt ?? -1,
        plan: { ownerAgentName, steps: input.proposedSteps },
    });
    if (!planValidation.ok) {
        throw new Error(planValidation.reasonCode.replaceAll("_", " "));
    }
    if (!solutionPlanReceipt)
        throw new Error("solution plan receipt missing");
    const requestIntent = requireText(input.diagnosis.intent, "Request diagnosis intent");
    const missingInformation = requireUniqueText(input.diagnosis.missing_information, "Request missing information");
    const clarificationRequired = route.recommendedAction === "ask_clarification";
    if (clarificationRequired && missingInformation.length === 0) {
        throw new Error("A clarification route requires diagnosed missing information.");
    }
    return {
        workId,
        runId,
        ownerAgentName,
        classification,
        requestReceiptId: route.receiptId,
        solutionPlanReceiptId: solutionPlanReceipt.receiptId,
        requestIntent,
        missingInformation,
        clarificationRequired,
        requestAction: route.recommendedAction,
        steps: validateSteps(input.proposedSteps, classification),
        lifecycleStates: requestPlanningStates(),
    };
}
function validateStepResults(plan, results) {
    if (results.length !== plan.steps.length)
        throw new Error("Lifecycle projection requires a result for every planned step.");
    const plannedIds = new Set(plan.steps.map((step) => step.step_id));
    const resultIds = new Set();
    const outputRefs = [];
    const evidenceRefs = [];
    for (const result of results) {
        const stepId = requireText(result.stepId, "Result step ID");
        if (!plannedIds.has(stepId))
            throw new Error(`Result references unknown planned step ${stepId}.`);
        if (resultIds.has(stepId))
            throw new Error("Each planned step can have only one lifecycle result.");
        resultIds.add(stepId);
        outputRefs.push(requireText(result.outputRef, "Result output reference"));
        const evidence = requireUniqueText(result.evidenceRefs, "Result evidence references");
        if (evidence.length === 0)
            throw new Error("Each step result requires evidence.");
        evidenceRefs.push(...evidence);
    }
    return {
        stepIds: [...resultIds],
        outputRefs: requireUniqueText(outputRefs, "Result output references"),
        evidenceRefs: requireUniqueText(evidenceRefs, "Result evidence references"),
    };
}
function finalLifecycleState(states, action) {
    const current = states.at(-1);
    if (action === "stop_blocked") {
        const state = transitionDiagnosisRouting(current, "blocked_selected");
        return { state, status: "blocked" };
    }
    if (action === "ask_clarification") {
        const state = transitionDiagnosisRouting(current, "clarification_selected");
        return { state, status: "awaiting_user" };
    }
    if (action === "final_report" || action === "partial_report") {
        const state = transitionDiagnosisRouting(current, "execution_completed");
        return { state, status: "completed" };
    }
    const state = transitionDiagnosisRouting(current, "execution_started");
    return { state, status: "running" };
}
export function projectStructuredWorkLifecycle(input) {
    const references = validateStepResults(input.plan, input.stepResults);
    const route = authorizeDiagnosisActionRoute({
        receipt: input.resultReceipt,
        subjectPayload: input.resultSubjectPayload,
        diagnosis: input.resultDiagnosis,
    });
    const states = [...input.plan.lifecycleStates];
    states.push(transitionDiagnosisRouting(states.at(-1), "execution_started"));
    states.push(transitionDiagnosisRouting(states.at(-1), "execution_result_received"));
    states.push(transitionDiagnosisRouting(states.at(-1), "result_diagnosed"));
    states.push(transitionDiagnosisRouting(states.at(-1), "next_action_selected"));
    const terminal = finalLifecycleState(states, input.resultDiagnosis.recommended_action);
    states.push(terminal.state);
    const trace = input.plan.classification === "simple"
        ? [
            {
                workId: input.plan.workId,
                phase: "input",
                reasonCode: "request_diagnosis_received",
                stepIds: [],
                referenceIds: [input.plan.requestReceiptId],
            },
            {
                workId: input.plan.workId,
                phase: "decision",
                reasonCode: "solution_plan_received",
                stepIds: input.plan.steps.map((step) => step.step_id),
                referenceIds: [input.plan.solutionPlanReceiptId],
            },
            {
                workId: input.plan.workId,
                phase: "decision",
                reasonCode: `simple_route_${input.plan.requestAction}_step_validated`,
                stepIds: input.plan.steps.map((step) => step.step_id),
                referenceIds: [input.plan.requestReceiptId],
            },
            {
                workId: input.plan.workId,
                phase: "execution",
                reasonCode: "step_results_received",
                stepIds: references.stepIds,
                referenceIds: references.outputRefs,
            },
            {
                workId: input.plan.workId,
                phase: "validation",
                reasonCode: "result_diagnosis_received",
                stepIds: references.stepIds,
                referenceIds: [route.receiptId, ...references.evidenceRefs],
            },
            {
                workId: input.plan.workId,
                phase: "output",
                reasonCode: `simple_output_${route.recommendedAction}_${terminal.status}`,
                stepIds: [],
                referenceIds: [route.receiptId, ...references.outputRefs],
            },
        ]
        : [
            {
                workId: input.plan.workId,
                phase: "input",
                reasonCode: "request_diagnosis_received",
                stepIds: [],
                referenceIds: [input.plan.requestReceiptId],
            },
            {
                workId: input.plan.workId,
                phase: "decision",
                reasonCode: "solution_plan_received",
                stepIds: input.plan.steps.map((step) => step.step_id),
                referenceIds: [input.plan.solutionPlanReceiptId],
            },
            {
                workId: input.plan.workId,
                phase: "decision",
                reasonCode: "work_classified_complex",
                stepIds: [],
                referenceIds: [],
            },
            {
                workId: input.plan.workId,
                phase: "decision",
                reasonCode: "step_plan_validated",
                stepIds: input.plan.steps.map((step) => step.step_id),
                referenceIds: [],
            },
            {
                workId: input.plan.workId,
                phase: "execution",
                reasonCode: "step_results_received",
                stepIds: references.stepIds,
                referenceIds: references.outputRefs,
            },
            {
                workId: input.plan.workId,
                phase: "validation",
                reasonCode: "result_diagnosis_received",
                stepIds: references.stepIds,
                referenceIds: [route.receiptId, ...references.evidenceRefs],
            },
            {
                workId: input.plan.workId,
                phase: "decision",
                reasonCode: `next_action_${route.recommendedAction}`,
                stepIds: [],
                referenceIds: [route.receiptId],
            },
            {
                workId: input.plan.workId,
                phase: "output",
                reasonCode: `lifecycle_${terminal.status}`,
                stepIds: [],
                referenceIds: references.outputRefs,
            },
        ];
    return {
        workId: input.plan.workId,
        status: terminal.status,
        resultReceiptId: route.receiptId,
        lifecycleStates: states,
        trace,
        outputRefs: references.outputRefs,
        evidenceRefs: references.evidenceRefs,
    };
}
//# sourceMappingURL=structured-work-lifecycle.js.map