import type { PersistedConfigPaths } from "../config/persisted-file.js"
import { readPersistedRawConfig, writePersistedRawConfig } from "../config/persisted-file.js"
import type { KnowbeeConfig } from "../config/types.js"

export type UiMode = "beginner" | "advanced" | "admin"
export type PreferredUiMode = "beginner" | "advanced"

export interface UiModeState {
  mode: UiMode
  preferredUiMode: PreferredUiMode
  availableModes: UiMode[]
  adminEnabled: boolean
  canSwitchInUi: boolean
  schemaVersion: 1
}

export interface AdminUiActivationInput {
  env?: Record<string, string | undefined>
  argv?: readonly string[]
  configEnabled?: boolean
  nodeEnv?: string
}

export interface AdminUiActivation {
  enabled: boolean
  configEnabled: boolean
  runtimeFlagEnabled: boolean
  envEnabled: boolean
  cliEnabled: boolean
  localDevScriptEnabled: boolean
  productionMode: boolean
  reason: "disabled" | "enabled_by_runtime_flag" | "enabled_by_local_dev_script" | "enabled_by_config_and_runtime_flag" | "blocked_by_production_config_gate"
}

export interface UiModeRollbackActivationInput {
  env?: Record<string, string | undefined>
}

export interface UiModeRollbackActivation {
  enabled: boolean
  envEnabled: boolean
  legacyAliasEnabled: boolean
  reason: "disabled" | "enabled_by_ui_mode_rollback" | "enabled_by_legacy_ui_alias"
}

export interface UiModeRuntimeInput {
  adminActivation?: AdminUiActivationInput
  rollbackActivation?: UiModeRollbackActivationInput
  config?: KnowbeeConfig
}

export type UiModeRuntimeConfigInput = UiModeRuntimeInput & { config: KnowbeeConfig }

export interface ResolveUiModeInput extends UiModeRuntimeInput {
  preferredUiMode?: unknown
  requestedMode?: unknown
  adminEnabled?: boolean
}

const EMPTY_ENV: Record<string, string | undefined> = Object.freeze({})
const EMPTY_ARGV: readonly string[] = Object.freeze([])

function normalizeUiMode(value: unknown): UiMode | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (normalized === "beginner" || normalized === "advanced" || normalized === "admin") return normalized
  return null
}

export function normalizePreferredUiMode(value: unknown): PreferredUiMode {
  const normalized = normalizeUiMode(value)
  return normalized === "advanced" ? "advanced" : "beginner"
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (value == null) return false
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true
    default:
      return false
  }
}

export function resolveUiModeRollbackActivation(input: UiModeRollbackActivationInput = {}): UiModeRollbackActivation {
  const env = input.env ?? EMPTY_ENV
  const envEnabled = parseBooleanEnv(env["KNOWBEE_UI_MODE_ROLLBACK"])
  const legacyAliasEnabled = parseBooleanEnv(env["KNOWBEE_LEGACY_UI"])
  return {
    enabled: envEnabled || legacyAliasEnabled,
    envEnabled,
    legacyAliasEnabled,
    reason: envEnabled
      ? "enabled_by_ui_mode_rollback"
      : legacyAliasEnabled
        ? "enabled_by_legacy_ui_alias"
        : "disabled",
  }
}

export function isUiModeRollbackEnabled(): boolean {
  return resolveUiModeRollbackActivation().enabled
}

function hasAdminCliFlag(argv: readonly string[]): boolean {
  return argv.some((item) => item === "--admin-ui" || item === "--admin")
}

function isProductionMode(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "production"
}

