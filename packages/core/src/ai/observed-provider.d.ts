import type { LlmInvocationReceiptRepository } from "../observability/llm-invocation-receipt-repository.js";
import type { AIChunk, AIProvider, ChatParams } from "./types.js";
export interface ObservedAIProviderOptions {
    repository: LlmInvocationReceiptRepository;
    now?: (() => number) | undefined;
    idProvider?: (() => string) | undefined;
    onDegraded?: ((error: unknown) => void) | undefined;
}
export declare class ObservedAIProvider implements AIProvider {
    private readonly provider;
    private readonly options;
    readonly id: string;
    readonly supportedModels: string[];
    private readonly now;
    private readonly idProvider;
    constructor(provider: AIProvider, options: ObservedAIProviderOptions);
    maxContextTokens(model: string): number;
    private append;
    chat(params: ChatParams): AsyncGenerator<AIChunk>;
}
//# sourceMappingURL=observed-provider.d.ts.map