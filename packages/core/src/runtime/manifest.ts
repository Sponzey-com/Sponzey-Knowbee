import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import BetterSqlite3 from "better-sqlite3"
import type { RuntimePaths } from "../config/paths.js"
import type { KnowbeeConfig } from "../config/types.js"
import { getDatabaseMigrationStatus } from "../config/operations.js"
import { getMqttBrokerSnapshot, getMqttExtensionSnapshots } from "../mqtt/broker.js"
import { checkPromptSourceLocaleParity, loadPromptSourceRegistry } from "../memory/knowbee-md.js"
import { buildReleaseManifest } from "../release/package.js"
import { getCurrentAppVersion, getCurrentDisplayVersion, getWorkspaceRootPath } from "../version.js"
import { getProviderCapabilityMatrix, type ProviderCapabilityMatrix } from "../ai/capabilities.js"
import { buildRolloutSafetySnapshot, type RolloutSafetySnapshot } from "./rollout-safety.js"
import { resolveAdminUiActivation, type AdminUiActivationInput } from "../ui/mode.js"
import { getWebUiWsClientCount } from "../api/ws/stream.js"
import { listYeonjangRegistryInstances } from "../yeonjang/registry.js"
import { redactLogText } from "../logger/index.js"
import { hasOpenAICodexAuthFile } from "../auth/openai-codex-oauth.js"

function runtimeManifestErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export interface RuntimeManifestEnvironment {
  node: string
  pnpm: string | null
  rustc: string | null
  cargo: string | null
  platform: NodeJS.Platform
  arch: string
}

export interface RuntimeManifestDatabase {
  path: string
  exists: boolean
  currentVersion: number
  latestVersion: number
  pendingVersions: number[]
  unknownAppliedVersions: number[]
  upToDate: boolean
}

export interface RuntimeManifestPromptSources {
  workDir: string
  count: number
  checksum: string | null
  requiredCount: number
  enabledCount: number
  localeParityOk: boolean
  diagnostics: Array<{ severity: "warning" | "error"; code: string; message: string }>
}

export interface RuntimeManifestProviderProfile {
  profileId: string
  runtimeProfileId: string
  provider: string
  model: string
  endpointConfigured: boolean
  authMode: string | null
  credentialConfigured: boolean
  chatConfigured: boolean
  capabilityMatrix: ProviderCapabilityMatrix
  embeddingProvider: string | null
  embeddingModel: string | null
  embeddingConfigured: boolean
  resolverPath: string
}

export interface RuntimeManifestChannelSummary {
  webui: {
    enabled: boolean
    host: string
    port: number
    authEnabled: boolean
  }
  telegram: {
    enabled: boolean
    credentialConfigured: boolean
    targetConfigured: boolean
  }
  slack: {
    enabled: boolean
    credentialConfigured: boolean
    targetConfigured: boolean
  }
  mqtt: {
    enabled: boolean
    running: boolean
    host: string
    port: number
    authEnabled: boolean
    allowAnonymous: boolean
    reason: string | null
  }
}

export interface RuntimeManifestYeonjangNode {
  extensionId: string
  instanceId?: string | null
  instanceAlias?: string | null
  state: string | null
  version: string | null
  protocolVersion: string | null
  capabilityHash: string | null
  methodCount: number
  lastSeenAt: number
  liveSessionCount?: number
  supportProfile?: string | null
  configuredSupportProfile?: string | null
  supportProfileReasonCodes?: string[]
  interactiveDesktopAvailable?: boolean | null
  trayRuntimeAvailable?: boolean | null
  startupMode?: string | null
  windowMode?: string | null
  trayState?: string | null
}

export interface RuntimeManifestMemory {
  dbPath: string
  dbExists: boolean
  searchMode: string | null
  ftsAvailable: boolean | null
  vectorTableAvailable: boolean | null
  embeddingRows: number | null
  embeddingProvider: string | null
  embeddingModel: string | null
  recallEventRows?: number | null
  capsuleRollupRows?: number | null
  latestRecallAt?: number | null
  latestRollupAt?: number | null
}

export interface RuntimeManifestReleasePackage {
  manifestId: string | null
  releaseVersion: string | null
  requiredMissingCount: number | null
  yeonjangPlatformCapabilityReady: boolean | null
  yeonjangPlatformCapabilityRequiredMethods: string[]
  yeonjangPlatformCapabilityEvidenceCount: number | null
  yeonjangPlatformCapabilityFailureCount: number | null
}

