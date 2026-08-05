import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { getWorkspaceRootPath } from "../version.js"

export type PlanDriftSeverity = "info" | "warning" | "blocked"

export type PlanDriftWarningCode =
  | "phase_plan_missing"
  | "missing_required_section"
  | "completed_without_evidence"
  | "missing_referenced_path"
  | "plan_outdated_claim"

export interface TaskEvidenceMetadata {
  path: string
  title: string
  status: string
  completed: boolean
  checkedItems: number
  totalItems: number
  sections: string[]
  missingSections: string[]
  evidenceCommands: string[]
  hasAutomatedEvidence: boolean
  hasManualSmokeEvidence: boolean
  manualOnly: boolean
  hasEvidence: boolean
}

export interface PlanDriftWarning {
  code: PlanDriftWarningCode
  severity: PlanDriftSeverity
  path: string
  message: string
  detail: Record<string, unknown>
}

export interface PhasePlanStatus {
  phase: "phase001" | "phase002"
  path: string
  exists: boolean
}

export interface PlanDriftReleaseNoteEvidence {
  verifiedTasks: Array<{ path: string; title: string; status: string; evidenceCommands: string[] }>
  manualOnlyTasks: Array<{ path: string; title: string; status: string }>
  unverifiedTasks: Array<{ path: string; title: string; status: string; reason: string }>
  pendingTasks: Array<{ path: string; title: string; status: string }>
  warningsByCode: Record<PlanDriftWarningCode, number>
}

export interface PlanDriftReport {
  kind: "knowbee.plan-drift.report"
  version: 1
  rootDir: string
  createdAt: string
  phasePlans: PhasePlanStatus[]
  tasks: TaskEvidenceMetadata[]
  warnings: PlanDriftWarning[]
  summary: {
    taskCount: number
    completedTaskCount: number
    warningCount: number
    blockedCount: number
    missingEvidenceCount: number
  }
  releaseNoteEvidence: PlanDriftReleaseNoteEvidence
}

export interface PlanDriftCheckOptions {
  rootDir?: string
  now?: Date
  requiredTaskSections?: string[]
}

const DEFAULT_REQUIRED_TASK_SECTIONS = [
  "목표",
  "기준 문서",
  "포함 기능",
  "구현 체크리스트",
  "검증 시나리오",
  "자동 테스트",
  "수동 smoke",
  "완료 조건",
  "관련 파일",
  "롤백 기준",
]

const CURRENT_REQUIRED_TASK_SECTION_GROUPS = [
  { name: "Status", aliases: ["Status"] },
  { name: "Requirement and Goal", aliases: ["Requirement and Goal"] },
  { name: "Functional Units", aliases: ["Functional Units"] },
  { name: "Architecture", aliases: ["Architecture"] },
  { name: "Validation", aliases: ["Validation"] },
  {
    name: "Completion Report",
    aliases: ["Completion Report", "Validation Report", "Done Criteria", "Result"],
  },
] as const

const NUMBERED_REQUIRED_TASK_SECTION_GROUPS = [
  { name: "Task Purpose", aliases: ["Task Purpose"] },
  { name: "Scope", aliases: ["Scope"] },
  { name: "Functional Units", aliases: ["Functional Units"] },
  { name: "Architecture", aliases: ["Architecture"] },
  { name: "TDD and Validation", aliases: ["TDD Plan", "TDD and Validation"] },
  { name: "Completion Report", aliases: ["Completion Report"] },
  { name: "Next Task Decision Hook", aliases: ["Next Task Decision Hook"] },
  { name: "Stop Conditions", aliases: ["Stop Conditions"] },
] as const

const COMPACT_REQUIRED_TASK_SECTION_GROUPS = [
  { name: "Purpose", aliases: ["Purpose"] },
  { name: "Functional Units", aliases: ["Functional Units"] },
  { name: "Architecture/TDD", aliases: ["Architecture/TDD"] },
  { name: "Completion and Next Decision", aliases: ["Completion and Next Decision"] },
  { name: "Stop Conditions", aliases: ["Stop Conditions"] },
] as const

const CURRENT_STATUS_LABELS = ["Ready", "Red", "Green", "Tidy", "Verified", "Done"] as const
type CurrentStatusLabel = (typeof CURRENT_STATUS_LABELS)[number]

