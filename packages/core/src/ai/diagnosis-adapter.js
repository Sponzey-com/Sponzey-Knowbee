import { loadPromptValue } from "../memory/prompt-fragments.js";
import { createUntrustedEvidenceEnvelope, projectUntrustedEvidenceForPrompt, redactUntrustedEvidenceContent, } from "../security/trust-boundary.js";
import { collectStructuredToolAttempt } from "./structured-tool-attempt.js";
import { REQUEST_DIAGNOSIS_RESPONSE_TOOL, REQUEST_DIAGNOSIS_RESPONSE_TOOL_NAME, RESULT_DIAGNOSIS_RESPONSE_TOOL, RESULT_DIAGNOSIS_RESPONSE_TOOL_NAME, } from "./diagnosis-response-tools.js";
export class AiChatDiagnosisProviderAdapter {
    options;
    constructor(options) {
        this.options = options;
    }
    diagnoseRequest(input) {
        return this.runJsonPrompt("request_diagnosis", input);
    }
    diagnoseResult(input) {
        return this.runJsonPrompt("result_diagnosis", input);
    }
    repairDiagnosis(input) {
        return this.runJsonPrompt("schema_repair", input);
    }
    async runJsonPrompt(kind, input) {
        const promptInput = kind === "result_diagnosis"
            ? projectResultDiagnosisEvidence(input)
            : input;
        const promptPayload = {
            kind,
            instruction: loadPromptValue("diagnosis_json_instruction_user", {}, {
                required: true,
                ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
            }),
            input: promptInput,
        };
        const resultTarget = kind === "result_diagnosis" ||
            (kind === "schema_repair" &&
                input.target ===
                    "result_diagnosis");
        const responseTool = resultTarget
            ? RESULT_DIAGNOSIS_RESPONSE_TOOL
            : REQUEST_DIAGNOSIS_RESPONSE_TOOL;
        const responseToolName = resultTarget
            ? RESULT_DIAGNOSIS_RESPONSE_TOOL_NAME
            : REQUEST_DIAGNOSIS_RESPONSE_TOOL_NAME;
        const chatParams = {
            model: this.options.model,
            system: this.options.diagnosisPromptSourceBlock,
            messages: [{ role: "user", content: JSON.stringify(promptPayload) }],
            tools: [responseTool],
            toolChoice: "required",
            ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
            ...(this.options.observabilityContext
                ? {
                    observability: {
                        ...this.options.observabilityContext,
                        stage: kind === "request_diagnosis" ? "intake" : "review",
                        operationCode: kind,
                    },
                }
                : {}),
        };
        const result = await collectStructuredToolAttempt({
            stream: (signal) => this.options.provider.chat({
                ...chatParams,
                signal,
            }),
            deadlineMs: this.options.deadlineMs ?? 24_000,
            responseToolName,
            maxTextBytes: 4_096,
            maxToolInputBytes: 65_536,
        });
        return result.status === "parsed"
            ? result.value
            : { diagnosis_adapter_error: result.status };
    }
}
function projectResultDiagnosisEvidence(input) {
    const redaction = redactUntrustedEvidenceContent(JSON.stringify(input));
    return projectUntrustedEvidenceForPrompt(createUntrustedEvidenceEnvelope({
        sourceKind: input.evidenceSourceKind ?? "tool",
        sourceRef: `result-diagnosis:${input.workId ?? "unscoped"}:${input.stepId}`,
        contentLabel: "Result evidence for diagnosis",
        ownerScope: { ownerType: "system", ownerId: `diagnosis:${input.workId ?? "unscoped"}` },
        content: redaction.content,
        redactionState: "redacted",
    }));
}
//# sourceMappingURL=diagnosis-adapter.js.map