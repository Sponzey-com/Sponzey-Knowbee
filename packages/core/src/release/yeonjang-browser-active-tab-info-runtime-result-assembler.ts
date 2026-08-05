import type {
  YeonjangBrowserActiveTabInfoProjectionResult,
} from "../capabilities/yeonjang-browser-active-tab-info-contract.js"
import { projectYeonjangBrowserActiveTabInfo } from "../capabilities/yeonjang-browser-active-tab-info-contract.js"
import type {
  YeonjangBrowserActiveTabInfoToolHealthStatus,
} from "./yeonjang-browser-active-tab-info-readiness-source-adapter.js"
import type {
  YeonjangBrowserActiveTabInfoFinalResultProjection,
  YeonjangBrowserActiveTabInfoProductLogProjection,
  YeonjangBrowserActiveTabInfoVerificationStatus,
} from "./yeonjang-browser-active-tab-info-final-result-boundary.js"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "./yeonjang-browser-active-tab-info-final-result-boundary.js"

export type YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult =
  | {
      ok: true
      evidenceRef: string
      finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection
      productLogProjection: YeonjangBrowserActiveTabInfoProductLogProjection
      invokeNow: false
      addRustDispatchNow: false
      addProductionBindingNow: false
    }
  | {
      ok: false
      reasonCode:
        | Extract<YeonjangBrowserActiveTabInfoProjectionResult, { ok: false }>["reasonCode"]
        | "final_result_redaction_required"
        | "evidence_ref_required"
        | "evidence_ref_unsafe"
        | "product_log_evidence_ref_only"
      invokeNow: false
      addRustDispatchNow: false
      addProductionBindingNow: false
    }

export function assembleYeonjangBrowserActiveTabInfoRuntimeResult(input: {
  publicTargetName: string
  toolHealthStatus: YeonjangBrowserActiveTabInfoToolHealthStatus
  rawDetails: Record<string, unknown> | undefined
  verificationStatus: YeonjangBrowserActiveTabInfoVerificationStatus
  internalInstanceId?: string | undefined
  sessionId?: string | undefined
  clientId?: string | undefined
}): YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult {
  const observationResult = projectYeonjangBrowserActiveTabInfo({
    browserName: readString(input.rawDetails, "browserName"),
    title: readString(input.rawDetails, "title"),
    url: readString(input.rawDetails, "url"),
    profileName: readString(input.rawDetails, "profileName"),
    profilePath: readString(input.rawDetails, "profilePath"),
    pid: readNumber(input.rawDetails, "pid"),
    windowId: readString(input.rawDetails, "windowId"),
    tabId: readString(input.rawDetails, "tabId"),
    observationStatus: observationStatusFromToolHealth(input.toolHealthStatus),
  })
  if (!observationResult.ok) return blocked(observationResult.reasonCode)

  const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
    publicTargetName: input.publicTargetName,
    observation: observationResult.observation,
  })
  const finalResult = buildYeonjangBrowserActiveTabInfoFinalResultProjection({
    publicTargetName: input.publicTargetName,
    observation: observationResult.observation,
    evidenceRef,
    verificationStatus: input.verificationStatus,
  })
  if (!finalResult.ok) return blocked(finalResult.reasonCode)

  const productLog = buildYeonjangBrowserActiveTabInfoProductLogProjection({ evidenceRef })
  if (!productLog.ok) return blocked(productLog.reasonCode)

  return {
    ok: true,
    evidenceRef,
    finalProjection: finalResult.projection,
    productLogProjection: productLog.projection,
    invokeNow: false,
    addRustDispatchNow: false,
    addProductionBindingNow: false,
  }
}

function blocked(
  reasonCode: Extract<YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult, { ok: false }>["reasonCode"],
): Extract<YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult, { ok: false }> {
  return {
    ok: false,
    reasonCode,
    invokeNow: false,
    addRustDispatchNow: false,
    addProductionBindingNow: false,
  }
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === "string" ? value : undefined
}

function readNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === "number" ? value : undefined
}

function observationStatusFromToolHealth(
  status: YeonjangBrowserActiveTabInfoToolHealthStatus,
): "available" | "permission_required" | "unsupported" | "unknown" {
  switch (status) {
    case "ready":
      return "available"
    case "permission_disabled":
      return "permission_required"
    case "unsupported":
      return "unsupported"
    default:
      return "unknown"
  }
}
