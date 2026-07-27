import {
  admitWebChunkSelection,
  type WebChunkSelectionAdmission,
  type WebChunkSelectionSnapshot,
} from "../contracts/web-chunk-selection.js"

export {
  createWebChunkSelectionSnapshot,
} from "../contracts/web-chunk-selection.js"

export interface WebChunkSelectionPort {
  selectChunks(input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    snapshot: WebChunkSelectionSnapshot
    maxSelections: 1 | 2 | 3
  }>): Promise<unknown>
}

export async function selectWebResearchChunks(
  input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    snapshot: WebChunkSelectionSnapshot
    maxSelections?: 1 | 2 | 3
  }>,
  port: WebChunkSelectionPort,
): Promise<WebChunkSelectionAdmission> {
  const requestGoal = input.requestGoal.trim()
  const requiredFactKeys = Object.freeze(input.requiredFactKeys.map((key) => key.trim()))
  const maxSelections = input.maxSelections ?? 3
  if (
    !requestGoal ||
    requestGoal.length > 2_048 ||
    requiredFactKeys.length < 1 ||
    new Set(requiredFactKeys).size !== requiredFactKeys.length ||
    requiredFactKeys.some((key) => !key || key.length > 128) ||
    !Number.isInteger(maxSelections) ||
    maxSelections < 1 ||
    maxSelections > 3
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_receipt_invalid" })
  }
  let receipt: unknown
  try {
    receipt = await port.selectChunks(Object.freeze({
      requestGoal,
      requiredFactKeys,
      snapshot: input.snapshot,
      maxSelections,
    }))
  } catch {
    return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_receipt_invalid" })
  }
  return admitWebChunkSelection({
    receipt,
    snapshot: input.snapshot,
    requiredFactKeys,
    maxSelections,
  })
}
