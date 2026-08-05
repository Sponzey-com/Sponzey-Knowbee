import { LLM_INVOCATION_RECEIPT_SCHEMA_VERSION, } from "../observability/llm-invocation-receipt.js";
import { isAIProviderInvocationError } from "./provider-failure.js";
export class ObservedAIProvider {
    provider;
    options;
    id;
    supportedModels;
    now;
    idProvider;
    constructor(provider, options) {
        this.provider = provider;
        this.options = options;
        this.id = provider.id;
        this.supportedModels = provider.supportedModels;
        this.now = options.now ?? Date.now;
        this.idProvider = options.idProvider ?? (() => crypto.randomUUID());
    }
    maxContextTokens(model) {
        return this.provider.maxContextTokens(model);
    }
    append(receipt) {
        try {
            this.options.repository.append(receipt);
        }
        catch (error) {
            this.options.onDegraded?.(error);
        }
    }
    async *chat(params) {
        const { observability, ...providerParams } = params;
        if (!observability) {
            yield* this.provider.chat(providerParams);
            return;
        }
        const { invocationId: requestedInvocationId, ...invocationContext } = observability;
        const invocationId = requestedInvocationId?.trim() || this.idProvider();
        const startedAt = this.now();
        const base = {
            schemaVersion: LLM_INVOCATION_RECEIPT_SCHEMA_VERSION,
            invocationId,
            context: { ...invocationContext },
        };
        this.append({ ...base, phase: "started", at: startedAt });
        let inputTokens = 0;
        let outputTokens = 0;
        let terminalRecorded = false;
        const recordTerminal = (phase, reasonCode) => {
            if (terminalRecorded)
                return;
            terminalRecorded = true;
            const at = this.now();
            this.append({
                ...base,
                phase,
                at,
                durationMs: Math.max(0, at - startedAt),
                ...(phase === "completed" ? { inputTokens, outputTokens } : {}),
                ...(reasonCode ? { reasonCode } : {}),
            });
        };
        try {
            for await (const chunk of this.provider.chat(providerParams)) {
                if (chunk.type === "message_stop") {
                    inputTokens = normalizeTokenCount(chunk.usage.input_tokens);
                    outputTokens = normalizeTokenCount(chunk.usage.output_tokens);
                }
                yield chunk;
            }
            recordTerminal("completed");
        }
        catch (error) {
            recordTerminal(params.signal?.aborted ? "cancelled" : "failed", params.signal?.aborted
                ? "aborted"
                : isAIProviderInvocationError(error)
                    ? error.reasonCode
                    : "provider_error");
            throw error;
        }
        finally {
            if (!terminalRecorded)
                recordTerminal("cancelled", "consumer_closed");
        }
    }
}
function normalizeTokenCount(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(1_000_000_000, Math.floor(value)));
}
//# sourceMappingURL=observed-provider.js.map