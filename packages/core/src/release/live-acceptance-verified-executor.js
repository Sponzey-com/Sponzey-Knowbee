import { runExtensionLiveSmokeScenarios, } from "../runs/extension-live-smoke-runner.js";
import { runWebRetrievalLiveScenario } from "../runs/web-retrieval-live-runner.js";
import { getDefaultWebRetrievalLiveSmokeScenarios, runWebRetrievalLiveSmokeScenarios, } from "../runs/web-retrieval-smoke.js";
import { runYeonjangLiveSmokeScenarios, } from "../runs/yeonjang-live-smoke-runner.js";
import { runProductionLiveAcceptance } from "./live-acceptance-runtime-ports.js";
function validAge(value) {
    return Number.isSafeInteger(value) && value > 0;
}
function freezeWebScenarios(scenarios) {
    return Object.freeze(scenarios.map((scenario) => {
        const symbols = scenario.target.symbols ? [...scenario.target.symbols] : undefined;
        if (symbols)
            Object.freeze(symbols);
        const target = {
            ...scenario.target,
            ...(symbols ? { symbols } : {}),
        };
        const minimumMethods = [...scenario.minimumMethods];
        const completionConditions = [...scenario.completionConditions];
        Object.freeze(target);
        Object.freeze(minimumMethods);
        Object.freeze(completionConditions);
        return Object.freeze({
            ...scenario,
            target,
            minimumMethods,
            completionConditions,
        });
    }));
}
function requireRunId(value) {
    const runId = value.trim();
    if (!runId || runId.length > 256)
        throw new Error("live_verified_run_id_invalid");
    return runId;
}
const YEONJANG_DEFAULT_NO_PARAM_METHODS = Object.freeze(["node.capabilities", "system.info", "camera.list"]);
const YEONJANG_PATH_BACKED_METHODS = Object.freeze([
    "file.list",
    "disk.usage",
]);
const YEONJANG_PATH_REQUIRED_METHODS = Object.freeze([
    "file.metadata",
    "file.list",
    "file.read",
    "file.search",
    "disk.info",
    "disk.usage",
    "disk.exists",
]);
function pathParams(selection) {
    const value = selection.scenario.params?.path;
    if (typeof value !== "string" || value.trim().length === 0)
        return null;
    return Object.freeze({ path: value });
}
function cloneYeonjangSelection(input) {
    return Object.freeze({
        scenario: Object.freeze({
            id: `live-acceptance:yeonjang-${input.method.replaceAll(".", "-")}`,
            expectedInstanceId: input.base.scenario.expectedInstanceId,
            expectedSessionId: input.base.scenario.expectedSessionId,
            expectedMethod: input.method,
            ...(input.params ? { params: input.params } : {}),
            readOnly: true,
        }),
        instance: input.base.instance,
    });
}
export function expandYeonjangLiveAcceptanceSelections(selection) {
    const expanded = [];
    const seen = new Set();
    const add = (method, params) => {
        if (seen.has(method))
            return;
        seen.add(method);
        expanded.push(cloneYeonjangSelection({ base: selection, method, ...(params ? { params } : {}) }));
    };
    for (const method of YEONJANG_DEFAULT_NO_PARAM_METHODS)
        add(method);
    const fileDiskParams = pathParams(selection);
    if (fileDiskParams) {
        for (const method of YEONJANG_PATH_BACKED_METHODS)
            add(method, fileDiskParams);
    }
    if (!seen.has(selection.scenario.expectedMethod) &&
        (fileDiskParams || !YEONJANG_PATH_REQUIRED_METHODS.includes(selection.scenario.expectedMethod))) {
        const params = fileDiskParams && selection.scenario.params ? selection.scenario.params : undefined;
        add(selection.scenario.expectedMethod, params);
    }
    return Object.freeze(expanded);
}
export function createVerifiedLiveAcceptanceExecutor(input) {
    const maxPreflightAgeMs = input.maxPreflightAgeMs;
    const maxWebSourceAgeMs = input.maxWebSourceAgeMs;
    const maxYeonjangSessionAgeMs = input.maxYeonjangSessionAgeMs;
    const maxEvidenceAgeMs = input.maxEvidenceAgeMs;
    const maxYeonjangInstanceAgeMs = input.maxYeonjangInstanceAgeMs;
    const failurePolicy = input.failurePolicy;
    const ages = [
        maxPreflightAgeMs,
        maxWebSourceAgeMs,
        maxYeonjangSessionAgeMs,
        maxEvidenceAgeMs,
        maxYeonjangInstanceAgeMs,
    ];
    const webScenarios = freezeWebScenarios(input.webScenarios ?? getDefaultWebRetrievalLiveSmokeScenarios());
    if (ages.some((value) => !validAge(value)) ||
        (failurePolicy !== "continue_diagnostics" && failurePolicy !== "stop_on_failure") ||
        webScenarios.length === 0 ||
        new Set(webScenarios.map((scenario) => scenario.id)).size !== webScenarios.length) {
        throw new Error("live_verified_executor_config_invalid");
    }
    const channels = input.channels;
    const webSearch = input.web.search;
    const webFetch = input.web.fetch;
    const extensionExecute = input.extensions;
    const yeonjangExecute = input.yeonjang;
    const webPlan = input.llm.webPlan;
    const webDiagnosis = input.llm.webDiagnosis;
    const webRediagnosis = input.llm.webRediagnosis;
    const extensionDiagnosis = input.llm.extensionDiagnosis;
    const yeonjangDiagnosis = input.llm.yeonjangDiagnosis;
    const requestSink = input.requestSink;
    const createRunId = input.createRunId;
    return async (context) => {
        const fixedClock = () => new Date(context.observedAt);
        return runProductionLiveAcceptance({
            candidate: context.candidate,
            approval: context.approval,
            preflight: Object.freeze({
                capturedAt: context.preflight.snapshotCapturedAt,
                stages: Object.freeze({
                    channels: Object.freeze({ status: "ready" }),
                    web: Object.freeze({ status: "ready" }),
                    extensions: Object.freeze({ status: "ready" }),
                    yeonjang: Object.freeze({ status: "ready" }),
                }),
            }),
            executors: Object.freeze({
                channels,
                web: async () => runWebRetrievalLiveSmokeScenarios({
                    mode: "live-run",
                    liveEnabled: true,
                    scenarios: [...webScenarios],
                    now: fixedClock(),
                    clock: fixedClock,
                    executeScenario: (scenario) => runWebRetrievalLiveScenario({
                        runId: requireRunId(createRunId({ stage: "web", scenarioId: scenario.id })),
                        scenario,
                        search: webSearch,
                        plan: webPlan,
                        fetch: webFetch,
                        diagnose: webDiagnosis,
                        rediagnose: webRediagnosis,
                        maxAttempts: 3,
                        signal: context.signal,
                    }),
                }),
                extensions: async () => runExtensionLiveSmokeScenarios({
                    runId: requireRunId(createRunId({ stage: "extensions" })),
                    selections: context.preflight.extensions,
                    execute: extensionExecute,
                    diagnose: extensionDiagnosis,
                    now: () => context.observedAt,
                    signal: context.signal,
                }),
                yeonjang: async () => runYeonjangLiveSmokeScenarios({
                    runId: requireRunId(createRunId({ stage: "yeonjang" })),
                    selections: expandYeonjangLiveAcceptanceSelections(context.preflight.yeonjang),
                    execute: yeonjangExecute,
                    diagnose: yeonjangDiagnosis,
                    maxInstanceAgeMs: maxYeonjangInstanceAgeMs,
                    now: () => context.observedAt,
                    signal: context.signal,
                }),
            }),
            maxPreflightAgeMs,
            maxWebSourceAgeMs,
            maxYeonjangSessionAgeMs,
            maxEvidenceAgeMs,
            failurePolicy,
            requestedKeyId: context.requestedKeyId,
            requestSink,
            now: context.observedAt,
            isCancelled: () => context.signal.aborted,
        });
    };
}
//# sourceMappingURL=live-acceptance-verified-executor.js.map