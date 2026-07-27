import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  dryRunPromptSourceAssembly,
  ensurePromptSourceFiles,
  loadPromptSourceRegistry,
  loadPromptTemplate,
  loadSystemPromptSourceAssembly,
} from "../packages/core/src/memory/knowbee-md.ts"
import {
  selectAgentPromptBundleSources,
  selectDiagnosisPromptSources,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

const tempDirs: string[] = []

function createSeededPromptRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task0251-prompts-"))
  tempDirs.push(root)
  ensurePromptSourceFiles(root)
  return root
}

function writeKoPrompt(root: string, filename: string, marker: string): void {
  const promptsDir = join(root, "prompts")
  mkdirSync(promptsDir, { recursive: true })
  writeFileSync(join(promptsDir, filename), `# Korean Prompt\n\n${marker}\n`, "utf-8")
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0251 English system prompt source selection", () => {
  it("uses English runtime prompt sources even when locale is ko and ko files exist", () => {
    const root = createSeededPromptRoot()
    writeKoPrompt(root, "identity.ko.md", "KO_IDENTITY_MARKER")

    const assembly = loadSystemPromptSourceAssembly(root, "ko")
    const dryRun = dryRunPromptSourceAssembly(root, "ko")

    expect(assembly?.sources.find((source) => source.sourceId === "identity")?.locale).toBe("en")
    expect(assembly?.sources.every((source) => source.locale === "en")).toBe(true)
    expect(assembly?.text).not.toContain("KO_IDENTITY_MARKER")
    expect(dryRun.sourceOrder.every((source) => source.locale === "en")).toBe(true)
  })

  it("uses English prompt templates for system prompt callers even when locale is ko", () => {
    const root = createSeededPromptRoot()
    const identityPath = join(root, "prompts", "identity.md")
    writeFileSync(identityPath, "# Identity\n\nEN_IDENTITY_MARKER\n", "utf-8")
    writeKoPrompt(root, "identity.ko.md", "KO_IDENTITY_MARKER")

    const template = loadPromptTemplate({ workDir: root, sourceId: "identity", locale: "ko" })

    expect(template).toContain("EN_IDENTITY_MARKER")
    expect(template).not.toContain("KO_IDENTITY_MARKER")
  })

  it("selects English policy and diagnosis prompt sources for ko callers", () => {
    const root = createSeededPromptRoot()
    writeKoPrompt(root, "identity.ko.md", "KO_IDENTITY_MARKER")
    writeKoPrompt(root, "request_diagnosis.ko.md", "KO_REQUEST_DIAGNOSIS_MARKER")
    writeFileSync(
      join(root, "prompts", "request_diagnosis.md"),
      "# Request Diagnosis\n\nEN_REQUEST_DIAGNOSIS_MARKER\n",
      "utf-8",
    )

    const sources = loadPromptSourceRegistry(root)
    const bundleSources = selectAgentPromptBundleSources({ sources, locale: "ko" })
    const diagnosisSources = selectDiagnosisPromptSources({ sources, locale: "ko" })

    expect(bundleSources.some((source) => source.sourceId === "identity" && source.locale === "en")).toBe(true)
    expect(bundleSources.every((source) => source.locale === "en")).toBe(true)
    expect(diagnosisSources.find((source) => source.sourceId === "request_diagnosis")?.content).toContain(
      "EN_REQUEST_DIAGNOSIS_MARKER",
    )
    expect(diagnosisSources.map((source) => source.content).join("\n")).not.toContain(
      "KO_REQUEST_DIAGNOSIS_MARKER",
    )
  })

  it("uses English seed fallback instead of ko prompt files when local English files are missing", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task0251-ko-only-"))
    tempDirs.push(root)
    const promptsDir = join(root, "prompts")
    mkdirSync(promptsDir)
    writeFileSync(join(promptsDir, "identity.ko.md"), "# Korean Identity\n\nKO_ONLY_MARKER\n", "utf-8")

    const template = loadPromptTemplate({ workDir: root, sourceId: "identity", locale: "ko" })

    expect(template).not.toContain("KO_ONLY_MARKER")
    expect(template.trim().length).toBeGreaterThan(0)
    expect(readFileSync(join(promptsDir, "identity.ko.md"), "utf-8")).toContain("KO_ONLY_MARKER")
  })
})
