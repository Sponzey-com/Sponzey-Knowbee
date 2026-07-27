import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { PersistedConfigFileSystem } from "../packages/core/src/config/persisted-file.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  createMemoryJournalRepository,
} from "../packages/core/src/memory/journal.ts"
import {
  clearFocusBinding,
  createCommandWorkspaceStorage,
  getFocusBinding,
} from "../packages/core/src/orchestration/command-workspace.ts"
import {
  createAgentHierarchyService,
  createAgentHierarchyStorage,
} from "../packages/core/src/orchestration/hierarchy.ts"

const tempDirs: string[] = []

function tempState(name: string) {
  const stateDir = mkdtempSync(join(tmpdir(), `knowbee-task1163-${name}-`))
  tempDirs.push(stateDir)
  return createRuntimePaths({ KNOWBEE_STATE_DIR: stateDir }, { homeDir: stateDir, exists: () => false })
}

function focusFile(threadId: string, marker: string) {
  return {
    schemaVersion: 1,
    bindings: {
      [threadId]: {
        schemaVersion: 1,
        threadId,
        parentAgentId: "agent:knowbee",
        target: { kind: "agent", id: `agent:${marker}`, label: marker },
        source: "api",
        reasonCode: "focus_bound_explicit_planner_target",
        finalAnswerOwner: "unchanged_parent",
        memoryIsolation: "unchanged",
        createdAt: 1,
        updatedAt: 1,
      },
    },
  }
}

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe("task1163 explicit memory and orchestration storage", () => {
  it("keeps journal reads and writes inside the startup memory database", () => {
    const startup = tempState("memory-startup")
    const changed = tempState("memory-changed")
    const startupRepository = createMemoryJournalRepository(startup)
    const changedRepository = createMemoryJournalRepository(changed)

    startupRepository.insert({ kind: "instruction", content: "task1163 shared startup marker" })
    changedRepository.insert({ kind: "instruction", content: "task1163 shared changed marker" })
    startupRepository.insert({
      kind: "response",
      scope: "task",
      content: "task1163 isolated child marker",
      runId: "run:child",
      requestGroupId: "request:child",
    })

    expect(startupRepository.search("task1163 shared")[0]?.content).toContain("startup marker")
    expect(changedRepository.search("task1163 shared")[0]?.content).toContain("changed marker")
    expect(startupRepository.search("isolated child")).toEqual([])
    expect(startupRepository.search("isolated child", { runId: "run:child" })).toHaveLength(1)

    startupRepository.close()
    changedRepository.close()
    expect(readFileSync(startup.memoryDbFile).length).toBeGreaterThan(0)
    expect(readFileSync(changed.memoryDbFile).length).toBeGreaterThan(0)
  })

  it("reads and mutates only the explicitly selected focus file", () => {
    const startup = tempState("focus-startup")
    const changed = tempState("focus-changed")
    const startupStorage = createCommandWorkspaceStorage(startup)
    const changedStorage = createCommandWorkspaceStorage(changed)
    writeFileSync(startupStorage.focusBindingsFile, JSON.stringify(focusFile("thread:one", "startup")))
    writeFileSync(changedStorage.focusBindingsFile, JSON.stringify(focusFile("thread:one", "changed")))

    expect(getFocusBinding("thread:one", startupStorage)?.target.label).toBe("startup")
    expect(getFocusBinding("thread:one", changedStorage)?.target.label).toBe("changed")
    expect(clearFocusBinding("thread:one", startupStorage).cleared).toBe(true)
    expect(getFocusBinding("thread:one", startupStorage)).toBeUndefined()
    expect(getFocusBinding("thread:one", changedStorage)?.target.label).toBe("changed")
  })

  it("keeps hierarchy layout files isolated by explicit storage", () => {
    const startup = tempState("layout-startup")
    const changed = tempState("layout-changed")
    const startupService = createAgentHierarchyService({
      config: DEFAULT_CONFIG,
      storage: createAgentHierarchyStorage(startup),
      now: () => 10,
    })
    const changedService = createAgentHierarchyService({
      config: DEFAULT_CONFIG,
      storage: createAgentHierarchyStorage(changed),
      now: () => 20,
    })

    startupService.writeLayout({ layout: "startup", nodes: { a: { x: 1, y: 2 } } })
    changedService.writeLayout({ layout: "changed", nodes: { b: { x: 3, y: 4 } } })

    expect(startupService.readLayout()).toMatchObject({ layout: "startup", updatedAt: 10 })
    expect(changedService.readLayout()).toMatchObject({ layout: "changed", updatedAt: 20 })
  })

  it("preserves the previous focus file when atomic rename fails", () => {
    const target = "/state/focus-bindings.json"
    const files = new Map<string, string>([[target, JSON.stringify(focusFile("thread:one", "stable"))]])
    const fileSystem: PersistedConfigFileSystem = {
      exists: (path) => files.has(path),
      makeDirectory: () => {},
      readText: (path) => files.get(path) ?? "",
      writeText: (path, content) => { files.set(path, content) },
      rename: () => { throw new Error("rename failed") },
      remove: (path) => { files.delete(path) },
    }
    const storage = { focusBindingsFile: target, fileSystem }

    expect(() => clearFocusBinding("thread:one", storage)).toThrow("rename failed")
    expect(JSON.parse(files.get(target) ?? "{}").bindings["thread:one"].target.label).toBe("stable")
    expect([...files.keys()].filter((path) => path.includes(".tmp-"))).toEqual([])
  })

  it("does not fall back to another database when startup database open fails", () => {
    const startup = tempState("memory-open-failure")
    const openedPaths: string[] = []
    const repository = createMemoryJournalRepository(startup, {
      makeDirectory: () => {},
      openDatabase: (path) => {
        openedPaths.push(path)
        throw new Error("database open failed")
      },
    })

    expect(() => repository.insert({ kind: "failure", content: "must not fall back" }))
      .toThrow("database open failed")
    expect(openedPaths).toEqual([startup.memoryDbFile])
  })

  it("preserves the previous hierarchy layout when atomic rename fails", () => {
    const target = "/state/agent-tree-layout.json"
    const stable = JSON.stringify({ schemaVersion: 1, layout: "stable", nodes: {}, updatedAt: 1 })
    const files = new Map<string, string>([[target, stable]])
    const fileSystem: PersistedConfigFileSystem = {
      exists: (path) => files.has(path),
      makeDirectory: () => {},
      readText: (path) => files.get(path) ?? "",
      writeText: (path, content) => { files.set(path, content) },
      rename: () => { throw new Error("layout rename failed") },
      remove: (path) => { files.delete(path) },
    }
    const service = createAgentHierarchyService({
      config: DEFAULT_CONFIG,
      storage: { layoutFile: target, fileSystem },
      now: () => 2,
    })

    expect(() => service.writeLayout({ layout: "replacement", nodes: {} }))
      .toThrow("layout rename failed")
    expect(files.get(target)).toBe(stable)
    expect([...files.keys()].filter((path) => path.includes(".tmp-"))).toEqual([])
  })

  it("does not reintroduce dynamic path or environment reads in request-time storage modules", () => {
    const files = [
      "packages/core/src/memory/journal.ts",
      "packages/core/src/orchestration/command-workspace.ts",
      "packages/core/src/orchestration/hierarchy.ts",
    ]
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf-8")
      expect(source, file).not.toMatch(/\bPATHS\b/)
      expect(source, file).not.toMatch(/process\.env/)
      expect(source, file).not.toMatch(/captureRuntimePaths/)
    }
  })
})