export interface RuntimeManifestAdminUi {
  enabled: boolean
  configEnabled: boolean
  runtimeFlagEnabled: boolean
  envEnabled: boolean
  cliEnabled: boolean
  localDevScriptEnabled: boolean
  productionMode: boolean
  subscriptionCount: number
  reason: string
}

export interface RuntimeManifest {
  kind: "knowbee.runtime.manifest"
  version: 1
  id: string
  createdAt: string
  app: {
    appVersion: string
    displayVersion: string
    workspaceRoot: string
    gitDescribe: string | null
    gitCommit: string | null
  }
  process: {
    pid: number
    cwd: string
    startedAt: string | null
  }
  environment: RuntimeManifestEnvironment
  database: RuntimeManifestDatabase
  promptSources: RuntimeManifestPromptSources
  provider: RuntimeManifestProviderProfile
  channels: RuntimeManifestChannelSummary
  yeonjang: {
    nodeCount: number
    capabilityHash: string | null
    nodes: RuntimeManifestYeonjangNode[]
  }
  memory: RuntimeManifestMemory
  releasePackage: RuntimeManifestReleasePackage
  adminUi: RuntimeManifestAdminUi
  rollout: RolloutSafetySnapshot
  paths: {
    stateDir: string
    configFile: string
    dbFile: string
    memoryDbFile: string
  }
}

export interface RuntimeManifestOptions {
  now?: Date
  includeEnvironment?: boolean
  includeReleasePackage?: boolean
  adminActivation?: AdminUiActivationInput
  config: KnowbeeConfig
  paths: RuntimePaths
  processCwd?: string
}

let lastRuntimeManifest: RuntimeManifest | null = null

const RELEASE_PACKAGE_YEONJANG_CAPABILITY_METHODS = ["clipboard.read", "clipboard.write"] as const

