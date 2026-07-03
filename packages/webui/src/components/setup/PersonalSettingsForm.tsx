import * as React from "react"
import type { SetupPersonalDraft } from "../../contracts/setup"
import { useUiI18n } from "../../lib/ui-i18n"

const LANGUAGE_OPTIONS = [
  { value: "ko", labelKo: "한국어", labelEn: "Korean" },
  { value: "en", labelKo: "영어", labelEn: "English" },
  { value: "ja", labelKo: "일본어", labelEn: "Japanese" },
  { value: "zh-CN", labelKo: "중국어(간체)", labelEn: "Chinese (Simplified)" },
]

function getTimezoneOptions(current: string): string[] {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  return Array.from(
    new Set([
      current,
      detected,
      "Asia/Seoul",
      "Asia/Tokyo",
      "UTC",
      "America/Los_Angeles",
      "America/New_York",
      "Europe/London",
    ].filter((item) => item && item.trim().length > 0)),
  )
}

export function PersonalSettingsForm({
  value,
  onChange,
  mainAgentName,
  onMainAgentNameChange,
  errors,
}: {
  value: SetupPersonalDraft
  onChange: (patch: Partial<SetupPersonalDraft>) => void
  mainAgentName?: string
  onMainAgentNameChange?: (name: string) => void
  errors?: Partial<Record<keyof SetupPersonalDraft, string>>
}) {
  const timezoneOptions = getTimezoneOptions(value.timezone)
  const { text } = useUiI18n()
  const userName = value.displayName || value.profileName
  const userNameError = errors?.displayName ?? errors?.profileName

  return (
    <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">{text("사용자 이름 *", "User name *")}</label>
          <input
            className="input"
            value={userName}
            onChange={(event) => onChange({ profileName: event.target.value, displayName: event.target.value })}
            placeholder={text("사용자를 부를 이름을 적어주세요", "Enter the name used for you")}
          />
          {userNameError ? <p className="mt-2 text-xs leading-5 text-red-600">{userNameError}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">{text("메인 에이전트 이름", "Main agent name")}</label>
          <input
            className="input"
            value={mainAgentName ?? ""}
            onChange={(event) => onMainAgentNameChange?.(event.target.value)}
            placeholder={text("예: 노비", "Example: Knowbee")}
          />
          <p className="mt-2 text-xs leading-5 text-stone-500">
            {text("에이전트가 자기 자신을 지칭할 때 쓰는 이름입니다.", "This is the name the agent uses for itself.")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">{text("기본 언어 (Language) *", "Default Language *")}</label>
          <select
            className="input"
            value={value.language}
            onChange={(event) => onChange({ language: event.target.value })}
          >
            <option value="">{text("언어를 선택해 주세요", "Choose a language")}</option>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {text(option.labelKo, option.labelEn)}
              </option>
            ))}
          </select>
          {errors?.language ? <p className="mt-2 text-xs leading-5 text-red-600">{errors.language}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">{text("시간대 (Timezone) *", "Timezone *")}</label>
          <select
            className="input"
            value={value.timezone}
            onChange={(event) => onChange({ timezone: event.target.value })}
          >
            <option value="">{text("시간대를 선택해 주세요", "Choose a timezone")}</option>
            {timezoneOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {errors?.timezone ? <p className="mt-2 text-xs leading-5 text-red-600">{errors.timezone}</p> : null}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-stone-700">{text("기본 작업 폴더 (Workspace) *", "Default Workspace *")}</label>
        <input
          className="input font-mono"
          value={value.workspace}
          onChange={(event) => onChange({ workspace: event.target.value })}
          placeholder={text("예: ./Work", "Example: ./Work")}
        />
        {errors?.workspace ? <p className="mt-2 text-xs leading-5 text-red-600">{errors.workspace}</p> : null}
      </div>

      <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
        <div className="font-medium text-stone-800">{text("이 값은 어디에 쓰이나요?", "Where is this used?")}</div>
        <div className="mt-2">{text("사용자 이름은 대화와 화면에서 사용자를 지칭할 때 사용합니다.", "The user name is used to refer to you in conversations and on screen.")}</div>
        <div>{text("메인 에이전트 이름은 에이전트가 자기 자신을 소개하고 응답할 때 사용하는 이름입니다.", "The main agent name is used when the agent introduces or refers to itself.")}</div>
        <div>{text("기본 언어와 시간대는 이후 응답 언어, 일정 처리, 알림 시간 계산의 기준값이 됩니다.", "Default language and timezone are used for response language, scheduling, and notification timing.")}</div>
        <div>{text("기본 작업 폴더는 이후 파일 작업이나 자동화가 시작될 때 기본 위치로 재사용됩니다.", "The default workspace is reused as the starting location for later file work and automation.")}</div>
      </div>
    </div>
  )
}
