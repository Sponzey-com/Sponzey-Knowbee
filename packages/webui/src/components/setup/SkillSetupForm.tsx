import type { SetupSkillDraftItem } from "../../contracts/setup"
import { useUiI18n } from "../../lib/ui-i18n"
import type { SkillItemErrors } from "../../lib/setupFlow"

function createDraftSkill(): SetupSkillDraftItem {
  return {
    id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    description: "",
    source: "local",
    path: "",
    enabled: true,
    required: false,
    status: "disabled",
    reason: undefined,
  }
}

export function SkillSetupForm({
  value,
  onChange,
  onTest,
  testingSkillId,
  errors = {},
}: {
  value: { items: SetupSkillDraftItem[] }
  onChange: (value: { items: SetupSkillDraftItem[] }) => void
  onTest: (skillId: string) => void
  testingSkillId?: string | null
  errors?: Record<string, SkillItemErrors>
}) {
  const { text } = useUiI18n()

  function updateItem(skillId: string, patch: Partial<SetupSkillDraftItem>) {
    onChange({
      items: value.items.map((item) => (item.id === skillId ? { ...item, ...patch } : item)),
    })
  }

  function addSkill() {
    onChange({ items: [...value.items, createDraftSkill()] })
  }

  function removeSkill(skillId: string) {
    onChange({ items: value.items.filter((item) => item.id !== skillId) })
  }

  return (
    <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-stone-900">{text("작업 능력 확장", "Work ability extensions")}</div>
          <div className="mt-1 text-sm leading-6 text-stone-600">
            {text("메인 에이전트가 참고할 작업 지침이나 확장 능력을 등록하는 단계입니다. 지금은 로컬 항목과 기본 항목 표시를 지원합니다.", "Register helper instructions and extra abilities the main agent can use. This screen supports local items and built-in markers.")}
          </div>
        </div>
        <button
          type="button"
          onClick={addSkill}
          className="rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700"
        >
          {text("작업 능력 추가", "Add work ability")}
        </button>
      </div>

      <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
        {text("작업 능력이 없으면 특정 작업을 더 쉽게 처리하도록 가르치는 기능이 부족할 수 있습니다.", "Without work abilities, the main agent may have fewer specialized instructions for handling certain tasks easily.")}
      </div>

      {value.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-500">
          {text("아직 추가된 작업 능력이 없습니다. 필요하면 추가하고 위치나 상태를 확인해 주세요.", "No work abilities have been added yet. Add one if needed, then check the location or status.")}
        </div>
      ) : null}

      <div className="space-y-4">
        {value.items.map((item) => {
          const itemErrors = errors[item.id]
          const isTesting = testingSkillId === item.id
          return (
            <SkillItemEditorCard
              key={item.id}
              item={item}
              isTesting={isTesting}
              errors={itemErrors}
              onChange={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeSkill(item.id)}
              onTest={() => onTest(item.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

export function SkillItemEditorCard({
  item,
  isTesting = false,
  errors,
  onChange,
  onRemove,
  onTest,
}: {
  item: SetupSkillDraftItem
  isTesting?: boolean
  errors?: SkillItemErrors
  onChange: (patch: Partial<SetupSkillDraftItem>) => void
  onRemove: () => void
  onTest: () => void
}) {
  const { text, displayText } = useUiI18n()
  const statusTone = item.status === "ready"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : item.status === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-stone-200 bg-stone-100 text-stone-700"

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-stone-900">{item.label.trim() || text("새 작업 능력", "New work ability")}</div>
          <div className="mt-1 text-xs text-stone-500">{text("작업 능력 확장", "Work ability extension")}</div>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}`}>
          {item.status === "ready" ? text("확인됨", "Ready") : item.status === "error" ? text("오류", "Error") : text("준비 전", "Not Ready")}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">{text("작업 능력 이름 *", "Work ability name *")}</label>
          <input
            className="input"
            value={item.label}
            onChange={(event) => onChange({ label: event.target.value, status: "disabled", reason: undefined })}
            placeholder={text("예: 파일 정리 도우미", "Example: File Organizer Helper")}
          />
          {errors?.label ? <p className="mt-2 text-xs leading-5 text-red-600">{errors.label}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">{text("유형", "Type")}</label>
          <select
            className="input"
            value={item.source}
            onChange={(event) => onChange({
              source: event.target.value as SetupSkillDraftItem["source"],
              status: event.target.value === "builtin" ? "ready" : "disabled",
              reason: event.target.value === "builtin" ? text("기본 작업 능력으로 표시됩니다.", "Shown as a built-in work ability.") : undefined,
            })}
          >
            <option value="local">{text("로컬 항목", "Local item")}</option>
            <option value="builtin">{text("기본 항목", "Built-in item")}</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-stone-700">{text("설명 (Description)", "Description")}</label>
        <textarea
          className="input min-h-[88px] text-sm"
          value={item.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder={text("이 작업 능력이 어떤 일을 더 쉽게 해주는지 적어주세요", "Describe what this work ability helps with")}
        />
      </div>

      {item.source === "local" ? (
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-stone-700">{text("로컬 위치 *", "Local location *")}</label>
          <input
            className="input font-mono"
            value={item.path}
            onChange={(event) => onChange({ path: event.target.value, status: "disabled", reason: undefined })}
            placeholder={text("예: ./work-abilities/document-summary", "Example: ./work-abilities/document-summary")}
          />
          {errors?.path ? <p className="mt-2 text-xs leading-5 text-red-600">{errors.path}</p> : null}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-stone-100 px-3 py-3 text-sm leading-6 text-stone-700">
          {text("기본 항목은 위치 입력 없이 바로 사용할 수 있는 안내용 항목입니다.", "Built-in items are guidance entries that can be used without entering a location.")}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-3 text-sm font-medium text-stone-700">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          {text("이 작업 능력 사용", "Use this work ability")}
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-stone-700">
          <input
            type="checkbox"
            checked={item.required}
            onChange={(event) => onChange({ required: event.target.checked })}
          />
          {text("필수 작업 능력으로 표시", "Mark as required")}
        </label>
      </div>

      {item.reason ? (
        <div className={`mt-4 rounded-xl px-3 py-3 text-sm leading-6 ${item.status === "error" ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-700"}`}>
          {displayText(item.reason)}
        </div>
      ) : null}
      {errors?.status ? <p className="mt-2 text-xs leading-5 text-red-600">{errors.status}</p> : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {item.source === "local" ? (
          <button
            type="button"
            onClick={onTest}
            disabled={isTesting}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isTesting ? text("위치 확인 중...", "Checking location...") : text("위치 확인", "Check location")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700"
        >
          {text("삭제", "Delete")}
        </button>
      </div>
    </div>
  )
}