const PHASE_EVIDENCE_CANDIDATES = {
  phase001: [".tasks/phase001/plan.md", ".tasks/phase001/goal.md"],
  phase002: [".tasks/phase002/plan.md"],
} as const satisfies Record<PhasePlanStatus["phase"], readonly string[]>

const REFERENCE_PREFIXES = [
  ".tasks/",
  "packages/",
  "scripts/",
  "tests/",
  "prompts/",
  "docs/",
  "Yeonjang/",
  "README",
  ".design/",
]

export function parseTaskMetadata(
  filePath: string,
  content: string,
  requiredTaskSections?: string[],
): TaskEvidenceMetadata {
  const title = parseTitle(content) ?? basename(filePath)
  const checkboxMatches = Array.from(content.matchAll(/^- \[(x|X| )\]/gm))
  const checkedItems = checkboxMatches.filter((match) => match[1]?.toLowerCase() === "x").length
  const totalItems = checkboxMatches.length
  const sections = parseSections(content)
  const currentStatus = parseCurrentStatus(content, sections)
  const currentSchema = currentStatus !== null
  const numberedSchema = !currentSchema && isNumberedTaskSchema(sections)
  const compactSchema = !currentSchema && !numberedSchema && isCompactTaskSchema(sections)
  const completionDecisionSection = compactSchema
    ? extractSection(content, "Completion and Next Decision")
    : ""
  const completionSection = currentSchema
    ? extractSections(content, [
        "Completion Report",
        "Validation Report",
        "Done Criteria",
        "Result",
      ])
    : numberedSchema
      ? extractSection(content, "Completion Report")
      : ""
  const compactCompletionReport = compactSchema ? extractSection(content, "Completion Report") : ""
  const numberedStatus = numberedSchema ? parseNumberedStatus(completionSection) : null
  const compactStatus = compactSchema ? parseNumberedStatus(completionDecisionSection) : null
  const status = currentSchema
    ? currentStatus.status
    : (numberedStatus?.status ?? compactStatus?.status ?? parseLegacyStatus(content))
  const missingSections = requiredTaskSections
    ? requiredTaskSections.filter((section) => !hasSection(sections, section))
    : currentSchema
      ? CURRENT_REQUIRED_TASK_SECTION_GROUPS.filter(
          (group) => !group.aliases.some((alias) => hasSection(sections, alias)),
        ).map((group) => group.name)
      : numberedSchema
        ? NUMBERED_REQUIRED_TASK_SECTION_GROUPS.filter(
            (group) => !group.aliases.some((alias) => hasSection(sections, alias)),
          ).map((group) => group.name)
        : compactSchema
          ? COMPACT_REQUIRED_TASK_SECTION_GROUPS.filter(
              (group) => !group.aliases.some((alias) => hasSection(sections, alias)),
            ).map((group) => group.name)
          : DEFAULT_REQUIRED_TASK_SECTIONS.filter((section) => !hasSection(sections, section))
  const autoSection = extractSection(content, "자동 테스트")
  const smokeSection = extractSection(content, "수동 smoke")
  const legacyVerificationSection = [
    extractSection(content, "검증 결과"),
    extractSection(content, "검증 명령"),
  ]
    .filter(Boolean)
    .join("\n")
  const checkedSchemaEvidence = currentSchema
    ? `${extractCheckedEvidenceLines(extractSection(content, "TDD Evidence"))}\n${extractCurrentValidationEvidence(content, sections)}`
    : numberedSchema
      ? extractCheckedEvidenceLines(
          `${extractFirstSection(content, ["TDD Plan", "TDD and Validation"])}\n${extractSection(content, "Validation Checklist")}`,
        )
      : compactSchema
        ? extractCheckedEvidenceLines(
            extractFirstSection(content, ["Architecture/TDD/Validation", "Architecture/TDD"]),
          )
        : ""
  const evidenceSchema = currentSchema || numberedSchema || compactSchema
  const schemaCompletionEvidence = compactSchema
    ? `${completionDecisionSection}\n${compactCompletionReport}`
    : completionSection
  const evidenceText = evidenceSchema
    ? `${checkedSchemaEvidence}\n${schemaCompletionEvidence}`
    : `${autoSection}\n${smokeSection}\n${legacyVerificationSection}`
  const evidenceCommands = extractEvidenceCommands(evidenceText)
  const completionEvidenceValid =
    !evidenceSchema || hasCurrentCompletionEvidence(schemaCompletionEvidence)
  const hasAutomatedEvidence =
    completionEvidenceValid &&
    (hasCheckedItem(autoSection) ||
      evidenceCommands.some((command) =>
        /\b(test|typecheck|build|doctor|smoke|audit)\b/i.test(command),
      ) ||
      hasStructuredValidationEvidence(evidenceText))
  const hasManualSmokeEvidence =
    completionEvidenceValid &&
    (hasCheckedItem(smokeSection) ||
      hasPassedManualSmokeEvidence(evidenceSchema ? evidenceText : ""))
  const manualOnly = /manual-only|수동\s*smoke\s*대기|수동\s*검증\s*대기/i.test(content)
  const completed = currentSchema
    ? currentStatus.valid && currentStatus.checked.Verified && currentStatus.checked.Done
    : numberedSchema
      ? numberedStatus?.completed === true
      : compactSchema
        ? compactStatus?.completed === true
        : /완료|complete|completed/i.test(status) ||
          (totalItems > 0 && checkedItems === totalItems && hasSection(sections, "완료 조건"))
  const hasEvidence =
    completionEvidenceValid && (hasAutomatedEvidence || hasManualSmokeEvidence || manualOnly)

  return {
    path: normalizeDisplayPath(filePath),
    title,
    status,
    completed,
    checkedItems,
    totalItems,
    sections,
    missingSections,
    evidenceCommands,
    hasAutomatedEvidence,
    hasManualSmokeEvidence,
    manualOnly,
    hasEvidence,
  }
}

