const DEFAULT_WORKSPACE_SCOPE_ID = "workspace:local-default"
const DEFAULT_OWNER_USER_ID = "local:operator"

function normalizeString(value: string | null | undefined): string {
  return value?.trim() ?? ""
}

function normalizeGatewayOs(platform: NodeJS.Platform = process.platform): string {
  switch (platform) {
    case "darwin":
      return "macos"
    case "win32":
      return "windows"
    default:
      return platform
  }
}

function normalizeGatewayArch(arch: NodeJS.Architecture = process.arch): string {
  switch (arch) {
    case "x64":
      return "x86_64"
    case "arm64":
      return "aarch64"
    case "ia32":
      return "x86"
    default:
      return arch
  }
}

function stableHexHash(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of Buffer.from(value, "utf-8")) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, "0")
}

const YEONJANG_RUNTIME_IDENTITY = Object.freeze({
  hostname: normalizeString(process.env["KNOWBEE_HOSTNAME"])
    || normalizeString(process.env["COMPUTERNAME"])
    || normalizeString(process.env["HOSTNAME"])
    || "localhost",
  workspaceScopeId: normalizeString(process.env["KNOWBEE_YEONJANG_WORKSPACE_SCOPE_ID"]) || DEFAULT_WORKSPACE_SCOPE_ID,
  ownerUserId: normalizeString(process.env["KNOWBEE_YEONJANG_OWNER_USER_ID"]) || DEFAULT_OWNER_USER_ID,
  platform: process.platform,
  arch: process.arch,
})

export function getYeonjangRuntimeHostname(): string {
  return YEONJANG_RUNTIME_IDENTITY.hostname
}

export function getDefaultYeonjangWorkspaceScopeId(): string {
  return YEONJANG_RUNTIME_IDENTITY.workspaceScopeId
}

export function getDefaultYeonjangOwnerUserId(): string {
  return YEONJANG_RUNTIME_IDENTITY.ownerUserId
}

export function getYeonjangGatewayHostFingerprint(): string {
  return stableHexHash(`${getYeonjangRuntimeHostname()}|${normalizeGatewayOs(YEONJANG_RUNTIME_IDENTITY.platform)}|${normalizeGatewayArch(YEONJANG_RUNTIME_IDENTITY.arch)}`)
}

export function previewYeonjangFingerprint(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function getYeonjangGatewayHostFingerprintPreview(): string {
  return previewYeonjangFingerprint(getYeonjangGatewayHostFingerprint())
}
