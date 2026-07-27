import {
  admitWebSourceSelection,
  type WebSearchMetadataSnapshot,
  type WebSourceSelectionAdmission,
} from "../contracts/web-source-selection.js"

export {
  createWebSearchMetadataSnapshot,
} from "../contracts/web-source-selection.js"

export interface WebSourceSelectionPort {
  selectSources(input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    snapshot: WebSearchMetadataSnapshot
    maxSelections: number
  }>): Promise<unknown>
}

export async function selectWebResearchSources(
  input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    snapshot: WebSearchMetadataSnapshot
    maxSelections?: number
  }>,
  port: WebSourceSelectionPort,
): Promise<WebSourceSelectionAdmission> {
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
    maxSelections > 5
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_source_selection_receipt_invalid" })
  }

  let receipt: unknown
  try {
    receipt = await port.selectSources(Object.freeze({
      requestGoal,
      requiredFactKeys,
      snapshot: input.snapshot,
      maxSelections,
    }))
  } catch {
    return Object.freeze({ ok: false, reasonCode: "web_source_selection_receipt_invalid" })
  }
  return admitWebSourceSelection({
    receipt,
    snapshot: input.snapshot,
    requiredFactKeys,
    maxSelections,
  })
}