export function runPlanDriftCheck(options: PlanDriftCheckOptions = {}): PlanDriftReport {
  const rootDir = resolve(options.rootDir ?? getWorkspaceRootPath())
  const phasePlans = buildPhasePlanStatus(rootDir)
  const tasks = listRootTaskFiles(rootDir).map((filePath) =>
    parseTaskMetadata(
      relative(rootDir, filePath),
      readFileSync(filePath, "utf-8"),
      options.requiredTaskSections,
    ),
  )
  const warnings: PlanDriftWarning[] = []

  for (const plan of phasePlans) {
    if (!plan.exists) {
      warnings.push({
        code: "phase_plan_missing",
        severity: "warning",
        path: plan.path,
        message: `${plan.phase} 계획 또는 목표 증거 문서가 없습니다.`,
        detail: { phase: plan.phase, expectedPaths: phaseEvidenceCandidates(plan.phase) },
      })
    }
  }

  for (const task of tasks) {
    for (const section of task.missingSections) {
      warnings.push({
        code: "missing_required_section",
        severity: "warning",
        path: task.path,
        message: `Task evidence 필수 섹션이 없습니다: ${section}`,
        detail: { section, title: task.title },
      })
    }
    if (task.completed && !task.hasEvidence) {
      warnings.push({
        code: "completed_without_evidence",
        severity: "warning",
        path: task.path,
        message: "완료 상태 task에 자동 테스트, 수동 smoke, manual-only evidence 표시가 없습니다.",
        detail: { title: task.title, status: task.status },
      })
    }
  }

  for (const docPath of listPlanDriftSourceFiles(rootDir)) {
    const relativePath = normalizeDisplayPath(relative(rootDir, docPath))
    if (isHistoricalReferenceSource(relativePath, tasks)) continue
    const content = readFileSync(docPath, "utf-8")
    for (const reference of extractPathReferences(content)) {
      if (!pathReferenceExists(rootDir, reference)) {
        warnings.push({
          code: "missing_referenced_path",
          severity: "warning",
          path: relativePath,
          message: `문서에 적힌 경로가 repo에 없습니다: ${reference}`,
          detail: { reference },
        })
      }
    }
  }

  const currentPlanPath = join(rootDir, ".tasks", "plan.md")
  if (existsSync(currentPlanPath)) {
    const currentPlan = readFileSync(currentPlanPath, "utf-8")
    for (const plan of phasePlans) {
      if (!plan.exists) continue
      const selectedPhasePath = plan.path.replace(/^\.tasks\//, "")
      const pattern = new RegExp(
        `${escapeRegExp(selectedPhasePath)}[^\\n]*(존재하지|없|missing)`,
        "i",
      )
      if (pattern.test(currentPlan)) {
        warnings.push({
          code: "plan_outdated_claim",
          severity: "info",
          path: ".tasks/plan.md",
          message: `${plan.phase} plan 복구 상태와 current plan 설명이 충돌합니다.`,
          detail: { phase: plan.phase, planPath: plan.path },
        })
      }
    }
  }

  const releaseNoteEvidence = buildReleaseNoteEvidenceSummary(tasks, warnings)
  const blockedCount = warnings.filter((warning) => warning.severity === "blocked").length

  return {
    kind: "knowbee.plan-drift.report",
    version: 1,
    rootDir,
    createdAt: (options.now ?? new Date()).toISOString(),
    phasePlans,
    tasks,
    warnings,
    summary: {
      taskCount: tasks.length,
      completedTaskCount: tasks.filter((task) => task.completed).length,
      warningCount: warnings.filter((warning) => warning.severity === "warning").length,
      blockedCount,
      missingEvidenceCount: warnings.filter(
        (warning) => warning.code === "completed_without_evidence",
      ).length,
    },
    releaseNoteEvidence,
  }
}

export function buildReleaseNoteEvidenceSummary(
  tasks: TaskEvidenceMetadata[],
  warnings: PlanDriftWarning[],
): PlanDriftReleaseNoteEvidence {
  const missingEvidencePaths = new Set(
    warnings
      .filter((warning) => warning.code === "completed_without_evidence")
      .map((warning) => warning.path),
  )
  const warningCounts = Object.fromEntries(
    (
      [
        "phase_plan_missing",
        "missing_required_section",
        "completed_without_evidence",
        "missing_referenced_path",
        "plan_outdated_claim",
      ] as PlanDriftWarningCode[]
    ).map((code) => [code, 0]),
  ) as Record<PlanDriftWarningCode, number>
  for (const warning of warnings) warningCounts[warning.code] += 1

  return {
    verifiedTasks: tasks
      .filter(
        (task) =>
          task.completed &&
          task.hasEvidence &&
          !task.manualOnly &&
          !missingEvidencePaths.has(task.path),
      )
      .map((task) => ({
        path: task.path,
        title: task.title,
        status: task.status,
        evidenceCommands: task.evidenceCommands,
      })),
    manualOnlyTasks: tasks
      .filter((task) => task.completed && task.manualOnly)
      .map((task) => ({ path: task.path, title: task.title, status: task.status })),
    unverifiedTasks: tasks
      .filter((task) => task.completed && missingEvidencePaths.has(task.path))
      .map((task) => ({
        path: task.path,
        title: task.title,
        status: task.status,
        reason: "completed_without_evidence",
      })),
    pendingTasks: tasks
      .filter((task) => !task.completed)
      .map((task) => ({ path: task.path, title: task.title, status: task.status })),
    warningsByCode: warningCounts,
  }
}

function buildPhasePlanStatus(rootDir: string): PhasePlanStatus[] {
  return (["phase001", "phase002"] as const).map((phase) => {
    const candidates = phaseEvidenceCandidates(phase)
    const selectedPath = candidates.find((candidate) => existsSync(join(rootDir, candidate)))
    return { phase, path: selectedPath ?? candidates[0], exists: selectedPath !== undefined }
  })
}

function phaseEvidenceCandidates(phase: PhasePlanStatus["phase"]): [string, ...string[]] {
  const candidates = PHASE_EVIDENCE_CANDIDATES[phase]
  return [candidates[0], ...candidates.slice(1)]
}

function listRootTaskFiles(rootDir: string): string[] {
  const tasksDir = join(rootDir, ".tasks")
  if (!existsSync(tasksDir)) return []
  return readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^task\d+\.md$/i.test(entry.name))
    .map((entry) => join(tasksDir, entry.name))
    .sort()
}

