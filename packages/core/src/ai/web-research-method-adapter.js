import { loadPromptValue } from "../memory/prompt-fragments.js";
export class AiChatWebResearchMethodProviderAdapter {
    options;
    constructor(options) {
        this.options = options;
    }
    async proposeNextAction(input) {
        let rawOutput = "";
        for await (const chunk of this.options.provider.chat({
            model: this.options.model,
            system: this.options.webResearchMethodPromptSourceBlock,
            messages: [
                {
                    role: "user",
                    content: JSON.stringify({
                        kind: "web_research_method",
                        instruction: loadPromptValue("web_research_method_json_instruction_user", {}, {
                            required: true,
                            ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
                        }),
                        input,
                    }),
                },
            ],
            ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
            ...(this.options.observabilityContext
                ? {
                    observability: {
                        ...this.options.observabilityContext,
                        stage: "planning",
                        operationCode: "web_research_method",
                    },
                }
                : {}),
        })) {
            if (chunk.type === "text_delta")
                rawOutput += chunk.delta;
        }
        try {
            const parsed = JSON.parse(rawOutput);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // The use case returns a closed typed failure without exposing model output.
        }
        return { web_research_method_adapter_error: "invalid_json_object" };
    }
}
//# sourceMappingURL=web-research-method-adapter.js.map