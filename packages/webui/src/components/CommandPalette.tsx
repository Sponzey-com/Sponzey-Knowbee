import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../api/client"
import { UserRecoveryNotice } from "./UserRecoveryNotice"
import type {
  CommandPaletteSearchResult,
  FocusBinding,
  FocusTarget,
} from "../contracts/command-palette"
import {
  commandPaletteA11yState,
  commandPaletteOptionId,
  type CommandPaletteGroupLabels,
  groupCommandPaletteResults,
  moveCommandPaletteSelection,
  parseCommandPaletteInput,
} from "../lib/command-palette"
import { initialInputSubmission, reduceInputSubmission } from "../lib/input-submission"
import { resolveTrappedFocusIndex } from "../lib/focus-trap"
import { useUiI18n } from "../lib/ui-i18n"
import { type UserRecoveryProjection, UiRequestFailure, projectUserRecovery } from "../lib/user-recovery"

function focusLabel(binding: FocusBinding | null, text: ReturnType<typeof useUiI18n>["text"]): string {
  if (!binding) return "No focus"
  const label = binding.target.label ?? binding.target.id
  if (binding.target.kind === "agent") return `${text("에이전트", "Agent")}: ${label}`
  if (binding.target.kind === "team") return `${text("팀", "Team")}: ${label}`
  return `${text("서브 에이전트 실행", "Sub-agent run")}: ${label}`
}

function targetLabel(target: FocusTarget): string {
  return target.label ?? target.id
}

function resultKindLabel(kind: CommandPaletteSearchResult["kind"], text: ReturnType<typeof useUiI18n>["text"]): string {
  switch (kind) {
    case "agent":
      return text("에이전트", "Agent")
    case "team":
      return text("팀", "Team")
    case "sub_session":
      return text("서브 에이전트 실행", "Sub-agent run")
    case "agent_template":
      return text("에이전트 템플릿", "Agent template")
    case "team_template":
      return text("팀 템플릿", "Team template")
    case "command":
      return text("명령", "Command")
  }
}