function listPlanDriftSourceFiles(rootDir: string): string[] {
  const files: string[] = []
  const currentPlan = join(rootDir, ".tasks", "plan.md")
  if (existsSync(currentPlan)) files.push(currentPlan)
  for (const task of listRootTaskFiles(rootDir)) files.push(task)
  for (const plan of buildPhasePlanStatus(rootDir)) {
    const fullPath = join(rootDir, plan.path)
    if (existsSync(fullPath)) files.push(fullPath)
  }
  return unique(files)
}

function isHistoricalReferenceSource(path: string, tasks: TaskEvidenceMetadata[]): boolean {
  if (/^\.tasks\/phase\d+\//i.test(path)) return true
  return tasks.find((task) => task.path === path)?.completed === true
}

function parseTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() ?? null
}

function parseLegacyStatus(content: string): string {
  const match = content.match(/^>?\s*상태\s*:\s*(.+)$/m)
  return match?.[1]?.trim() ?? "상태 미기재"
}

function isNumberedTaskSchema(sections: string[]): boolean {
  return sections.includes("task purpose") && sections.includes("functional units")
}

function isCompactTaskSchema(sections: string[]): boolean {
  return sections.includes("purpose") && hasSection(sections, "Architecture/TDD")
}

function parseNumberedStatus(content: string): {
  status: "Done" | "In Progress"
  completed: boolean
} {
  const checkboxes = Array.from(content.matchAll(/^- \[([xX ])\]/gm))
  const completed =
    checkboxes.length > 0 && checkboxes.every((match) => match[1]?.toLowerCase() === "x")
  return { status: completed ? "Done" : "In Progress", completed }
}