function commandOutput(command: string, args: string[], cwd = getWorkspaceRootPath()): string | null {
  try {
    const value = execFileSync(command, args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500,
    }).trim()
    return value || null
  } catch {
    return null
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
  return `{${entries.join(",")}}`
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function hashObject(value: unknown): string {
  return sha256(stableStringify(value))
}

function readPromptSources(workDir: string): RuntimeManifestPromptSources {
  try {
    const sources = loadPromptSourceRegistry(workDir)
    const parity = checkPromptSourceLocaleParity(workDir)
    const digestInput = sources.map((source) => ({
      sourceId: source.sourceId,
      locale: source.locale,
      checksum: source.checksum,
      enabled: source.enabled,
      required: source.required,
      usageScope: source.usageScope,
      version: source.version,
    }))
    return {
      workDir,
      count: sources.length,
      checksum: sources.length > 0 ? hashObject(digestInput) : null,
      requiredCount: sources.filter((source) => source.required).length,
      enabledCount: sources.filter((source) => source.enabled).length,
      localeParityOk: parity.ok,
      diagnostics: parity.issues.map((issue) => ({
        severity: "warning",
        code: issue.code,
        message: issue.message,
      })),
    }
  } catch (error) {
    const message = runtimeManifestErrorMessage(error)
    return {
      workDir,
      count: 0,
      checksum: null,
      requiredCount: 0,
      enabledCount: 0,
      localeParityOk: false,
      diagnostics: [{ severity: "error", code: "prompt_registry_unreadable", message }],
    }
  }
}

function tableExists(db: BetterSqlite3.Database, tableName: string): boolean {
  const row = db.prepare<[string], { name: string }>(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
  ).get(tableName)
  return Boolean(row)
}

function readCount(db: BetterSqlite3.Database, tableName: string): number | null {
  if (!tableExists(db, tableName)) return null
  const row = db.prepare<[], { count: number }>(`SELECT count(*) AS count FROM ${tableName}`).get()
  return row?.count ?? null
}

function readLatestTimestamp(db: BetterSqlite3.Database, tableName: string, column = "created_at"): number | null {
  if (!tableExists(db, tableName)) return null
  const row = db.prepare<[], { value: number | null }>(`SELECT MAX(${column}) AS value FROM ${tableName}`).get()
  return row?.value ?? null
}

function readMemoryState(config: KnowbeeConfig, paths: RuntimePaths): RuntimeManifestMemory {
  const base: RuntimeManifestMemory = {
    dbPath: paths.dbFile,
    dbExists: existsSync(paths.dbFile),
    searchMode: config.memory.searchMode ?? null,
    ftsAvailable: null,
    vectorTableAvailable: null,
    embeddingRows: null,
    embeddingProvider: config.memory.embedding?.provider ?? null,
    embeddingModel: config.memory.embedding?.model ?? null,
  }

  if (!base.dbExists) return base
  try {
    const db = new BetterSqlite3(paths.dbFile, { readonly: true, fileMustExist: true })
    try {
      const ftsAvailable = tableExists(db, "memory_chunks_fts") || tableExists(db, "memory_fts")
      const vectorTableAvailable = tableExists(db, "memory_embeddings")
      return {
        ...base,
        ftsAvailable,
        vectorTableAvailable,
        embeddingRows: vectorTableAvailable ? readCount(db, "memory_embeddings") : null,
        recallEventRows: readCount(db, "memory_recall_events"),
        capsuleRollupRows: readCount(db, "memory_capsule_rollups"),
        latestRecallAt: readLatestTimestamp(db, "memory_recall_events"),
        latestRollupAt: readLatestTimestamp(db, "memory_capsule_rollups"),
      }
    } finally {
      db.close()
    }
  } catch {
    return base
  }
}

function buildProviderProfile(config: KnowbeeConfig): RuntimeManifestProviderProfile {
  const connection = config.ai.connection
  const auth = connection.auth
  const embedding = config.memory.embedding
  const capabilityMatrix = getProviderCapabilityMatrix({ connection, memory: config.memory })
  const normalized = {
    provider: connection.provider,
    model: connection.model,
    endpointConfigured: Boolean(connection.endpoint?.trim()),
    authMode: auth?.mode ?? null,
    credentialConfigured: auth?.mode === "chatgpt_oauth"
      ? hasOpenAICodexAuthFile({
          authFilePath: auth.oauthAuthFilePath,
          clientId: auth.clientId,
        })
      : Boolean(auth?.apiKey || auth?.username || auth?.password),
    embeddingProvider: embedding?.provider ?? null,
    embeddingModel: embedding?.model ?? null,
  }
  return {
    profileId: capabilityMatrix.profileId,
    runtimeProfileId: capabilityMatrix.profileId,
    provider: connection.provider,
    model: connection.model,
    endpointConfigured: normalized.endpointConfigured,
    authMode: normalized.authMode,
    credentialConfigured: normalized.credentialConfigured,
    chatConfigured: Boolean(connection.provider && connection.model),
    capabilityMatrix,
    embeddingProvider: normalized.embeddingProvider,
    embeddingModel: normalized.embeddingModel,
    embeddingConfigured: Boolean(embedding?.provider && embedding.model),
    resolverPath: connection.provider ? `ai.connection.${connection.provider}` : "ai.connection.unconfigured",
  }
}

function buildChannels(config: KnowbeeConfig): RuntimeManifestChannelSummary {
  const mqtt = getMqttBrokerSnapshot()
  const telegram = config.telegram
  const slack = config.slack
  return {
    webui: {
      enabled: config.webui.enabled,
      host: config.webui.host,
      port: config.webui.port,
      authEnabled: config.webui.auth.enabled,
    },
    telegram: {
      enabled: telegram?.enabled ?? false,
      credentialConfigured: Boolean(telegram?.botToken?.trim()),
      targetConfigured: Boolean((telegram?.allowedUserIds.length ?? 0) > 0 || (telegram?.allowedGroupIds.length ?? 0) > 0),
    },
    slack: {
      enabled: slack?.enabled ?? false,
      credentialConfigured: Boolean(slack?.botToken?.trim() && slack.appToken.trim()),
      targetConfigured: Boolean((slack?.allowedChannelIds.length ?? 0) > 0),
    },
    mqtt: {
      enabled: mqtt.enabled,
      running: mqtt.running,
      host: mqtt.host,
      port: mqtt.port,
      authEnabled: mqtt.authEnabled,
      allowAnonymous: mqtt.allowAnonymous,
      reason: mqtt.reason,
    },
  }
}

function buildYeonjang(): RuntimeManifest["yeonjang"] {
  const liveSnapshots = new Map(
    getMqttExtensionSnapshots().map((node) => [node.extensionId, node] as const),
  )
  const registryNodes = listYeonjangRegistryInstances().map((node) => {
    const live = liveSnapshots.get(node.nodeId)
    return {
    extensionId: node.nodeId,
    instanceId: null,
    instanceAlias: node.instanceAlias,
    state: node.state,
    version: node.version,
    protocolVersion: node.protocolVersion ?? null,
    capabilityHash: node.capabilityHash ?? null,
    methodCount: node.methodCount,
    lastSeenAt: node.lastSeenAt ?? 0,
    liveSessionCount: node.liveSessionCount,
    supportProfile: node.supportProfile,
    configuredSupportProfile: live?.configuredSupportProfile ?? null,
    supportProfileReasonCodes: live?.supportProfileReasonCodes ?? [],
    interactiveDesktopAvailable: live?.interactiveDesktopAvailable ?? null,
    trayRuntimeAvailable: live?.trayRuntimeAvailable ?? null,
    startupMode: node.session?.startupMode ?? null,
    windowMode: node.session?.windowMode ?? null,
    trayState: node.session?.trayState ?? null,
  }})
  const nodes = registryNodes.length > 0
    ? registryNodes
    : getMqttExtensionSnapshots().map((node) => ({
      extensionId: node.extensionId,
      instanceId: null,
      instanceAlias: node.instanceAlias ?? null,
      state: node.state,
      version: node.version,
      protocolVersion: node.protocolVersion ?? null,
      capabilityHash: node.capabilityHash ?? null,
      methodCount: node.methods.length,
      lastSeenAt: node.lastSeenAt,
      supportProfile: node.supportProfile ?? null,
      configuredSupportProfile: node.configuredSupportProfile ?? null,
      supportProfileReasonCodes: node.supportProfileReasonCodes ?? [],
      interactiveDesktopAvailable: node.interactiveDesktopAvailable ?? null,
      trayRuntimeAvailable: node.trayRuntimeAvailable ?? null,
      startupMode: node.startupMode ?? null,
      windowMode: node.windowMode ?? null,
      trayState: node.trayState ?? null,
    }))
  return {
    nodeCount: nodes.length,
    capabilityHash: nodes.length > 0 ? hashObject(nodes.map((node) => ({ id: node.extensionId, hash: node.capabilityHash, methods: node.methodCount }))) : null,
    nodes,
  }
}

function buildReleasePackageState(includeReleasePackage: boolean, config: KnowbeeConfig, paths: RuntimePaths): RuntimeManifestReleasePackage {
  if (!includeReleasePackage) {
    return {
      manifestId: null,
      releaseVersion: null,
      requiredMissingCount: null,
      yeonjangPlatformCapabilityReady: null,
      yeonjangPlatformCapabilityRequiredMethods: [],
      yeonjangPlatformCapabilityEvidenceCount: null,
      yeonjangPlatformCapabilityFailureCount: null,
    }
  }
  try {
    const manifest = buildReleaseManifest({
      rootDir: getWorkspaceRootPath(),
      config,
      runtimePaths: paths,
      yeonjangPlatformRequiredCapabilityMethods: RELEASE_PACKAGE_YEONJANG_CAPABILITY_METHODS,
      yeonjangAutoCollectPlatformCapabilityReadiness: true,
    })
    const capabilityRows = manifest.yeonjangPlatformAcceptance.platforms.flatMap(
      (platform) => platform.capabilityReadiness,
    )
    return {
      manifestId: hashObject({ releaseVersion: manifest.releaseVersion, artifacts: manifest.checksums, missing: manifest.requiredMissing }).slice(0, 16),
      releaseVersion: manifest.releaseVersion,
      requiredMissingCount: manifest.requiredMissing.length,
      yeonjangPlatformCapabilityReady: manifest.yeonjangPlatformAcceptance.capabilityReady,
      yeonjangPlatformCapabilityRequiredMethods: [...RELEASE_PACKAGE_YEONJANG_CAPABILITY_METHODS],
      yeonjangPlatformCapabilityEvidenceCount: capabilityRows.filter((row) => Boolean(row.evidenceRef)).length,
      yeonjangPlatformCapabilityFailureCount: capabilityRows.filter((row) => row.status !== "passed").length,
    }
  } catch {
    return {
      manifestId: null,
      releaseVersion: null,
      requiredMissingCount: null,
      yeonjangPlatformCapabilityReady: null,
      yeonjangPlatformCapabilityRequiredMethods: [...RELEASE_PACKAGE_YEONJANG_CAPABILITY_METHODS],
      yeonjangPlatformCapabilityEvidenceCount: null,
      yeonjangPlatformCapabilityFailureCount: null,
    }
  }
}

function buildAdminUiState(input?: AdminUiActivationInput): RuntimeManifestAdminUi {
  const activation = resolveAdminUiActivation(input)
  return {
    enabled: activation.enabled,
    configEnabled: activation.configEnabled,
    runtimeFlagEnabled: activation.runtimeFlagEnabled,
    envEnabled: activation.envEnabled,
    cliEnabled: activation.cliEnabled,
    localDevScriptEnabled: activation.localDevScriptEnabled,
    productionMode: activation.productionMode,
    subscriptionCount: getWebUiWsClientCount(),
    reason: activation.reason,
  }
}

function buildEnvironment(includeEnvironment: boolean): RuntimeManifestEnvironment {
  return {
    node: process.version,
    pnpm: includeEnvironment ? commandOutput("pnpm", ["--version"]) : null,
    rustc: includeEnvironment ? commandOutput("rustc", ["--version"]) : null,
    cargo: includeEnvironment ? commandOutput("cargo", ["--version"]) : null,
    platform: process.platform,
    arch: process.arch,
  }
}

function buildDatabase(paths: RuntimePaths): RuntimeManifestDatabase {
  const status = getDatabaseMigrationStatus(paths.dbFile)
  return {
    path: status.databasePath,
    exists: status.exists,
    currentVersion: status.currentVersion,
    latestVersion: status.latestVersion,
    pendingVersions: status.pendingVersions,
    unknownAppliedVersions: status.unknownAppliedVersions,
    upToDate: status.upToDate,
  }
}

export function buildRuntimeManifest(options: RuntimeManifestOptions): RuntimeManifest {
  const paths = options.paths
  mkdirSync(dirname(paths.dbFile), { recursive: true })
  const config = options.config
  const now = options.now ?? new Date()
  const includeEnvironment = options.includeEnvironment ?? true
  const includeReleasePackage = options.includeReleasePackage ?? true
  const workspaceRoot = getWorkspaceRootPath()
  const gitDescribe = commandOutput("git", ["describe", "--tags", "--always", "--dirty"], workspaceRoot)
  const gitCommit = commandOutput("git", ["rev-parse", "--short", "HEAD"], workspaceRoot)
  const base = {
    kind: "knowbee.runtime.manifest" as const,
    version: 1 as const,
    createdAt: now.toISOString(),
    app: {
      appVersion: getCurrentAppVersion(),
      displayVersion: getCurrentDisplayVersion(),
      workspaceRoot,
      gitDescribe,
      gitCommit,
    },
    process: {
      pid: process.pid,
      cwd: options.processCwd ?? config.profile.workspace,
      startedAt: null,
    },
    environment: buildEnvironment(includeEnvironment),
    database: buildDatabase(paths),
    promptSources: readPromptSources(workspaceRoot),
    provider: buildProviderProfile(config),
    channels: buildChannels(config),
    yeonjang: buildYeonjang(),
    memory: readMemoryState(config, paths),
    releasePackage: buildReleasePackageState(includeReleasePackage, config, paths),
    adminUi: buildAdminUiState(options.adminActivation),
    rollout: buildRolloutSafetySnapshot(paths.dbFile),
    paths: {
      stateDir: paths.stateDir,
      configFile: paths.configFile,
      dbFile: paths.dbFile,
      memoryDbFile: paths.memoryDbFile,
    },
  }
  const id = hashObject({ ...base, createdAt: undefined }).slice(0, 24)
  lastRuntimeManifest = { ...base, id }
  return lastRuntimeManifest
}

export function getLastRuntimeManifest(): RuntimeManifest | null {
  return lastRuntimeManifest
}

export function refreshRuntimeManifest(options: RuntimeManifestOptions): RuntimeManifest {
  return buildRuntimeManifest(options)
}
