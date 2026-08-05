import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js"

export type YeonjangBrowserActiveTabInfoRustCapabilityMatrixField =
  | "permissionSetting"
  | "riskLevel"
  | "sideEffectClass"
  | "requiresApproval"
  | "requiresInteractiveDesktop"
  | "broadcastSafe"
  | "defaultTargetPolicy"
  | "rawPayloadVisibility"

export type YeonjangBrowserActiveTabInfoRustToolHealthSignal =
  | "capability_advertised"
  | "browser_read_permission"
  | "active_tab_observation_backend"
  | "audit_only_raw_details_schema"

export type YeonjangBrowserActiveTabInfoRustAuditOnlyRawDetailField =
  | "browserName"
  | "title"
  | "url"
  | "profileName"
  | "profilePath"
  | "pid"
  | "windowId"
  | "tabId"

export type YeonjangBrowserActiveTabInfoRustProhibitedPattern =
  | "raw_active_tab_public_output"
  | "system_exec_active_tab_bypass"
  | "browser_profile_file_scrape"
  | "default_live_smoke_inclusion"

export interface YeonjangBrowserActiveTabInfoRustInventoryContract {
  schemaVersion: "yeonjang-browser-active-tab-info-rust-inventory-contract-v1"
  method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method
  rustDispatchMethod: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method
  category: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.group
  permissionSetting: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.permissionSetting
  riskLevel: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.riskLevel
  sideEffectClass: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.sideEffectClass
  requiresApproval: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.requiresApproval
  requiresInteractiveDesktop: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.requiresInteractiveDesktop
  broadcastSafe: false
  defaultTargetPolicy: "exact_instance"
  defaultLiveSmokeAllowed: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.defaultLiveSmokeAllowed
  rawPayloadVisibility: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.rawPayloadVisibility
  addRustDispatchNow: false
  addCapabilityMatrixNow: true
  addToolHealthNow: true
  requiredCapabilityMatrixFields: YeonjangBrowserActiveTabInfoRustCapabilityMatrixField[]
  requiredToolHealthSignals: YeonjangBrowserActiveTabInfoRustToolHealthSignal[]
  auditOnlyRawDetailFields: YeonjangBrowserActiveTabInfoRustAuditOnlyRawDetailField[]
  prohibitedPatterns: YeonjangBrowserActiveTabInfoRustProhibitedPattern[]
}

const REQUIRED_CAPABILITY_MATRIX_FIELDS: YeonjangBrowserActiveTabInfoRustCapabilityMatrixField[] = [
  "permissionSetting",
  "riskLevel",
  "sideEffectClass",
  "requiresApproval",
  "requiresInteractiveDesktop",
  "broadcastSafe",
  "defaultTargetPolicy",
  "rawPayloadVisibility",
]

const REQUIRED_TOOL_HEALTH_SIGNALS: YeonjangBrowserActiveTabInfoRustToolHealthSignal[] = [
  "capability_advertised",
  "browser_read_permission",
  "active_tab_observation_backend",
  "audit_only_raw_details_schema",
]

const AUDIT_ONLY_RAW_DETAIL_FIELDS: YeonjangBrowserActiveTabInfoRustAuditOnlyRawDetailField[] = [
  "browserName",
  "title",
  "url",
  "profileName",
  "profilePath",
  "pid",
  "windowId",
  "tabId",
]

const PROHIBITED_PATTERNS: YeonjangBrowserActiveTabInfoRustProhibitedPattern[] = [
  "raw_active_tab_public_output",
  "system_exec_active_tab_bypass",
  "browser_profile_file_scrape",
  "default_live_smoke_inclusion",
]

export function buildYeonjangBrowserActiveTabInfoRustInventoryContract(_input: {
  auditOnlyDetails?: Record<string, unknown> | undefined
}): YeonjangBrowserActiveTabInfoRustInventoryContract {
  return {
    schemaVersion: "yeonjang-browser-active-tab-info-rust-inventory-contract-v1",
    method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
    rustDispatchMethod: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
    category: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.group,
    permissionSetting: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.permissionSetting,
    riskLevel: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.riskLevel,
    sideEffectClass: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.sideEffectClass,
    requiresApproval: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.requiresApproval,
    requiresInteractiveDesktop: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.requiresInteractiveDesktop,
    broadcastSafe: false,
    defaultTargetPolicy: "exact_instance",
    defaultLiveSmokeAllowed: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.defaultLiveSmokeAllowed,
    rawPayloadVisibility: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.rawPayloadVisibility,
    addRustDispatchNow: false,
    addCapabilityMatrixNow: true,
    addToolHealthNow: true,
    requiredCapabilityMatrixFields: [...REQUIRED_CAPABILITY_MATRIX_FIELDS],
    requiredToolHealthSignals: [...REQUIRED_TOOL_HEALTH_SIGNALS],
    auditOnlyRawDetailFields: [...AUDIT_ONLY_RAW_DETAIL_FIELDS],
    prohibitedPatterns: [...PROHIBITED_PATTERNS],
  }
}