export function resolveAdminUiActivation(input: AdminUiActivationInput = {}): AdminUiActivation {
  const env = input.env ?? EMPTY_ENV
  const argv = input.argv ?? EMPTY_ARGV
  const configEnabled = input.configEnabled ?? false
  const envEnabled = parseBooleanEnv(env["KNOWBEE_ADMIN_UI"])
  const cliEnabled = hasAdminCliFlag(argv)
  const localDevScriptEnabled = parseBooleanEnv(env["KNOWBEE_LOCAL_DEV_ADMIN_UI"]) || (env["KNOWBEE_ADMIN_UI_SOURCE"] === "local-script" && envEnabled)
  const runtimeFlagEnabled = envEnabled || cliEnabled || localDevScriptEnabled
  const productionMode = isProductionMode(input.nodeEnv ?? env["NODE_ENV"])

  if (productionMode && runtimeFlagEnabled && !configEnabled) {
    return {
      enabled: false,
      configEnabled,
      runtimeFlagEnabled,
      envEnabled,
      cliEnabled,
      localDevScriptEnabled,
      productionMode,
      reason: "blocked_by_production_config_gate",
    }
  }

  const enabled = productionMode ? runtimeFlagEnabled && configEnabled : runtimeFlagEnabled
  return {
    enabled,
    configEnabled,
    runtimeFlagEnabled,
    envEnabled,
    cliEnabled,
    localDevScriptEnabled,
    productionMode,
    reason: enabled
      ? productionMode
        ? "enabled_by_config_and_runtime_flag"
        : localDevScriptEnabled
          ? "enabled_by_local_dev_script"
          : "enabled_by_runtime_flag"
      : "disabled",
  }
}

export function isAdminUiEnabled(input: AdminUiActivationInput = {}): boolean {
  return resolveAdminUiActivation(input).enabled
}

export function resolveUiMode(input: ResolveUiModeInput = {}): UiModeState {
  const adminEnabled = input.adminEnabled ?? isAdminUiEnabled(input.adminActivation)
  const rollback = resolveUiModeRollbackActivation(input.rollbackActivation)
  if (rollback.enabled) {
    return {
      mode: "advanced",
      preferredUiMode: "advanced",
      availableModes: adminEnabled ? ["advanced", "admin"] : ["advanced"],
      adminEnabled,
      canSwitchInUi: false,
      schemaVersion: 1,
    }
  }

  const preferredUiMode = normalizePreferredUiMode(input.preferredUiMode ?? "beginner")
  const requestedMode = normalizeUiMode(input.requestedMode)
  const mode: UiMode = requestedMode === "admin"
    ? (adminEnabled ? "admin" : preferredUiMode)
    : requestedMode ?? preferredUiMode

  return {
    mode,
    preferredUiMode,
    availableModes: adminEnabled ? ["beginner", "advanced", "admin"] : ["beginner", "advanced"],
    adminEnabled,
    canSwitchInUi: true,
    schemaVersion: 1,
  }
}

export function getUiModeState(input: UiModeRuntimeConfigInput): UiModeState {
  const config = input.config
  const adminActivation = {
    ...(input.adminActivation ?? {}),
    configEnabled: input.adminActivation?.configEnabled ?? (config.webui.admin?.enabled ?? false),
  }
  return resolveUiMode({
    ...input,
    preferredUiMode: config.webui.preferredUiMode,
    adminActivation,
    adminEnabled: isAdminUiEnabled(adminActivation),
  })
}

export function savePreferredUiMode(
  mode: PreferredUiMode,
  input: UiModeRuntimeConfigInput,
  paths: PersistedConfigPaths,
): UiModeState {
  if (resolveUiModeRollbackActivation(input.rollbackActivation).enabled) return getUiModeState(input)

  const raw = readPersistedRawConfig(paths)
  const webui = raw.webui && typeof raw.webui === "object" && !Array.isArray(raw.webui)
    ? raw.webui as Record<string, unknown>
    : {}
  raw.webui = {
    ...webui,
    preferredUiMode: mode,
  }
  writePersistedRawConfig(raw, paths)
  const config: KnowbeeConfig = {
    ...input.config,
    webui: {
      ...input.config.webui,
      preferredUiMode: mode,
    },
  }
  return getUiModeState({ ...input, config })
}