function parseCurrentStatus(
  content: string,
  sections: string[],
): {
  status: "Done" | "In Progress" | "Invalid Status"
  valid: boolean
  checked: Record<CurrentStatusLabel, boolean>
} | null {
  if (!sections.includes("status")) return null

  const statusSection = extractSection(content, "Status")
  const entries = Array.from(
    statusSection.matchAll(/^- \[([xX ])\] (Ready|Red|Green|Tidy|Verified|Done)\s*$/gim),
  )
  const checked = Object.fromEntries(
    CURRENT_STATUS_LABELS.map((label) => [label, false]),
  ) as Record<CurrentStatusLabel, boolean>
  const counts = Object.fromEntries(CURRENT_STATUS_LABELS.map((label) => [label, 0])) as Record<
    CurrentStatusLabel,
    number
  >
  for (const entry of entries) {
    const label = CURRENT_STATUS_LABELS.find(
      (candidate) => candidate.toLowerCase() === entry[2]?.toLowerCase(),
    )
    if (!label) continue
    counts[label] += 1
    checked[label] = entry[1]?.toLowerCase() === "x"
  }

  const checkboxLineCount = Array.from(statusSection.matchAll(/^- \[[xX ]\]\s+.+$/gm)).length
  const valid =
    checkboxLineCount === CURRENT_STATUS_LABELS.length &&
    CURRENT_STATUS_LABELS.every((label) => counts[label] === 1)
  if (!valid) return { status: "Invalid Status", valid, checked }
  return { status: checked.Verified && checked.Done ? "Done" : "In Progress", valid, checked }
}

