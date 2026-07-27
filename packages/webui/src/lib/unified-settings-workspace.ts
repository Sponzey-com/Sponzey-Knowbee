import {
  UNIFIED_SETTINGS_SECTIONS,
  type UnifiedSettingsSectionId,
} from "./unified-settings-ownership"

export type SingleSettingsSectionLifecycle =
  | "clean"
  | "unsaved"
  | "saved_restart_required"
  | "active"
  | "unavailable"

export interface SingleSettingsSectionView {
  id: UnifiedSettingsSectionId
  label: string
  description: string
  required: boolean
  lifecycle: SingleSettingsSectionLifecycle
  stateLabel: string
  canSave: boolean
  active: boolean
  saveCommand: string | null
}

export interface SingleSettingsWorkspaceView {
  title: string
  selectedSectionId: UnifiedSettingsSectionId
  sections: SingleSettingsSectionView[]
  requiredSections: SingleSettingsSectionView[]
  optionalSections: SingleSettingsSectionView[]
}

export interface BuildSingleSettingsWorkspaceInput {
  locale: "ko" | "en"
  adminEnabled: boolean
  selectedSectionId?: string | null
  lifecycleBySection: Partial<Record<UnifiedSettingsSectionId, SingleSettingsSectionLifecycle>>
}

const SECTION_COPY: Record<UnifiedSettingsSectionId, {
  ko: { label: string; description: string }
  en: { label: string; description: string }
}> = {
  basics: {
    ko: { label: "기본 설정", description: "이름, 언어와 기본 작업 환경" },
    en: { label: "Basics", description: "Name, language, and default work environment" },
  },
  ai: {
    ko: { label: "AI", description: "응답과 작업에 사용할 AI 연결" },
    en: { label: "AI", description: "AI connection used for responses and work" },
  },
  connections: {
    ko: { label: "연결", description: "대화 채널과 컴퓨터 연결" },
    en: { label: "Connections", description: "Conversation channels and computer connection" },
  },
  sub_agents: {
    ko: { label: "서브 에이전트", description: "역할과 위임 구조" },
    en: { label: "Sub-Agents", description: "Roles and delegation structure" },
  },
  automation: {
    ko: { label: "자동화", description: "일정과 반복 작업" },
    en: { label: "Automation", description: "Schedules and recurring work" },
  },
  memory: {
    ko: { label: "메모리", description: "기억 보존과 압축 정책" },
    en: { label: "Memory", description: "Memory retention and compaction policy" },
  },
  permissions: {
    ko: { label: "권한", description: "실행 승인과 기능 접근 범위" },
    en: { label: "Permissions", description: "Execution approval and capability access" },
  },
  diagnostics: {
    ko: { label: "진단", description: "활성 runtime 상태 확인" },
    en: { label: "Diagnostics", description: "Active runtime status" },
  },
}

const STATE_COPY: Record<SingleSettingsSectionLifecycle, { ko: string; en: string }> = {
  clean: { ko: "변경 없음", en: "No changes" },
  unsaved: { ko: "저장 필요", en: "Unsaved changes" },
  saved_restart_required: { ko: "저장됨 · 다시 시작 필요", en: "Saved · Restart required" },
  active: { ko: "적용됨", en: "Active" },
  unavailable: { ko: "확인 불가", en: "Unavailable" },
}

export function buildSingleSettingsWorkspace(
  input: BuildSingleSettingsWorkspaceInput,
): SingleSettingsWorkspaceView {
  const sections = [...UNIFIED_SETTINGS_SECTIONS]
    .sort((left, right) => left.order - right.order)
    .filter((section) => section.visibility !== "admin" || input.adminEnabled)
    .map((section): SingleSettingsSectionView => {
      const lifecycle = input.lifecycleBySection[section.id] ?? "unavailable"
      const copy = SECTION_COPY[section.id][input.locale]
      return {
        id: section.id,
        label: copy.label,
        description: copy.description,
        required: section.required,
        lifecycle,
        stateLabel: STATE_COPY[lifecycle][input.locale],
        canSave: lifecycle === "unsaved" && !section.commandOwner.endsWith(".read"),
        active: lifecycle === "active",
        saveCommand: section.commandOwner.endsWith(".read") ? null : section.commandOwner,
      }
    })

  const requested = sections.find((section) => section.id === input.selectedSectionId)
  const selectedSectionId = (requested ?? sections.find((section) => section.required) ?? sections[0])?.id
  if (!selectedSectionId) {
    throw new Error("single settings workspace requires at least one visible section")
  }

  return {
    title: input.locale === "ko" ? "설정" : "Settings",
    selectedSectionId,
    sections,
    requiredSections: sections.filter((section) => section.required),
    optionalSections: sections.filter((section) => !section.required),
  }
}

export function selectSingleSettingsSection(
  workspace: SingleSettingsWorkspaceView,
  sectionId: string | null | undefined = workspace.selectedSectionId,
): SingleSettingsSectionView | null {
  return workspace.sections.find((section) => section.id === sectionId) ?? null
}
