import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  buildArtifactAccessDescriptor,
  cleanupArtifactStorageQuota,
  createArtifactStorageContext,
  createArtifactStorageContextFromRoot,
  recordArtifactMetadata,
  type ArtifactStorageContext,
} from "../packages/core/src/artifacts/lifecycle.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { closeDb } from "../packages/core/src/db/index.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const tempDirs: string[] = []

function makeTempDir(label: string): string {
  const path = join(tmpdir(), `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(path, { recursive: true })
  tempDirs.push(path)
  return path
}

function writeArtifact(storage: ArtifactStorageContext, relativePath: string, content: string): string {
  const filePath = join(storage.rootDir, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
  return filePath
}

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) rmSync(path, { recursive: true, force: true })
  }
})

describe("task1161 artifact runtime path ownership", () => {
  it("keeps each explicitly constructed storage context isolated", () => {
    const startupState = makeTempDir("knowbee-artifact-startup")
    const changedState = makeTempDir("knowbee-artifact-changed")
    const startupPaths = createRuntimePaths({ KNOWBEE_STATE_DIR: startupState })
    const changedPaths = createRuntimePaths({ KNOWBEE_STATE_DIR: changedState })
    const startupStorage = createArtifactStorageContext(startupPaths)
    const changedStorage = createArtifactStorageContext(changedPaths)
    const startupFile = writeArtifact(startupStorage, "same/result.txt", "startup")
    const changedFile = writeArtifact(changedStorage, "same/result.txt", "changed")

    expect(buildArtifactAccessDescriptor({ filePath: startupFile }, startupStorage)).toMatchObject({
      ok: true,
      previewUrl: "/api/artifacts/same/result.txt",
    })
    expect(buildArtifactAccessDescriptor({ filePath: changedFile }, startupStorage)).toMatchObject({
      ok: false,
      reason: "outside_state_artifacts",
    })
    expect(readFileSync(startupFile, "utf8")).toBe("startup")
    expect(readFileSync(changedFile, "utf8")).toBe("changed")
  })

  it("rejects traversal, absolute outside paths, and symlink escapes", () => {
    const stateDir = makeTempDir("knowbee-artifact-boundary")
    const outsideDir = makeTempDir("knowbee-artifact-outside")
    const storage = createArtifactStorageContextFromRoot(join(stateDir, "artifacts"))
    mkdirSync(storage.rootDir, { recursive: true })
    const outsideFile = join(outsideDir, "secret.txt")
    writeFileSync(outsideFile, "secret")

    for (const filePath of [
      join(storage.rootDir, "..", "secret.txt"),
      outsideFile,
    ]) {
      expect(buildArtifactAccessDescriptor({ filePath }, storage)).toMatchObject({
        ok: false,
        reason: "outside_state_artifacts",
      })
    }

    if (process.platform !== "win32") {
      const linkPath = join(storage.rootDir, "outside-link")
      symlinkSync(outsideDir, linkPath, "dir")
      expect(buildArtifactAccessDescriptor({ filePath: join(linkPath, "secret.txt") }, storage)).toMatchObject({
        ok: false,
        reason: "outside_state_artifacts",
      })
    }
  })

  it("preserves file and active metadata when the storage adapter cannot delete", () => {
    const stateDir = makeTempDir("knowbee-artifact-delete-failure")
    initializeTestDbRuntime(stateDir)
    const baseStorage = createArtifactStorageContext(createRuntimePaths({ KNOWBEE_STATE_DIR: stateDir }))
    const filePath = writeArtifact(baseStorage, "cleanup/failure.txt", "keep")
    const storage: ArtifactStorageContext = Object.freeze({
      ...baseStorage,
      fileSystem: Object.freeze({
        ...baseStorage.fileSystem,
        remove: () => {
          throw new Error("injected remove failure")
        },
      }),
    })
    const artifactId = recordArtifactMetadata({
      ownerChannel: "webui",
      artifactPath: filePath,
      mimeType: "text/plain",
      sizeBytes: 4,
    }, storage)

    const result = cleanupArtifactStorageQuota({
      maxCount: 0,
      now: 1_800_000_000_000,
      deleteFiles: true,
      cleanupEvidence: () => ({
        activeReferenceCount: 0,
        referenceScanCompleted: true,
        migrationRequired: false,
        rollbackRequired: false,
        deletionApproved: true,
      }),
    }, storage)

    expect(result.deleted).toEqual([])
    expect(result.failures).toEqual([
      expect.objectContaining({ artifactId, reason: "delete_failed" }),
    ])
    expect(existsSync(filePath)).toBe(true)
  })

  it("forbids dynamic runtime path reads in artifact production boundaries", () => {
    const files = [
      "packages/core/src/artifacts/lifecycle.ts",
      "packages/core/src/api/routes/artifacts.ts",
      "packages/core/src/api/ws/chunk-delivery.ts",
      "packages/core/src/channels/slack/chunk-delivery.ts",
      "packages/core/src/channels/telegram/chunk-delivery.ts",
      "packages/core/src/channels/telegram/file-handler.ts",
      "packages/core/src/runs/web-retrieval-policy.ts",
      "packages/core/src/runs/web-retrieval-smoke.ts",
      "packages/core/src/tools/builtin/yeonjang-broadcast.ts",
      "packages/core/src/tools/builtin/yeonjang.ts",
      "packages/core/src/tools/builtin/ui/screen.ts",
      "packages/core/src/tools/builtin/ui/yeonjang-screen-shared.ts",
    ]

    for (const relativePath of files) {
      const source = readFileSync(join(repoRoot, relativePath), "utf8")
      expect(source, relativePath).not.toMatch(/\bPATHS\b/)
      expect(source, relativePath).not.toContain("process.env")
      expect(source, relativePath).not.toContain("captureRuntimePaths")
    }
  })
})
