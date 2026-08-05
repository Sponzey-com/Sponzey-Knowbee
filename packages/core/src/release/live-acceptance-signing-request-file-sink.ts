import { randomUUID } from "node:crypto"
import { link, lstat, open, realpath, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { LiveAcceptanceSigningRequestSink } from "./live-acceptance-runner.js"
import type { LiveAcceptanceSigningRequest } from "./live-acceptance-signing-exchange.js"

export interface LiveAcceptanceSigningRequestArtifactPolicy {
  readonly purpose: "external_release_signature"
  readonly audience: "external_signer"
  readonly redaction: "raw_by_design"
  readonly access: "filesystem_private_file"
  readonly retention: "operator_cleanup"
  readonly rawDataAllowed: true
  readonly route: "none"
  readonly directoryName: "release/live-acceptance-signing-requests"
  readonly fileMode: "0600"
}

export const LIVE_ACCEPTANCE_SIGNING_REQUEST_ARTIFACT_POLICY: LiveAcceptanceSigningRequestArtifactPolicy = Object.freeze({
  purpose: "external_release_signature",
  audience: "external_signer",
  redaction: "raw_by_design",
  access: "filesystem_private_file",
  retention: "operator_cleanup",
  rawDataAllowed: true,
  route: "none",
  directoryName: "release/live-acceptance-signing-requests",
  fileMode: "0600",
})

export interface AtomicSigningRequestFileHandle {
  writeFile(data: string, options: { encoding: "utf8" }): Promise<unknown>
  sync(): Promise<void>
  close(): Promise<void>
}

export interface AtomicSigningRequestFileSystem {
  lstat(path: string): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>
  realpath(path: string): Promise<string>
  openExclusive(path: string): Promise<AtomicSigningRequestFileHandle>
  link(existingPath: string, newPath: string): Promise<void>
  unlink(path: string): Promise<void>
}

const defaultFileSystem: AtomicSigningRequestFileSystem = {
  lstat,
  realpath,
  openExclusive: async (path) => open(path, "wx", 0o600),
  link,
  unlink,
}

const HASH = /^sha256:([a-f0-9]{64})$/u

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

function fileName(request: LiveAcceptanceSigningRequest): string | null {
  const payload = HASH.exec(request.payloadSha256)?.[1]
  const key = HASH.exec(request.requestedKeyId)?.[1]
  return payload && key ? `${payload}-${key}.json` : null
}

async function removeQuietly(
  fileSystem: AtomicSigningRequestFileSystem,
  path: string,
): Promise<void> {
  try {
    await fileSystem.unlink(path)
  } catch {
    // Cleanup remains best-effort and never exposes filesystem details.
  }
}

export function createLiveAcceptanceSigningRequestFileSink(input: {
  readonly outputDir: string
  readonly maxBytes?: number
  readonly randomId?: () => string
  readonly fileSystem?: AtomicSigningRequestFileSystem
}): LiveAcceptanceSigningRequestSink {
  const outputDir = resolve(input.outputDir)
  const maxBytes = input.maxBytes ?? 1024 * 1024
  const fileSystem = input.fileSystem ?? defaultFileSystem
  const randomId = input.randomId ?? randomUUID

  return Object.freeze({
    async write(request: Readonly<LiveAcceptanceSigningRequest>) {
      const name = fileName(request as LiveAcceptanceSigningRequest)
      if (!name || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        return {
          status: "rejected" as const,
          reasonCode: "live_signing_request_invalid",
        }
      }
      let content: string
      try {
        content = `${JSON.stringify(request)}\n`
      } catch {
        return {
          status: "rejected" as const,
          reasonCode: "live_signing_request_invalid",
        }
      }
      if (Buffer.byteLength(content, "utf8") > maxBytes) {
        return {
          status: "rejected" as const,
          reasonCode: "live_signing_request_too_large",
        }
      }

      let canonicalOutputDir: string
      try {
        const stat = await fileSystem.lstat(outputDir)
        canonicalOutputDir = resolve(await fileSystem.realpath(outputDir))
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          return {
            status: "rejected" as const,
            reasonCode: "live_signing_request_root_invalid",
          }
        }
      } catch {
        return {
          status: "rejected" as const,
          reasonCode: "live_signing_request_root_invalid",
        }
      }

      const nonce = randomId()
      if (!/^[a-zA-Z0-9_-]{1,64}$/u.test(nonce)) {
        return {
          status: "rejected" as const,
          reasonCode: "live_signing_request_invalid",
        }
      }
      const destination = join(canonicalOutputDir, name)
      const temporary = join(canonicalOutputDir, `.${name}.${nonce}.tmp`)
      let handle: AtomicSigningRequestFileHandle | undefined
      let published = false
      try {
        handle = await fileSystem.openExclusive(temporary)
        await handle.writeFile(content, { encoding: "utf8" })
        await handle.sync()
        await handle.close()
        handle = undefined
        await fileSystem.link(temporary, destination)
        published = true
        await fileSystem.unlink(temporary)
        return { status: "written" as const }
      } catch (error) {
        try {
          await handle?.close()
        } catch {
          // Temporary cleanup below remains authoritative.
        }
        await removeQuietly(fileSystem, temporary)
        if (published) await removeQuietly(fileSystem, destination)
        return {
          status: "rejected" as const,
          reasonCode:
            errorCode(error) === "EEXIST"
              ? "live_signing_request_destination_exists"
              : "live_signing_request_write_failed",
        }
      }
    },
  })
}
