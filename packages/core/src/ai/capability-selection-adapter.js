import { loadPromptValue } from "../memory/prompt-fragments.js";
import { collectStructuredJsonAttempt, StructuredJsonAttemptError, } from "./structured-json-attempt.js";
export class AiChatCapabilitySelectionProviderAdapter {
    options;
    constructor(options) {
        this.options = options;
    }
    async selectCapability(input) {
        const result = await this.attemptCapabilitySelection(input);
        if (result.status === "completed") {
            return result.output;
        }
        if (result.status === "invalid_output") {
            return {
                capability_selection_adapter_error: "invalid_json_object",
            };
        }
        throw new StructuredJsonAttemptError(result.reasonCode);
    }
    attemptCapabilitySelection(input) {
        return this.runAttempt({
            kind: "capability_selection",
            instruction: this.jsonInstruction(),
            input,
        }, "capability_selection");
    }
    repairCapabilitySelection(input) {
        return this.runAttempt({
            kind: "capability_selection_schema_repair",
            instruction: this.jsonInstruction(),
            repair: input,
        }, "capability_selection_schema_repair");
    }
    jsonInstruction() {
        return loadPromptValue("capability_selection_json_instruction_user", {}, {
            required: true,
            ...(this.options.workDir === undefined
                ? {}
                : { workDir: this.options.workDir }),
        });
    }
    async runAttempt(payload, operationCode) {
        const result = await collectStructuredJsonAttempt({
            provider: this.options.provider,
            chatParams: {
                model: this.options.model,
                system: this.options.capabilitySelectionPromptSourceBlock,
                messages: [
                    {
                        role: "user",
                        content: JSON.stringify(payload),
                    },
                ],
                ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
                ...(this.options.observabilityContext
                    ? {
                        observability: {
                            ...this.options.observabilityContext,
                            stage: "planning",
                            operationCode,
                        },
                    }
                    : {}),
            },
            deadlineMs: this.options.deadlineMs ?? 180_000,
            maxVisibleTextBytes: this.options.maxVisibleTextBytes ?? 65_536,
        });
        if (result.status === "parsed") {
            return { status: "completed", output: result.value };
        }
        if (result.status === "invalid_json" || result.status === "json_object_required") {
            return { status: "invalid_output", reasonCode: result.status };
        }
        if (result.status === "cancelled") {
            return { status: "cancelled", reasonCode: "cancelled" };
        }
        return { status: "failed", reasonCode: result.status };
    }
}
//# sourceMappingURL=capability-selection-adapter.js.map