import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js"

export type YeonjangBrowserActiveTabInfoEvidenceVisibility = "raw" | "redacted" | "evidence_ref"

export type YeonjangBrowserActiveTabInfoEvidenceDestination =
  | "audit_record"
  | "readiness_route"
  | "diagnostics_route"
  | "pre_dispatch_preview"
  | "webui_state"
  | "product_log"
  | "field_debug_log"
  | "development_log"
  | "final_response"

export type YeonjangBrowserActiveTabInfoRawDetailField =
  | "browserName"
  | "title"
  | "url"
  | "profileName"
  | "profilePath"
  | "pid"
  | "windowId"
  | "tabId"

export type YeonjangBrowserActiveTabInfoPublicUseRule =
  | "redacted_projection_only"
  | "redacted_observation_or_evidence_ref"
  | "evidence_reference_only"
  | "redacted_summary_only"

export interface YeonjangBrowserActiveTabInfoAuditEvidencePolicy {
  schemaVersion: "yeonjang-browser-active-tab-info-audit-evidence-boundary-v1"
  method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method
  rawEvidenceVisibility: "audit_only"
  retentionScope: "ephemeral_registry_snapshot"
  retentionOwner: "yeonjang_registry_tool_health"
  auditAccessMode: "explicit_audit_context_only"
  defaultLiveSmokeAllowed: false
  rawDetailFields: YeonjangBrowserActiveTabInfoRawDetailField[]
  publicRedactedFields: string[]
  prohibitedPublicFields: string[]
  publicDestinations: Record<
    Exclude<YeonjangBrowserActiveTabInfoEvidenceDestination, "audit_record">,
    YeonjangBrowserActiveTabInfoPublicUseRule
  >
}

export type YeonjangBrowserActiveTabInfoEvidenceUseValidation =
  | { ok: true }
  | {
      ok: false
      reasonCode:
        | "explicit_audit_context_required"
        | "raw_evidence_destination_forbidden"
        | "raw_field_unknown"
        | "public_field_not_redacted"
        | "product_log_evidence_ref_only"
      field?: string | undefined
    }

const RAW_DETAIL_FIELDS: YeonjangBrowserActiveTabInfoRawDetailField[] = [
  "browserName",
  "title",
  "url",
  "profileName",
  "profilePath",
  "pid",
  "windowId",
  "tabId",
]

const PUBLIC_REDACTED_FIELDS = [
  "schemaVersion",
  "method",
  "observationStatus",
  "browserName",
  "titleHash",
  "titleLength",
  "urlScheme",
  "urlHash",
  "urlLength",
  "publicEvidenceFields",
  "auditOnlyFields",
  "evidenceRef",
]

const PROHIBITED_PUBLIC_FIELDS = [
  "rawDetails",
  "rawDetailsSchema",
  "rawMqttPayload",
  "title",
  "url",
  "profileName",
  "profilePath",
  "pid",
  "windowId",
  "tabId",
  "internalInstanceId",
  "sessionId",
  "clientId",
  "backendFamily",
  "candidateRawBackend",
  "profileDirectory",
  "browserProfilePath",
]

const PUBLIC_DESTINATIONS: YeonjangBrowserActiveTabInfoAuditEvidencePolicy["publicDestinations"] = {
  readiness_route: "redacted_projection_only",
  diagnostics_route: "redacted_projection_only",
  pre_dispatch_preview: "redacted_observation_or_evidence_ref",
  webui_state: "redacted_projection_only",
  product_log: "evidence_reference_only",
  field_debug_log: "evidence_reference_only",
  development_log: "evidence_reference_only",
  final_response: "redacted_summary_only",
}

const RAW_FIELD_SET = new Set<string>(RAW_DETAIL_FIELDS)
const PUBLIC_REDACTED_FIELD_SET = new Set<string>(PUBLIC_REDACTED_FIELDS)
const PROHIBITED_PUBLIC_FIELD_SET = new Set<string>(PROHIBITED_PUBLIC_FIELDS)

export function createYeonjangBrowserActiveTabInfoAuditEvidencePolicy():
  YeonjangBrowserActiveTabInfoAuditEvidencePolicy {
  return Object.freeze({
    schemaVersion: "yeonjang-browser-active-tab-info-audit-evidence-boundary-v1",
    method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
    rawEvidenceVisibility: "audit_only",
    retentionScope: "ephemeral_registry_snapshot",
    retentionOwner: "yeonjang_registry_tool_health",
    auditAccessMode: "explicit_audit_context_only",
    defaultLiveSmokeAllowed: false,
    rawDetailFields: [...RAW_DETAIL_FIELDS],
    publicRedactedFields: [...PUBLIC_REDACTED_FIELDS],
    prohibitedPublicFields: [...PROHIBITED_PUBLIC_FIELDS],
    publicDestinations: { ...PUBLIC_DESTINATIONS },
  })
}

export function validateYeonjangBrowserActiveTabInfoEvidenceUse(input: {
  destination: YeonjangBrowserActiveTabInfoEvidenceDestination
  visibility: YeonjangBrowserActiveTabInfoEvidenceVisibility
  explicitAuditContext: boolean
  fields: readonly string[]
}): YeonjangBrowserActiveTabInfoEvidenceUseValidation {
  if (input.visibility === "raw") {
    if (input.destination !== "audit_record") {
      return { ok: false, reasonCode: "raw_evidence_destination_forbidden" }
    }
    if (!input.explicitAuditContext) {
      return { ok: false, reasonCode: "explicit_audit_context_required" }
    }
    const unknownRawField = input.fields.find((field) => !RAW_FIELD_SET.has(field))
    if (unknownRawField) {
      return { ok: false, reasonCode: "raw_field_unknown", field: unknownRawField }
    }
    return { ok: true }
  }

  if (input.destination === "product_log" && input.visibility !== "evidence_ref") {
    return { ok: false, reasonCode: "product_log_evidence_ref_only" }
  }

  if (input.visibility === "evidence_ref") {
    const forbiddenEvidenceRefField = input.fields.find((field) => field !== "evidenceRef")
    if (forbiddenEvidenceRefField) {
      return { ok: false, reasonCode: "public_field_not_redacted", field: forbiddenEvidenceRefField }
    }
    return { ok: true }
  }

  const prohibitedField = input.fields.find((field) => (
    PROHIBITED_PUBLIC_FIELD_SET.has(field) || !PUBLIC_REDACTED_FIELD_SET.has(field)
  ))
  if (prohibitedField) {
    return { ok: false, reasonCode: "public_field_not_redacted", field: prohibitedField }
  }

  return { ok: true }
}
