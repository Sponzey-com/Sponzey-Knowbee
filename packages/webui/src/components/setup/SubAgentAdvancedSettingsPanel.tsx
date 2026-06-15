import React, { useEffect, useState } from "react"
import type {
  SubAgentAdvancedDetailSectionView,
  SubAgentAdvancedDetailView,
  SubAgentAdvancedListRowView,
  SubAgentAdvancedMutationResult,
  SubAgentAdvancedSettingsView,
  UpdateSubAgentCapabilityPolicyCommand,
  UpdateSubAgentDelegationPolicyCommand,
  UpdateSubAgentIdentityCommand,
  UpdateSubAgentMemoryPolicyCommand,
  UpdateSubAgentModelPolicyCommand,
  UpdateSubAgentSkillMcpBindingsCommand,
} from "../../lib/advanced-sub-agent-settings"

export function SubAgentAdvancedSettingsPanel({
  view,
  saving,
  onSelectAgent,
  onUpdateIdentity,
  onUpdateModelPolicy,
  onUpdateSkillMcpBindings,
  onUpdateMemoryPolicy,
  onUpdateCapabilityPolicy,
  onUpdateDelegationPolicy,
  onSave,
  onCancel,
  onRefresh,
}: {
  view: SubAgentAdvancedSettingsView
  saving: boolean
  onSelectAgent: (agentId: string) => void
  onUpdateIdentity?: (
    command: UpdateSubAgentIdentityCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateModelPolicy?: (
    command: UpdateSubAgentModelPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateSkillMcpBindings?: (
    command: UpdateSubAgentSkillMcpBindingsCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateMemoryPolicy?: (
    command: UpdateSubAgentMemoryPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateCapabilityPolicy?: (
    command: UpdateSubAgentCapabilityPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateDelegationPolicy?: (
    command: UpdateSubAgentDelegationPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onSave: () => void
  onCancel: () => void
  onRefresh: () => void
}) {
  return (
    <section
      className="min-w-0 space-y-4 [overflow-wrap:anywhere]"
      data-testid="sub-agent-advanced-settings-panel"
    >
      <SubAgentStatusBar
        view={view}
        saving={saving}
        onSave={onSave}
        onCancel={onCancel}
        onRefresh={onRefresh}
      />
      <GlobalPolicySummary view={view} />
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <SubAgentList view={view} onSelectAgent={onSelectAgent} />
        <SubAgentDetail
          view={view}
          onUpdateIdentity={onUpdateIdentity}
          onUpdateModelPolicy={onUpdateModelPolicy}
          onUpdateSkillMcpBindings={onUpdateSkillMcpBindings}
          onUpdateMemoryPolicy={onUpdateMemoryPolicy}
          onUpdateCapabilityPolicy={onUpdateCapabilityPolicy}
          onUpdateDelegationPolicy={onUpdateDelegationPolicy}
        />
      </div>
    </section>
  )
}

function SubAgentStatusBar({
  view,
  saving,
  onSave,
  onCancel,
  onRefresh,
}: {
  view: SubAgentAdvancedSettingsView
  saving: boolean
  onSave: () => void
  onCancel: () => void
  onRefresh: () => void
}) {
  const saveDisabled = !view.statusBar.canSave || saving
  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
      data-testid="sub-agent-advanced-status-bar"
      data-validation-tone={view.statusBar.validationTone}
    >
      <div className="flex flex-wrap gap-2 text-xs font-semibold text-stone-700">
        <StatusChip
          label={view.statusBar.draftStateLabel}
          tone={view.statusBar.hasDraftChanges ? "warning" : "success"}
        />
        <StatusChip label={view.statusBar.validationLabel} tone={view.statusBar.validationTone} />
        <StatusChip label={`saved ${view.statusBar.savedVersionLabel}`} tone="info" />
        <StatusChip label={`published ${view.statusBar.publishedVersionLabel}`} tone="info" />
        <StatusChip label={`runtime ${view.statusBar.runtimeActiveVersionLabel}`} tone="info" />
        <StatusChip
          label={`warning ${view.statusBar.warningCount}`}
          tone={view.statusBar.warningCount > 0 ? "warning" : "success"}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={!view.statusBar.hasDraftChanges || saving}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          title={view.statusBar.saveDisabledReason}
          className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </section>
  )
}

function GlobalPolicySummary({ view }: { view: SubAgentAdvancedSettingsView }) {
  const policy = view.globalPolicy
  return (
    <section
      className="rounded-xl border border-stone-200 bg-white p-4"
      data-testid="sub-agent-advanced-global-policy"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
            공통 정책
          </div>
          <h2 className="mt-1 text-lg font-semibold text-stone-950">
            {policy.orchestrationModeLabel}
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">{policy.impactSummary}</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            <span className="font-semibold text-stone-700">{policy.rootAgentLabel}</span> ·{" "}
            {policy.rootAgentNotice}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-stone-700">
          <span className="rounded-full bg-stone-100 px-2.5 py-1">
            feature {policy.featureFlagLabel}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1">
            {policy.affectedAgentCount} agents
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1">
            {policy.inheritedAgentCount} inherited
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1">
            {policy.overriddenAgentCount} override
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <PolicyMetric label="기본 모델" value={policy.defaultModelLabel} />
        <PolicyMetric label="Memory" value={policy.defaultMemoryLabel} />
        <PolicyMetric label="권한" value={policy.defaultPermissionLabel} />
        <PolicyMetric label="Skill/MCP" value={policy.commonSkillMcpLabel} />
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">{policy.catalogSummary}</p>
    </section>
  )
}

function SubAgentList({
  view,
  onSelectAgent,
}: {
  view: SubAgentAdvancedSettingsView
  onSelectAgent: (agentId: string) => void
}) {
  return (
    <section
      className="min-w-0 rounded-xl border border-stone-200 bg-white p-3 [overflow-wrap:anywhere]"
      data-testid="sub-agent-advanced-list"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-stone-950">서브 에이전트</div>
          <div className="mt-0.5 text-xs text-stone-500">
            {view.archivedHiddenCount > 0
              ? `${view.archivedHiddenCount}개 보관 항목 숨김`
              : "보관 항목 숨김"}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-stone-600">
          <span className="rounded-full bg-stone-100 px-2 py-0.5">{view.filter}</span>
          {view.query ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5">{view.query}</span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {view.rows.length > 0 ? (
          view.rows.map((row) => (
            <SubAgentRow key={row.agentId} row={row} onSelectAgent={onSelectAgent} />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-600">
            <div className="font-semibold text-stone-900">{view.emptyState.title}</div>
            <p className="mt-1">{view.emptyState.message}</p>
            <div className="mt-3 text-xs font-semibold text-stone-500">
              {view.emptyState.ctaLabel}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function SubAgentRow({
  row,
  onSelectAgent,
}: {
  row: SubAgentAdvancedListRowView
  onSelectAgent: (agentId: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectAgent(row.agentId)}
      className={`w-full rounded-lg border px-3 py-2 text-left ${row.selected ? "border-stone-900 bg-stone-50" : "border-stone-200 bg-white"}`}
      data-testid="sub-agent-advanced-row"
      data-selected={row.selected}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-stone-950" title={row.nickname}>
            {row.nickname}
          </div>
          <div
            className="mt-0.5 truncate text-xs font-medium text-stone-600"
            title={row.displayName}
          >
            {row.displayName}
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{row.role}</div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateToneClass(row.readinessState)}`}
          >
            {row.readinessLabel}
          </div>
          <div className="mt-1 text-[10px] font-semibold text-stone-500">
            warn {row.warningCount}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-stone-600">
        <span className="rounded-full bg-stone-100 px-2 py-0.5">{row.lifecycleLabel}</span>
        <span className="rounded-full bg-stone-100 px-2 py-0.5">{row.runtimeLabel}</span>
        <span className="rounded-full bg-stone-100 px-2 py-0.5">{row.lastUpdatedLabel}</span>
      </div>
    </button>
  )
}

function SubAgentDetail({
  view,
  onUpdateIdentity,
  onUpdateModelPolicy,
  onUpdateSkillMcpBindings,
  onUpdateMemoryPolicy,
  onUpdateCapabilityPolicy,
  onUpdateDelegationPolicy,
}: {
  view: SubAgentAdvancedSettingsView
  onUpdateIdentity?: (
    command: UpdateSubAgentIdentityCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateModelPolicy?: (
    command: UpdateSubAgentModelPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateSkillMcpBindings?: (
    command: UpdateSubAgentSkillMcpBindingsCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateMemoryPolicy?: (
    command: UpdateSubAgentMemoryPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateCapabilityPolicy?: (
    command: UpdateSubAgentCapabilityPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
  onUpdateDelegationPolicy?: (
    command: UpdateSubAgentDelegationPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
}) {
  const detail = view.selectedAgent
  return (
    <section
      className="min-w-0 rounded-xl border border-stone-200 bg-white p-4 [overflow-wrap:anywhere]"
      data-testid="sub-agent-advanced-detail"
    >
      {detail ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                Agent detail
              </div>
              <h2 className="mt-1 break-words text-xl font-semibold text-stone-950">
                {detail.displayName}
              </h2>
              <div className="mt-1 text-sm font-semibold text-stone-600">{detail.nickname}</div>
              <p className="mt-2 break-words text-sm leading-6 text-stone-600 [overflow-wrap:anywhere]">
                {detail.description || detail.role}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5 text-xs font-semibold">
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                {detail.lifecycleLabel}
              </span>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800">
                {detail.readinessLabel}
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                {detail.runtimeLabel}
              </span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <IdentityEditor
              key={`identity:${detail.agentId}`}
              detail={detail}
              onUpdateIdentity={onUpdateIdentity}
            />
            <ModelPolicyEditor
              key={`model:${detail.agentId}`}
              detail={detail}
              onUpdateModelPolicy={onUpdateModelPolicy}
            />
          </div>
          <div className="mt-4">
            <SkillMcpBindingEditor
              key={`skill-mcp:${detail.agentId}`}
              detail={detail}
              onUpdateSkillMcpBindings={onUpdateSkillMcpBindings}
            />
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            <MemoryPolicyEditor
              key={`memory:${detail.agentId}`}
              detail={detail}
              onUpdateMemoryPolicy={onUpdateMemoryPolicy}
            />
            <PermissionPolicyEditor
              key={`permission:${detail.agentId}`}
              detail={detail}
              onUpdateCapabilityPolicy={onUpdateCapabilityPolicy}
            />
            <DelegationPolicyEditor
              key={`delegation:${detail.agentId}`}
              detail={detail}
              onUpdateDelegationPolicy={onUpdateDelegationPolicy}
            />
          </div>
          <RuntimeMonitoringPanel detail={detail} />
          <div
            className="mt-4 grid gap-3 md:grid-cols-2"
            data-testid="sub-agent-advanced-detail-sections"
          >
            {detail.sections.map((section) => (
              <DetailSection key={section.id} section={section} />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 p-6 text-sm leading-6 text-stone-600">
          목록에서 서브 에이전트를 선택하세요.
        </div>
      )}
    </section>
  )
}

function IdentityEditor({
  detail,
  onUpdateIdentity,
}: {
  detail: SubAgentAdvancedDetailView
  onUpdateIdentity?: (
    command: UpdateSubAgentIdentityCommand,
  ) => SubAgentAdvancedMutationResult | undefined
}) {
  const [displayName, setDisplayName] = useState(detail.identity.displayName)
  const [nickname, setNickname] = useState(detail.identity.nickname)
  const [role, setRole] = useState(detail.identity.role)
  const [description, setDescription] = useState(detail.identity.description)
  const [message, setMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setDisplayName(detail.identity.displayName)
    setNickname(detail.identity.nickname)
    setRole(detail.identity.role)
    setDescription(detail.identity.description)
    setMessage("")
    setFieldErrors({})
  }, [
    detail.identity.displayName,
    detail.identity.nickname,
    detail.identity.role,
    detail.identity.description,
  ])

  const disabled = detail.identity.rootReadOnly || !onUpdateIdentity
  const save = () => {
    if (!onUpdateIdentity) return
    const result = onUpdateIdentity({
      kind: "update_identity",
      source: "advanced",
      agentId: detail.agentId,
      displayName,
      nickname,
      role,
      description,
      attributionLabel: nickname.trim() || displayName.trim(),
    })
    if (result) {
      setMessage(result.message)
      setFieldErrors(result.fieldErrors)
    }
  }

  return (
    <section
      className="rounded-lg border border-stone-200 bg-stone-50 p-3"
      data-testid="sub-agent-identity-editor"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-950">기본 정보</h3>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {detail.identity.attributionLabel} 이름으로 대화와 위임 결과에 표시됩니다.
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-600">
          parent {detail.identity.parentLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        <LabeledInput
          label="이름"
          value={displayName}
          onChange={setDisplayName}
          disabled={disabled}
          error={fieldErrors.displayName}
        />
        <LabeledInput
          label="별명"
          value={nickname}
          onChange={setNickname}
          disabled={disabled}
          error={fieldErrors.nickname}
        />
        <LabeledInput
          label="역할"
          value={role}
          onChange={setRole}
          disabled={disabled}
          error={fieldErrors.role}
        />
        <label className="grid gap-1 text-xs font-semibold text-stone-700">
          설명
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={disabled}
            rows={4}
            className="min-h-[96px] resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal leading-6 text-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {fieldErrors.description ? (
            <span className="text-[11px] font-semibold text-red-700">
              {fieldErrors.description}
            </span>
          ) : null}
        </label>
      </div>
      {detail.identity.warnings.length > 0 ? (
        <div className="mt-2 grid gap-1 text-[11px] font-semibold text-amber-800">
          {detail.identity.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      <details className="mt-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-500">
        <summary className="cursor-pointer font-semibold text-stone-700">debug</summary>
        <div className="mt-2 break-all">internal id: {detail.identity.internalDebugId}</div>
      </details>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className={`text-xs font-semibold ${message && Object.keys(fieldErrors).length > 0 ? "text-red-700" : "text-stone-500"}`}
        >
          {message}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          기본 정보 저장
        </button>
      </div>
    </section>
  )
}

function ModelPolicyEditor({
  detail,
  onUpdateModelPolicy,
}: {
  detail: SubAgentAdvancedDetailView
  onUpdateModelPolicy?: (
    command: UpdateSubAgentModelPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
}) {
  const [mode, setMode] = useState<"inherit" | "override">(detail.modelPolicy.mode)
  const [providerId, setProviderId] = useState(detail.modelPolicy.providerId)
  const [modelId, setModelId] = useState(detail.modelPolicy.modelId)
  const [fallbackModelId, setFallbackModelId] = useState(detail.modelPolicy.fallbackModelId)
  const [message, setMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setMode(detail.modelPolicy.mode)
    setProviderId(detail.modelPolicy.providerId)
    setModelId(detail.modelPolicy.modelId)
    setFallbackModelId(detail.modelPolicy.fallbackModelId)
    setMessage("")
    setFieldErrors({})
  }, [
    detail.modelPolicy.mode,
    detail.modelPolicy.providerId,
    detail.modelPolicy.modelId,
    detail.modelPolicy.fallbackModelId,
  ])

  const disabled = !onUpdateModelPolicy
  const providerOptions = detail.modelPolicy.providerOptions
  const modelOptions = detail.modelPolicy.options.filter(
    (option) => option.providerId === providerId,
  )
  const save = () => {
    if (!onUpdateModelPolicy) return
    const result = onUpdateModelPolicy({
      kind: "update_model_policy",
      source: "advanced",
      agentId: detail.agentId,
      mode,
      ...(mode === "override"
        ? {
            providerId,
            modelId,
            ...(fallbackModelId ? { fallbackModelId } : {}),
          }
        : {}),
    })
    if (result) {
      setMessage(result.message)
      setFieldErrors(result.fieldErrors)
    }
  }

  return (
    <section
      className="rounded-lg border border-stone-200 bg-stone-50 p-3"
      data-testid="sub-agent-model-policy-editor"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-950">모델 정책</h3>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {detail.modelPolicy.effectiveModelLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {detail.modelPolicy.badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-600"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="flex rounded-lg border border-stone-200 bg-white p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("inherit")}
            disabled={disabled}
            className={`flex-1 rounded-md px-2 py-1.5 ${mode === "inherit" ? "bg-stone-900 text-white" : "text-stone-600"}`}
          >
            global 상속
          </button>
          <button
            type="button"
            onClick={() => setMode("override")}
            disabled={disabled}
            className={`flex-1 rounded-md px-2 py-1.5 ${mode === "override" ? "bg-stone-900 text-white" : "text-stone-600"}`}
          >
            override
          </button>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-600">
          상속 모델:{" "}
          <span className="font-semibold text-stone-800">
            {detail.modelPolicy.inheritedModelLabel}
          </span>
        </div>
        {mode === "override" ? (
          <>
            <label className="grid gap-1 text-xs font-semibold text-stone-700">
              Provider
              <select
                value={providerId}
                onChange={(event) => {
                  setProviderId(event.target.value)
                  const firstModel =
                    detail.modelPolicy.options.find(
                      (option) => option.providerId === event.target.value,
                    )?.modelId ?? ""
                  setModelId(firstModel)
                  setFallbackModelId("")
                }}
                disabled={disabled}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800"
              >
                <option value="">provider 선택</option>
                {providerOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                    {provider.available ? "" : " (unavailable)"}
                  </option>
                ))}
              </select>
              {fieldErrors.providerId ? (
                <span className="text-[11px] font-semibold text-red-700">
                  {fieldErrors.providerId}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1 text-xs font-semibold text-stone-700">
              Model
              <select
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                disabled={disabled}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800"
              >
                <option value="">model 선택</option>
                {modelOptions.map((option) => (
                  <option key={`${option.providerId}:${option.modelId}`} value={option.modelId}>
                    {option.modelId}
                    {option.available ? "" : " (unavailable)"}
                  </option>
                ))}
              </select>
              {fieldErrors.modelId ? (
                <span className="text-[11px] font-semibold text-red-700">
                  {fieldErrors.modelId}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1 text-xs font-semibold text-stone-700">
              Fallback model
              <select
                value={fallbackModelId}
                onChange={(event) => setFallbackModelId(event.target.value)}
                disabled={disabled}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800"
              >
                <option value="">fallback 없음</option>
                {modelOptions.map((option) => (
                  <option
                    key={`fallback:${option.providerId}:${option.modelId}`}
                    value={option.modelId}
                  >
                    {option.modelId}
                    {option.available ? "" : " (unavailable)"}
                  </option>
                ))}
              </select>
              {fieldErrors.fallbackModelId ? (
                <span className="text-[11px] font-semibold text-red-700">
                  {fieldErrors.fallbackModelId}
                </span>
              ) : null}
            </label>
          </>
        ) : null}
      </div>
      {[...detail.modelPolicy.warnings, ...detail.modelPolicy.errors].length > 0 ? (
        <div className="mt-2 grid gap-1 text-[11px] font-semibold text-amber-800">
          {[...detail.modelPolicy.warnings, ...detail.modelPolicy.errors].map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className={`text-xs font-semibold ${message && Object.keys(fieldErrors).length > 0 ? "text-red-700" : "text-stone-500"}`}
        >
          {message ||
            (detail.modelPolicy.runtimeReflectionRequired ? "저장 후 runtime 반영 필요" : "")}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          모델 정책 저장
        </button>
      </div>
    </section>
  )
}

function SkillMcpBindingEditor({
  detail,
  onUpdateSkillMcpBindings,
}: {
  detail: SubAgentAdvancedDetailView
  onUpdateSkillMcpBindings?: (
    command: UpdateSubAgentSkillMcpBindingsCommand,
  ) => SubAgentAdvancedMutationResult | undefined
}) {
  const [enabledSkillIds, setEnabledSkillIds] = useState(detail.skillMcp.enabledSkillIds)
  const [enabledMcpServerIds, setEnabledMcpServerIds] = useState(
    detail.skillMcp.enabledMcpServerIds,
  )
  const [disabledToolNames, setDisabledToolNames] = useState(detail.skillMcp.disabledToolNames)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "skill" | "mcp">("all")
  const [message, setMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setEnabledSkillIds(detail.skillMcp.enabledSkillIds)
    setEnabledMcpServerIds(detail.skillMcp.enabledMcpServerIds)
    setDisabledToolNames(detail.skillMcp.disabledToolNames)
    setQuery("")
    setFilter("all")
    setMessage("")
    setFieldErrors({})
  }, [
    detail.skillMcp.enabledSkillIds,
    detail.skillMcp.enabledMcpServerIds,
    detail.skillMcp.disabledToolNames,
  ])

  const disabled = !onUpdateSkillMcpBindings
  const enabledSkillSet = new Set(enabledSkillIds)
  const enabledMcpSet = new Set(enabledMcpServerIds)
  const disabledToolSet = new Set(disabledToolNames)
  const normalizedQuery = query.trim().toLowerCase()
  const visibleItems = detail.skillMcp.items.filter((item) => {
    if (filter === "skill" && item.kind !== "skill") return false
    if (filter === "mcp" && item.kind === "skill") return false
    if (!normalizedQuery) return true
    return [item.label, item.description, item.id, item.sourceLabel].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    )
  })
  const mcpToolIds = new Set(
    detail.skillMcp.items.filter((item) => item.kind === "mcp_tool").map((item) => item.id),
  )
  const preservedNonMcpToolNames = detail.skillMcp.enabledToolNames.filter(
    (toolName) => !mcpToolIds.has(toolName),
  )
  const enabledMcpToolNames = detail.skillMcp.items
    .filter(
      (item) =>
        item.kind === "mcp_tool" &&
        item.parentId &&
        enabledMcpSet.has(item.parentId) &&
        !disabledToolSet.has(item.id),
    )
    .map((item) => item.id)
  const enabledToolNames = Array.from(
    new Set([...preservedNonMcpToolNames, ...enabledMcpToolNames]),
  )

  const toggleItem = (item: SubAgentAdvancedDetailView["skillMcp"]["items"][number]) => {
    if (disabled) return
    if (item.kind === "skill") {
      setEnabledSkillIds((current) =>
        current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
      )
      return
    }
    if (item.kind === "mcp_server") {
      setEnabledMcpServerIds((current) =>
        current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
      )
      return
    }
    if (!item.parentId || !enabledMcpSet.has(item.parentId)) return
    setDisabledToolNames((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
    )
  }

  const save = () => {
    if (!onUpdateSkillMcpBindings) return
    const result = onUpdateSkillMcpBindings({
      kind: "update_skill_mcp_bindings",
      source: "advanced",
      agentId: detail.agentId,
      enabledSkillIds,
      enabledMcpServerIds,
      enabledToolNames,
      disabledToolNames,
    })
    if (result) {
      setMessage(result.message)
      setFieldErrors(result.fieldErrors)
    }
  }

  return (
    <section
      className="rounded-lg border border-stone-200 bg-stone-50 p-3"
      data-testid="sub-agent-skill-mcp-editor"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-950">Skill/MCP binding</h3>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {detail.skillMcp.commonCatalogLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 text-[10px] font-semibold text-stone-600">
          <span className="rounded-full bg-white px-2 py-0.5">
            enabled {enabledSkillIds.length + enabledMcpServerIds.length}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5">
            unavailable {detail.skillMcp.unavailableCount}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5">
            connection {detail.skillMcp.connectionIssueCount}
          </span>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
          placeholder="Skill, MCP, tool 검색"
        />
        <div className="flex rounded-lg border border-stone-200 bg-white p-1 text-xs font-semibold">
          {(["all", "skill", "mcp"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-md px-2 py-1.5 ${filter === id ? "bg-stone-900 text-white" : "text-stone-600"}`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 max-h-[360px] overflow-y-auto pr-1">
        <div className="grid gap-2">
          {visibleItems.map((item) => {
            const checked =
              item.kind === "skill"
                ? enabledSkillSet.has(item.id)
                : item.kind === "mcp_server"
                  ? enabledMcpSet.has(item.id)
                  : Boolean(
                      item.parentId &&
                        enabledMcpSet.has(item.parentId) &&
                        !disabledToolSet.has(item.id),
                    )
            const itemDisabled =
              disabled ||
              !item.available ||
              (item.kind === "mcp_tool" && (!item.parentId || !enabledMcpSet.has(item.parentId)))
            return (
              <label
                key={`${item.kind}:${item.id}`}
                className={`grid gap-2 rounded-lg border bg-white px-3 py-2 text-sm ${checked ? "border-stone-900" : "border-stone-200"} ${itemDisabled ? "opacity-70" : ""}`}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="break-words font-semibold text-stone-950">{item.label}</span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                        {item.kind}
                      </span>
                      {item.recommendedForAgent ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                          recommended draft
                        </span>
                      ) : null}
                      {item.approvalRequired ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          approval
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">
                      {item.description}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={itemDisabled}
                    onChange={() => toggleItem(item)}
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
                    {item.sourceLabel}
                  </span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
                    {item.riskLabel}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${connectionToneClass(item.connectionState)}`}
                  >
                    {item.statusLabel}
                  </span>
                </div>
                {item.warning ? (
                  <div className="text-[11px] font-semibold text-amber-800">{item.warning}</div>
                ) : null}
              </label>
            )
          })}
          {visibleItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-200 bg-white px-3 py-5 text-center text-sm text-stone-500">
              표시할 Skill/MCP 항목이 없습니다.
            </div>
          ) : null}
        </div>
      </div>
      {[...detail.skillMcp.warnings, ...detail.skillMcp.errors].length > 0 ? (
        <div className="mt-2 grid gap-1 text-[11px] font-semibold text-amber-800">
          {[...detail.skillMcp.warnings, ...detail.skillMcp.errors].map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className={`text-xs font-semibold ${message && Object.keys(fieldErrors).length > 0 ? "text-red-700" : "text-stone-500"}`}
        >
          {message ||
            fieldErrors.enabledSkillIds ||
            fieldErrors.enabledMcpServerIds ||
            "공통 catalog와 agent별 binding은 별도로 저장됩니다."}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Skill/MCP 저장
        </button>
      </div>
    </section>
  )
}

function MemoryPolicyEditor({
  detail,
  onUpdateMemoryPolicy,
}: {
  detail: SubAgentAdvancedDetailView
  onUpdateMemoryPolicy?: (
    command: UpdateSubAgentMemoryPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
}) {
  const [compactThreshold, setCompactThreshold] = useState(detail.memory.compactThreshold)
  const [capsuleMode, setCapsuleMode] = useState(detail.memory.capsuleMode)
  const [message, setMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setCompactThreshold(detail.memory.compactThreshold)
    setCapsuleMode(detail.memory.capsuleMode)
    setMessage("")
    setFieldErrors({})
  }, [detail.memory.compactThreshold, detail.memory.capsuleMode])

  const disabled = !onUpdateMemoryPolicy
  const save = () => {
    if (!onUpdateMemoryPolicy) return
    const result = onUpdateMemoryPolicy({
      kind: "update_memory_policy",
      source: "advanced",
      agentId: detail.agentId,
      owner: detail.memory.owner,
      readScopes: detail.memory.readScopes,
      writeScope: detail.memory.writeScope,
      compactThreshold,
      capsuleMode,
      isolationLevel: detail.memory.visibility,
    })
    if (result) {
      setMessage(result.message)
      setFieldErrors(result.fieldErrors)
    }
  }

  return (
    <section
      className="rounded-lg border border-stone-200 bg-stone-50 p-3"
      data-testid="sub-agent-memory-policy-editor"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-950">독립 메모리</h3>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {detail.memory.ownerLabel} · {detail.memory.isolationLabel}
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-600">
          capsule {detail.memory.capsuleCount}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="grid gap-1 text-xs font-semibold text-stone-700">
          compact threshold
          <input
            type="number"
            min={1}
            value={compactThreshold}
            onChange={(event) => setCompactThreshold(Number(event.target.value))}
            disabled={disabled}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800"
          />
          {fieldErrors.compactThreshold ? (
            <span className="text-[11px] font-semibold text-red-700">
              {fieldErrors.compactThreshold}
            </span>
          ) : null}
        </div>
        <label className="grid gap-1 text-xs font-semibold text-stone-700">
          capsule mode
          <select
            value={capsuleMode}
            onChange={(event) => setCapsuleMode(event.target.value as typeof capsuleMode)}
            disabled={disabled}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800"
          >
            <option value="session_compaction">session compaction</option>
            <option value="rolling_summary">rolling summary</option>
          </select>
        </label>
      </div>
      <div className="mt-3 grid gap-1 text-[11px] font-semibold text-stone-600">
        <span>원문 보존 창 {detail.memory.rawWindowSize}</span>
        <span>last compact {detail.memory.lastCompactedLabel}</span>
        {detail.memory.exchangePolicyItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      {[...detail.memory.warnings, ...detail.memory.errors].length > 0 ? (
        <div className="mt-2 grid gap-1 text-[11px] font-semibold text-amber-800">
          {[...detail.memory.warnings, ...detail.memory.errors].map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className={`text-xs font-semibold ${fieldErrors.memory ? "text-red-700" : "text-stone-500"}`}
        >
          {message || fieldErrors.memory || "capsule 원문 내용은 기본 화면에 표시하지 않습니다."}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          메모리 저장
        </button>
      </div>
    </section>
  )
}

function PermissionPolicyEditor({
  detail,
  onUpdateCapabilityPolicy,
}: {
  detail: SubAgentAdvancedDetailView
  onUpdateCapabilityPolicy?: (
    command: UpdateSubAgentCapabilityPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
}) {
  const [allowedCapabilityIds, setAllowedCapabilityIds] = useState(
    detail.permission.allowedCapabilityIds,
  )
  const [message, setMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setAllowedCapabilityIds(detail.permission.allowedCapabilityIds)
    setMessage("")
    setFieldErrors({})
  }, [detail.permission.allowedCapabilityIds])

  const disabled = !onUpdateCapabilityPolicy
  const allowedSet = new Set(allowedCapabilityIds)
  const toggleAllowed = (id: string) => {
    if (disabled) return
    setAllowedCapabilityIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }
  const save = () => {
    if (!onUpdateCapabilityPolicy) return
    const allowed = new Set(allowedCapabilityIds)
    const deniedCapabilityIds = detail.permission.items
      .filter(
        (item) =>
          !allowed.has(item.id) &&
          !detail.permission.approvalRequiredCapabilityIds.includes(item.id),
      )
      .map((item) => item.id)
    const result = onUpdateCapabilityPolicy({
      kind: "update_capability_policy",
      source: "advanced",
      agentId: detail.agentId,
      allowedCapabilityIds,
      deniedCapabilityIds,
      approvalRequiredCapabilityIds: detail.permission.approvalRequiredCapabilityIds,
      osSensitiveCapabilityIds: detail.permission.osSensitiveCapabilityIds,
    })
    if (result) {
      setMessage(result.message)
      setFieldErrors(result.fieldErrors)
    }
  }

  return (
    <section
      className="rounded-lg border border-stone-200 bg-stone-50 p-3"
      data-testid="sub-agent-permission-policy-editor"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-950">권한 정책</h3>
          <p className="mt-1 text-xs leading-5 text-stone-600">{detail.permission.summary}</p>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-600">
          {detail.permission.riskCeiling}
        </span>
      </div>
      <div className="mt-3 max-h-[280px] overflow-y-auto pr-1">
        <div className="grid gap-2">
          {detail.permission.items.map((item) => (
            <label
              key={item.id}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-left"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-stone-950">
                    {item.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-stone-600">{item.description}</div>
                </div>
                <input
                  type="checkbox"
                  checked={allowedSet.has(item.id)}
                  disabled={disabled}
                  onChange={() => toggleAllowed(item.id)}
                  className="mt-1 h-4 w-4 shrink-0"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
                  {allowedSet.has(item.id) ? "allowed" : item.state}
                </span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
                  {item.riskLabel}
                </span>
                {item.osSensitive ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                    OS 승인
                  </span>
                ) : null}
              </div>
              {item.warning ? (
                <div className="mt-1 text-[11px] font-semibold text-amber-800">{item.warning}</div>
              ) : null}
            </label>
          ))}
        </div>
      </div>
      {[...detail.permission.warnings, ...detail.permission.errors].length > 0 ? (
        <div className="mt-2 grid gap-1 text-[11px] font-semibold text-amber-800">
          {[...detail.permission.warnings, ...detail.permission.errors].map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className={`text-xs font-semibold ${fieldErrors.allowedCapabilityIds ? "text-red-700" : "text-stone-500"}`}
        >
          {message ||
            fieldErrors.allowedCapabilityIds ||
            "product/debug/dev 로그 경계에 맞춰 상태만 표시합니다."}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          권한 저장
        </button>
      </div>
    </section>
  )
}

function DelegationPolicyEditor({
  detail,
  onUpdateDelegationPolicy,
}: {
  detail: SubAgentAdvancedDetailView
  onUpdateDelegationPolicy?: (
    command: UpdateSubAgentDelegationPolicyCommand,
  ) => SubAgentAdvancedMutationResult | undefined
}) {
  const [allowedChildAgentIds, setAllowedChildAgentIds] = useState(
    detail.delegation.allowedChildAgentIds,
  )
  const [canDelegate, setCanDelegate] = useState(detail.delegation.canDelegate)
  const [resultReviewRequired, setResultReviewRequired] = useState(
    detail.delegation.resultReviewRequired,
  )
  const [redelegationAllowed, setRedelegationAllowed] = useState(
    detail.delegation.redelegationAllowed,
  )
  const [message, setMessage] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setAllowedChildAgentIds(detail.delegation.allowedChildAgentIds)
    setCanDelegate(detail.delegation.canDelegate)
    setResultReviewRequired(detail.delegation.resultReviewRequired)
    setRedelegationAllowed(detail.delegation.redelegationAllowed)
    setMessage("")
    setFieldErrors({})
  }, [
    detail.delegation.allowedChildAgentIds,
    detail.delegation.canDelegate,
    detail.delegation.resultReviewRequired,
    detail.delegation.redelegationAllowed,
  ])

  const disabled = !onUpdateDelegationPolicy
  const allowedSet = new Set(allowedChildAgentIds)
  const toggleChild = (id: string) => {
    if (disabled) return
    setAllowedChildAgentIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }
  const save = () => {
    if (!onUpdateDelegationPolicy) return
    const result = onUpdateDelegationPolicy({
      kind: "update_delegation_policy",
      source: "advanced",
      agentId: detail.agentId,
      canDelegate,
      directChildOnly: true,
      allowedChildAgentIds,
      resultReviewRequired,
      redelegationAllowed,
    })
    if (result) {
      setMessage(result.message)
      setFieldErrors(result.fieldErrors)
    }
  }

  return (
    <section
      className="rounded-lg border border-stone-200 bg-stone-50 p-3"
      data-testid="sub-agent-delegation-policy-editor"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-950">위임/결과 검토</h3>
          <p className="mt-1 text-xs leading-5 text-stone-600">{detail.delegation.summary}</p>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-600">
          direct child only
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs font-semibold text-stone-700">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2">
          can delegate
          <input
            type="checkbox"
            checked={canDelegate}
            disabled={disabled}
            onChange={(event) => setCanDelegate(event.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2">
          결과 검토
          <input
            type="checkbox"
            checked={resultReviewRequired}
            disabled={disabled}
            onChange={(event) => setResultReviewRequired(event.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2">
          재위임 허용
          <input
            type="checkbox"
            checked={redelegationAllowed}
            disabled={disabled}
            onChange={(event) => setRedelegationAllowed(event.target.checked)}
          />
        </label>
      </div>
      <div className="mt-3 max-h-[220px] overflow-y-auto pr-1">
        <div className="grid gap-2">
          {detail.delegation.directChildren.map((child) => (
            <label
              key={child.agentId}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-stone-950">
                    {child.nickname}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-stone-600">
                    {child.displayName} · {child.role}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-stone-500">
                    {child.readinessLabel}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowedSet.has(child.agentId)}
                  disabled={disabled || child.readinessState !== "ready"}
                  onChange={() => toggleChild(child.agentId)}
                  className="mt-1 h-4 w-4 shrink-0"
                />
              </div>
            </label>
          ))}
          {detail.delegation.directChildren.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-200 bg-white px-3 py-5 text-center text-sm text-stone-500">
              direct child가 없습니다.
            </div>
          ) : null}
        </div>
      </div>
      {[...detail.delegation.warnings, ...detail.delegation.errors].length > 0 ? (
        <div className="mt-2 grid gap-1 text-[11px] font-semibold text-amber-800">
          {[...detail.delegation.warnings, ...detail.delegation.errors].map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className={`text-xs font-semibold ${fieldErrors.allowedChildAgentIds ? "text-red-700" : "text-stone-500"}`}
        >
          {message || fieldErrors.allowedChildAgentIds || detail.delegation.redelegationPolicyLabel}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          위임 정책 저장
        </button>
      </div>
    </section>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  error?: string
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-stone-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {error ? <span className="text-[11px] font-semibold text-red-700">{error}</span> : null}
    </label>
  )
}

function RuntimeMonitoringPanel({ detail }: { detail: SubAgentAdvancedDetailView }) {
  const monitoring = detail.monitoring
  return (
    <section
      className={`mt-4 rounded-lg border px-3 py-3 ${monitoring.warningCount > 0 ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-stone-50"}`}
      data-testid="sub-agent-runtime-monitor"
      data-log-level={monitoring.logLevel}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stone-950">런타임 모니터링</h3>
          <p className="mt-1 text-xs leading-5 text-stone-600">{monitoring.reviewSummary}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
          <span className="rounded-full bg-white px-2 py-0.5 text-stone-700">
            log {monitoring.logLevel}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 ${monitoring.stale ? "bg-amber-100 text-amber-800" : "bg-white text-stone-700"}`}
          >
            {monitoring.staleLabel}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 text-stone-700">
            runs {monitoring.activeRuns.length}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-2">
          <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
              실행
            </div>
            <div className="mt-2 grid gap-1.5">
              {monitoring.activeRuns.length > 0 ? (
                monitoring.activeRuns.map((run) => (
                  <div
                    key={run.runId}
                    className={`min-w-0 rounded-lg border px-2.5 py-2 text-xs [overflow-wrap:anywhere] ${run.selected ? "border-stone-900 bg-stone-50" : "border-stone-200 bg-white"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-950">{run.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${monitoringStatusToneClass(run.status)}`}
                      >
                        {run.statusLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-stone-500">
                      {run.latestEventLabel} · event {run.eventCount}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-center text-xs text-stone-500">
                  실행 중인 trace가 없습니다.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
              부모-자식 경로
            </div>
            <div className="mt-2 grid min-w-0 gap-1.5 text-xs font-semibold text-stone-700">
              {monitoring.treePaths.length > 0 ? (
                monitoring.treePaths.map((path) => (
                  <span
                    key={path}
                    className="break-words rounded-lg bg-stone-50 px-2 py-1.5 [overflow-wrap:anywhere]"
                  >
                    {path}
                  </span>
                ))
              ) : (
                <span className="rounded-lg bg-stone-50 px-2 py-1.5 text-stone-500">
                  경로 정보 없음
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
              필터 기준
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-stone-600">
              {[...monitoring.filters.agentLabels, ...monitoring.filters.statusLabels].map(
                (label) => (
                  <span
                    key={label}
                    className="max-w-full break-words rounded-full bg-stone-100 px-2 py-0.5 [overflow-wrap:anywhere]"
                  >
                    {label}
                  </span>
                ),
              )}
              {monitoring.filters.agentLabels.length + monitoring.filters.statusLabels.length ===
              0 ? (
                <span className="rounded-full bg-stone-100 px-2 py-0.5">필터 없음</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                검토 상태
              </div>
              <p className="mt-1 break-words text-xs font-semibold leading-5 text-stone-800 [overflow-wrap:anywhere]">
                {monitoring.reviewSummary}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                최근 결과
              </div>
              <p className="mt-1 break-words text-xs font-semibold leading-5 text-stone-800 [overflow-wrap:anywhere]">
                {monitoring.latestResultSummary}
              </p>
            </div>
          </div>

          <div className="mt-3 max-h-[380px] overflow-y-auto pr-1">
            <div className="grid gap-2">
              {monitoring.traceItems.length > 0 ? (
                monitoring.traceItems.map((item) => (
                  <RuntimeTraceItem
                    key={item.eventId}
                    item={item}
                    showDebug={monitoring.logLevel !== "product"}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-stone-200 bg-white px-3 py-6 text-center text-sm text-stone-500">
                  아직 trace event가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function RuntimeTraceItem({
  item,
  showDebug,
}: {
  item: SubAgentAdvancedDetailView["monitoring"]["traceItems"][number]
  showDebug: boolean
}) {
  return (
    <article
      className={`min-w-0 rounded-lg border bg-white px-3 py-2 [overflow-wrap:anywhere] ${monitoringTraceToneClass(item.tone)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-xs font-semibold text-stone-950">
            {item.actorLabel} → {item.targetLabel}
          </div>
          <p className="mt-1 break-words text-xs leading-5 text-stone-700 [overflow-wrap:anywhere]">
            {item.summary}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1 text-[10px] font-semibold">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">
            {item.kindLabel}
          </span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">{item.kind}</span>
          <span className={`rounded-full px-2 py-0.5 ${monitoringStatusToneClass(item.status)}`}>
            {item.statusLabel}
          </span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
            {item.eventTimeLabel}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-stone-600">
        {item.reviewStatus ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">
            {item.reviewStatus}
          </span>
        ) : null}
        {item.quality ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
            {item.qualityLabel || item.quality}
          </span>
        ) : null}
      </div>
      {item.reason ? (
        <p className="mt-2 break-words text-[11px] leading-5 text-stone-600 [overflow-wrap:anywhere]">
          {item.reason}
        </p>
      ) : null}
      {item.latestResultSummary ? (
        <p className="mt-2 break-words text-[11px] leading-5 text-stone-600 [overflow-wrap:anywhere]">
          결과: {item.latestResultSummary}
        </p>
      ) : null}
      {item.redelegationSummary ? (
        <p className="mt-2 break-words text-[11px] font-semibold leading-5 text-stone-700 [overflow-wrap:anywhere]">
          {item.redelegationSummary}
        </p>
      ) : null}
      {showDebug && item.debugLabel ? (
        <p className="mt-2 text-[11px] leading-5 text-stone-500">{item.debugLabel}</p>
      ) : null}
    </article>
  )
}

function DetailSection({ section }: { section: SubAgentAdvancedDetailSectionView }) {
  return (
    <section
      className={`rounded-lg border px-3 py-3 ${sectionToneClass(section.tone)}`}
      data-testid={`sub-agent-advanced-section-${section.id}`}
      data-inheritance-state={section.inheritanceState}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{section.title}</h3>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold">
          {section.inheritanceState}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 opacity-80">{section.summary}</p>
      <p className="mt-1 text-[11px] leading-5 opacity-70">{section.helper}</p>
      {section.items.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {section.items.map((item) => (
            <span
              key={item}
              className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function PolicyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
        {label}
      </div>
      <div className="mt-1 break-words text-xs font-semibold text-stone-800">{value}</div>
    </div>
  )
}

function StatusChip({
  label,
  tone,
}: { label: string; tone: "info" | "success" | "warning" | "error" }) {
  return <span className={`rounded-full px-2.5 py-1 ${chipToneClass(tone)}`}>{label}</span>
}

function chipToneClass(tone: "info" | "success" | "warning" | "error"): string {
  if (tone === "success") return "bg-emerald-100 text-emerald-800"
  if (tone === "warning") return "bg-amber-100 text-amber-800"
  if (tone === "error") return "bg-red-100 text-red-800"
  return "bg-white text-stone-700"
}

function stateToneClass(state: SubAgentAdvancedListRowView["readinessState"]): string {
  if (state === "ready") return "bg-emerald-100 text-emerald-800"
  if (state === "needs_attention") return "bg-amber-100 text-amber-800"
  if (state === "disabled") return "bg-stone-200 text-stone-700"
  return "bg-sky-100 text-sky-800"
}

function sectionToneClass(tone: SubAgentAdvancedDetailSectionView["tone"]): string {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900"
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900"
  if (tone === "error") return "border-red-200 bg-red-50 text-red-900"
  return "border-stone-200 bg-stone-50 text-stone-900"
}

function monitoringStatusToneClass(
  status: SubAgentAdvancedDetailView["monitoring"]["activeRuns"][number]["status"],
): string {
  if (status === "completed") return "bg-emerald-100 text-emerald-800"
  if (status === "blocked" || status === "cancelled") return "bg-red-100 text-red-800"
  if (status === "reviewing") return "bg-amber-100 text-amber-800"
  if (status === "running") return "bg-sky-100 text-sky-800"
  return "bg-stone-100 text-stone-700"
}

function monitoringTraceToneClass(
  tone: SubAgentAdvancedDetailView["monitoring"]["traceItems"][number]["tone"],
): string {
  if (tone === "success") return "border-emerald-200"
  if (tone === "warning") return "border-amber-200"
  if (tone === "error") return "border-red-200"
  return "border-stone-200"
}

function connectionToneClass(
  state: SubAgentAdvancedDetailView["skillMcp"]["items"][number]["connectionState"],
): string {
  if (state === "connected") return "bg-emerald-100 text-emerald-800"
  if (state === "connecting") return "bg-sky-100 text-sky-800"
  if (state === "degraded" || state === "permission_required") return "bg-amber-100 text-amber-800"
  if (state === "unavailable") return "bg-red-100 text-red-800"
  return "bg-stone-100 text-stone-600"
}
