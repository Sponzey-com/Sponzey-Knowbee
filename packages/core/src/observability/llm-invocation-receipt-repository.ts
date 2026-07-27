import type {
  LlmInvocationReceipt,
  LlmInvocationReceiptRejectionReason,
} from "./llm-invocation-receipt.js"

export type LlmInvocationReceiptAppendResult =
  | { status: "stored"; inserted: boolean }
  | {
      status: "rejected"
      reasonCode: LlmInvocationReceiptRejectionReason | "receipt_conflict"
    }

export interface LlmInvocationReceiptQuery {
  runId?: string | undefined
  requestGroupId?: string | undefined
  limit?: number | undefined
}

export interface LlmInvocationReceiptRepository {
  append(receipt: LlmInvocationReceipt): LlmInvocationReceiptAppendResult
  list(query?: LlmInvocationReceiptQuery): readonly LlmInvocationReceipt[]
}
