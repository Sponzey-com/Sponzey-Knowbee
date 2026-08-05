import type { LlmInvocationReceiptAppendResult, LlmInvocationReceiptQuery, LlmInvocationReceiptRepository } from "../observability/llm-invocation-receipt-repository.js";
import { type LlmInvocationReceipt } from "../observability/llm-invocation-receipt.js";
export declare class SqliteLlmInvocationReceiptRepository implements LlmInvocationReceiptRepository {
    append(receipt: LlmInvocationReceipt): LlmInvocationReceiptAppendResult;
    list(query?: LlmInvocationReceiptQuery): readonly LlmInvocationReceipt[];
}
//# sourceMappingURL=llm-invocation-receipt-repository.d.ts.map