export function CommandPalette({ threadId }: { threadId: string }) {
  const { text } = useUiI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CommandPaletteSearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState("")
  const [recovery, setRecovery] = useState<UserRecoveryProjection | null>(null)
  const [submission, setSubmission] = useState(initialInputSubmission)
  const [focus, setFocus] = useState<FocusBinding | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const openRef = useRef(false)
  const commandSequenceRef = useRef(0)
  const queryRevisionRef = useRef(0)
  const submittingRef = useRef(false)

  function setPaletteOpen(nextOpen: boolean) {
    if (!nextOpen) invalidateCommand()
    openRef.current = nextOpen
    setOpen(nextOpen)
  }

  const groupLabels = useMemo<CommandPaletteGroupLabels>(() => ({
    command: text("명령", "Commands"),
    agent: text("에이전트", "Agents"),
    team: text("팀", "Teams"),
    sub_session: text("서브 에이전트 실행", "Sub-agent runs"),
    agent_template: text("에이전트 템플릿", "Agent templates"),
    team_template: text("팀 템플릿", "Team templates"),
  }), [text])
  const groups = useMemo(() => groupCommandPaletteResults(results, groupLabels), [groupLabels, results])
  const flatResults = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const a11y = commandPaletteA11yState({
    open,
    selectedIndex,
    itemCount: flatResults.length,
  })

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen(!openRef.current)
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    return () => triggerRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void api.getFocus(threadId).then((response) => {
      if (!cancelled) setFocus(response.binding)
    }).catch(() => {
      if (!cancelled) setFocus(null)
    })
    return () => {
      cancelled = true
    }
  }, [open, threadId])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void api.commandPaletteSearch({ q: query, limit: 80 })
        .then((response) => {
          if (cancelled) return
          setResults(response.results)
          setSelectedIndex(response.results.length > 0 ? 0 : -1)
          setRecovery(null)
        })
        .catch((error) => {
          if (cancelled) return
          setResults([])
          setSelectedIndex(-1)
          setRecovery(projectUserRecovery(error, "read"))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query])

  function invalidateCommand() {
    const sequence = ++commandSequenceRef.current
    queryRevisionRef.current += 1
    submittingRef.current = false
    setSubmission((current) => reduceInputSubmission(current, { type: "reset", sequence }))
  }

  async function runCommandMutation(
    draft: string,
    operation: () => Promise<() => void>,
  ) {
    if (submittingRef.current) return
    const sequence = ++commandSequenceRef.current
    const queryRevision = queryRevisionRef.current
    submittingRef.current = true
    setRecovery(null)
    setNotice("")
    setSubmission((current) => reduceInputSubmission(current, {
      type: "submit_started",
      sequence,
      draft,
    }))
    try {
      const commit = await operation()
      if (sequence !== commandSequenceRef.current || queryRevision !== queryRevisionRef.current) return
      commit()
      setSubmission((current) => reduceInputSubmission(current, {
        type: "submit_succeeded",
        sequence,
      }))
    } catch (error) {
      if (sequence !== commandSequenceRef.current || queryRevision !== queryRevisionRef.current) return
      const nextRecovery = projectUserRecovery(error, "mutation")
      setRecovery(nextRecovery)
      setSubmission((current) => reduceInputSubmission(current, {
        type: "submit_failed",
        sequence,
        recovery: nextRecovery,
      }))
      window.requestAnimationFrame(() => inputRef.current?.focus())
    } finally {
      if (sequence === commandSequenceRef.current) submittingRef.current = false
    }
  }

  async function executeSlashCommand(commandText: string) {
    await runCommandMutation(commandText, async () => {
      const response = await api.executeCommand({ command: commandText, threadId })
      if (!response.ok) {
        throw new UiRequestFailure({
          status: null,
          reasonCode: response.reasonCode,
          safeMessage: null,
        })
      }
      const focusResponse = await api.getFocus(threadId)
      return () => {
        setFocus(focusResponse.binding)
        setNotice(text("명령을 처리했습니다.", "Command completed."))
        if (commandText.trim() === "/unfocus") setQuery("")
      }
    })
  }

  async function activateResult(result: CommandPaletteSearchResult) {
    await runCommandMutation(result.title, async () => {
      if (result.kind === "agent_template") {
        await api.instantiateAgentTemplate(result.id.replace(/^agent-template:/, ""))
        return () => setNotice(text("에이전트 초안을 만들었습니다.", "Agent draft created."))
      }
      if (result.kind === "team_template") {
        await api.instantiateTeamTemplate(result.id.replace(/^team-template:/, ""))
        return () => setNotice(text("팀 초안을 만들었습니다.", "Team draft created."))
      }
      if (result.target) {
        const response = await api.setFocus(threadId, result.target)
        return () => {
          setFocus(response.focus.binding)
          setNotice(text(`초점: ${targetLabel(result.target)}`, `Focus: ${targetLabel(result.target)}`))
        }
      }
      if (result.command) {
        return () => {
          setQuery(result.command ?? "")
          inputRef.current?.focus()
        }
      }
      return () => undefined
    })
  }

  async function submitCurrent() {
    const state = parseCommandPaletteInput(query)
    if (state.mode === "slash_command" && state.query) {
      await executeSlashCommand(state.query)
      return
    }
    const selected = flatResults[selectedIndex]
    if (selected) await activateResult(selected)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault()
      const direction =
        event.key === "ArrowDown"
          ? "down"
          : event.key === "ArrowUp"
            ? "up"
            : event.key === "Home"
              ? "home"
              : "end"
      setSelectedIndex((currentIndex) =>
        moveCommandPaletteSelection({
          currentIndex,
          itemCount: flatResults.length,
          direction,
        }),
      )
      return
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submitCurrent()
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-stone-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
      >
        <span>{text("명령", "Command")}</span>
        <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-stone-400">
          K
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[120] bg-stone-950/50 px-4 py-10 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPaletteOpen(false)
            }
          }}
        >
          <section
            ref={panelRef}
            role={a11y.role}
            aria-modal="true"
            aria-label={text("명령 팔레트", "Command palette")}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                setPaletteOpen(false)
                return
              }
              if (event.key !== "Tab") return
              const focusable = [
                ...(panelRef.current?.querySelectorAll<HTMLElement>(
                  "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
                ) ?? []),
              ].filter((element) => element.getClientRects().length > 0)
              if (focusable.length === 0) return
              const nextIndex = resolveTrappedFocusIndex({
                currentIndex: focusable.indexOf(document.activeElement as HTMLElement),
                focusableCount: focusable.length,
                shiftKey: event.shiftKey,
              })
              event.preventDefault()
              focusable[nextIndex]?.focus()
            }}
            className="mx-auto flex max-h-[80vh] max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
          >
            <div className="border-b border-stone-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    {text("명령 팔레트", "Command Palette")}
                  </div>
                  <div className="mt-1 truncate text-xs text-stone-500">{focusLabel(focus, text)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void runCommandMutation("/unfocus", async () => {
                      await api.clearFocus(threadId)
                      return () => {
                        setFocus(null)
                        setNotice(text("초점을 해제했습니다.", "Focus cleared."))
                      }
                    })
                  }}
                  disabled={submission.status === "submitting"}
                  className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                >
                  {text("초점 해제", "Unfocus")}
                </button>
              </div>
              <label htmlFor="command-palette-input" className="sr-only">
                {text("검색 또는 명령 입력", "Search or enter command")}
              </label>
              <input
                ref={inputRef}
                id="command-palette-input"
                value={query}
                onChange={(event) => {
                  invalidateCommand()
                  setQuery(event.target.value)
                  setRecovery(null)
                  setNotice("")
                }}
                onKeyDown={handleKeyDown}
                role="combobox"
                aria-expanded={a11y.expanded}
                aria-controls="command-palette-results"
                aria-activedescendant={a11y.activeDescendant}
                placeholder={text("에이전트, 팀, 서브 에이전트 실행 또는 /명령", "agent, team, sub-agent run, or /command")}
                className="mt-4 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10"
              />
              {recovery ? (
                <div className="mt-3">
                  <UserRecoveryNotice projection={recovery} subject="command" text={text} />
                </div>
              ) : notice ? (
                <div className="mt-3 rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-600">
                  {notice}
                </div>
              ) : null}
            </div>

            <div
              id="command-palette-results"
              role={a11y.listRole}
              className="min-h-0 flex-1 overflow-y-auto p-2"
            >
              {loading ? (
                <output className="block px-3 py-6 text-center text-sm text-stone-500">
                  {text("검색 중...", "Searching...")}
                </output>
              ) : groups.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-stone-500">
                  {text("결과 없음", "No results")}
                </div>
              ) : (
                groups.map((group) => {
                  let groupOffset = 0
                  for (const previous of groups) {
                    if (previous.kind === group.kind) break
                    groupOffset += previous.items.length
                  }
                  return (
                    <div key={group.kind} className="py-2">
                      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                        {group.label}
                      </div>
                      {group.items.map((result, index) => {
                        const flatIndex = groupOffset + index
                        const selected = flatIndex === selectedIndex
                        return (
                          <button
                            key={`${result.kind}:${result.id}`}
                            id={commandPaletteOptionId(flatIndex)}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onMouseEnter={() => setSelectedIndex(flatIndex)}
                            onClick={() => void activateResult(result)}
                            className={`block w-full rounded-xl px-3 py-3 text-left focus:outline-none ${
                              selected ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate text-sm font-semibold">{result.title}</span>
                              <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold ${
                                selected ? "bg-white/10 text-stone-200" : "bg-stone-100 text-stone-500"
                              }`}>
                                {resultKindLabel(result.kind, text)}
                              </span>
                            </div>
                            {result.subtitle ? (
                              <div className={`mt-1 line-clamp-2 text-xs leading-5 ${
                                selected ? "text-stone-300" : "text-stone-500"
                              }`}>
                                {result.subtitle}
                              </div>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
