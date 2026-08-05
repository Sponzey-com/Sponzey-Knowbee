import { loadPromptValue } from "../memory/prompt-fragments.js";
export const WEB_EVIDENCE_AI_OPERATIONS = [
    "web_source_selection",
    "web_chunk_selection",
    "web_evidence_compression",
    "web_evidence_review",
    "web_evidence_verification",
];
export class AiChatWebEvidencePipelineAdapter {
    options;
    constructor(options) {
        this.options = options;
    }
    async request(operation, input) {
        let rawOutput = "";
        for await (const chunk of this.options.provider.chat({
            model: this.options.model,
            system: this.options.promptSourceBlocks[operation],
            messages: [{
                    role: "user",
                    content: JSON.stringify({
                        kind: operation,
                        instruction: loadPromptValue(`${operation}_json_instruction_user`, {}, {
                            required: true,
                            ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
                        }),
                        input,
                    }),
                }],
            ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
            ...(this.options.observabilityContext ? {
                observability: {
                    ...this.options.observabilityContext,
                    stage: operation === "web_source_selection" || operation === "web_chunk_selection"
                        ? "planning"
                        : "review",
                    operationCode: operation,
                },
            } : {}),
        })) {
            if (chunk.type === "text_delta")
                rawOutput += chunk.delta;
        }
        try {
            const parsed = JSON.parse(rawOutput);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                return parsed;
        }
        catch {
            // Closed adapter errors never expose model output.
        }
        return {
            web_evidence_adapter_error: "invalid_json_object",
            operation,
        };
    }
    selectSources(input) {
        return this.request("web_source_selection", input);
    }
    selectChunks(input) {
        return this.request("web_chunk_selection", input);
    }
    compressEvidence(input) {
        return this.request("web_evidence_compression", input);
    }
    reviewEvidence(input) {
        return this.request("web_evidence_review", input);
    }
    verifyEvidence(input) {
        return this.request("web_evidence_verification", input);
    }
}
//# sourceMappingURL=web-evidence-pipeline-adapter.js.map