function parseSections(content: string): string[] {
  return Array.from(content.matchAll(/^#{2,4}\s+(.+)$/gm))
    .map((match) => normalizeSection(match[1] ?? ""))
    .filter(Boolean)
}

function hasSection(sections: string[], required: string): boolean {
  const normalizedRequired = normalizeSection(required)
  return sections.some(
    (section) => section.includes(normalizedRequired) || normalizedRequired.includes(section),
  )
}

function normalizeSection(value: string): string {
  return value
    .replace(/^\d+(?:\.\d+)*\.?\s*/, "")
    .replace(/^[-–—]\s*/, "")
    .replace(/[`*_]/g, "")
    .trim()
    .toLowerCase()
}

function extractSection(content: string, title: string): string {
  const headings = Array.from(content.matchAll(/^#{2,4}\s+(.+)$/gm))
  const wanted = normalizeSection(title)
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    if (!heading || !normalizeSection(heading[1] ?? "").includes(wanted)) continue
    const start = heading.index ?? 0
    const currentLevel = headingLevel(heading[0])
    const nextHeading = headings
      .slice(index + 1)
      .find(
        (candidate) => (candidate.index ?? 0) > start && headingLevel(candidate[0]) <= currentLevel,
      )
    return content.slice(start, nextHeading?.index ?? content.length)
  }
  return ""
}

function extractFirstSection(content: string, titles: string[]): string {
  for (const title of titles) {
    const section = extractSection(content, title)
    if (section) return section
  }
  return ""
}

function extractSections(content: string, titles: string[]): string {
  return unique(titles.map((title) => extractSection(content, title)).filter(Boolean)).join("\n")
}

function headingLevel(heading: string): number {
  return heading.match(/^#+/)?.[0].length ?? Number.POSITIVE_INFINITY
}

function hasCheckedItem(content: string): boolean {
  return /^- \[[xX]\]/m.test(content)
}

function extractCheckedEvidenceLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => /^- \[[xX]\](?:\s|$)/.test(line))
    .join("\n")
}

function extractCurrentValidationEvidence(content: string, sections: string[]): string {
  if (sections.includes("validation evidence")) {
    return extractEvidenceLines(extractSection(content, "Validation Evidence"))
  }
  return extractCheckedEvidenceLines(extractSection(content, "Validation"))
}

function extractEvidenceLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/^- \[ \](?:\s|$)/.test(line))
    .join("\n")
}

function hasCurrentCompletionEvidence(content: string): boolean {
  const body = content.replace(/^#{2,4}\s+.+$/m, "").trim()
  if (!body) return false
  return !/(?:^|\n)\s*-?\s*(?:미완료|pending|todo|not\s+run|검증\s*대기)[.!\s]*(?:$|\n)/i.test(body)
}

function hasStructuredValidationEvidence(content: string): boolean {
  const passed = /통과|성공|pass(?:ed)?|verified|완료/i.test(content)
  if (!passed) return false
  const testCount = /\b\d+\s*(?:개\s*)?(?:tests?|테스트)\b/i.test(content)
  const gate = /\b(?:typecheck|build|architecture|audit|biome|doctor|smoke)\b/i.test(content)
  return testCount || gate
}

function hasPassedManualSmokeEvidence(content: string): boolean {
  return /(?:manual|수동)[^\n]*(?:smoke|검증)[^\n]*(?:통과|성공|pass(?:ed)?|완료)/i.test(content)
}

function extractEvidenceCommands(content: string): string[] {
  const commands = Array.from(
    content.matchAll(/`([^`\n]*(?:pnpm|npm|node|cargo|vitest|knowbee|bash|scripts\/)[^`\n]*)`/g),
  )
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean)
  return unique(commands)
}

function extractPathReferences(content: string): string[] {
  const references = Array.from(content.matchAll(/`([^`\n]+)`/g))
    .map((match) => sanitizePathReference(match[1] ?? ""))
    .filter((reference): reference is string => reference !== null)
  return unique(references)
}

function sanitizePathReference(raw: string): string | null {
  let value = raw.trim().replace(/[),.;:]+$/g, "")
  if (!value || value.includes(" ")) return null
  value = value.replace(/#L\d+(?:C\d+)?$/i, "")
  if (/^\.tasks\/taskn+\.md$/i.test(value)) return null
  if (!REFERENCE_PREFIXES.some((prefix) => value.startsWith(prefix))) return null
  return value
}

function pathReferenceExists(rootDir: string, reference: string): boolean {
  if (reference.includes("*")) return globReferenceExists(rootDir, reference)
  return existsSync(join(rootDir, reference))
}

function globReferenceExists(rootDir: string, reference: string): boolean {
  const starIndex = reference.indexOf("*")
  const slashBeforeStar = reference.lastIndexOf("/", starIndex)
  const baseRelative = slashBeforeStar >= 0 ? reference.slice(0, slashBeforeStar) : "."
  const basePath = join(rootDir, baseRelative)
  if (!existsSync(basePath)) return false
  const pattern = new RegExp(`^${escapeRegExp(reference).replace(/\\\*/g, "[^/]*")}$`)
  return listFilesRecursive(basePath).some((filePath) =>
    pattern.test(normalizeDisplayPath(relative(rootDir, filePath))),
  )
}

function listFilesRecursive(rootDir: string): string[] {
  const stat = statSync(rootDir)
  if (stat.isFile()) return [rootDir]
  if (!stat.isDirectory()) return []
  const files: string[] = []
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue
    const fullPath = join(rootDir, entry.name)
    if (entry.isDirectory()) files.push(...listFilesRecursive(fullPath))
    else if (entry.isFile()) files.push(fullPath)
  }
  return files
}

function normalizeDisplayPath(path: string): string {
  return path.split(sep).join("/")
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
