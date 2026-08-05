import React, {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  type SettingsEditSession,
  createSettingsEditSession,
  transitionSettingsEditSession,
} from "../../lib/settings-edit-session"
import { pickUiText, useUiLanguageStore } from "../../stores/uiLanguage"

interface SettingsEditRegistration {
  dirty: boolean
  discard: () => void
}

interface SettingsNavigationGuardValue {
  session: SettingsEditSession
  register: (registration: SettingsEditRegistration | null) => void
  requestNavigation: (destination: string) => void
  interceptLink: (event: ReactMouseEvent, destination: string) => void
  saveRequested: () => boolean
  saveFailed: () => void
  authoritativeReloaded: (matchesDraft: boolean) => void
}

const SettingsNavigationGuardContext = createContext<SettingsNavigationGuardValue | null>(null)

export function SettingsNavigationGuardProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const uiLanguage = useUiLanguageStore((state) => state.language)
  const [session, setSession] = useState(createSettingsEditSession)
  const sessionRef = useRef(session)
  const discardRef = useRef<(() => void) | null>(null)
  const stayButtonRef = useRef<HTMLButtonElement | null>(null)
  const discardButtonRef = useRef<HTMLButtonElement | null>(null)
  const currentUrlRef = useRef(`${location.pathname}${location.search}${location.hash}`)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    currentUrlRef.current = `${location.pathname}${location.search}${location.hash}`
  }, [location.hash, location.pathname, location.search])

  const apply = useCallback(
    (event: Parameters<typeof transitionSettingsEditSession>[1]) => {
      const transition = transitionSettingsEditSession(sessionRef.current, event)
      sessionRef.current = transition.session
      setSession(transition.session)
      if (transition.effect === "navigate" && transition.session.pendingDestination) {
        navigate(transition.session.pendingDestination)
      }
      return transition
    },
    [navigate],
  )

  const register = useCallback(
    (registration: SettingsEditRegistration | null) => {
      discardRef.current = registration?.discard ?? null
      if (registration?.dirty) {
        apply({ type: "EDIT" })
        return
      }
      const current = sessionRef.current
      if (["dirty", "save_failed", "discarded"].includes(current.status)) {
        sessionRef.current = createSettingsEditSession()
        setSession(sessionRef.current)
      }
    },
    [apply],
  )

  const requestNavigation = useCallback(
    (destination: string) => {
      if (destination === currentUrlRef.current) return
      apply({ type: "NAVIGATE_REQUESTED", destination })
    },
    [apply],
  )

  const interceptLink = useCallback(
    (event: ReactMouseEvent, destination: string) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      if (!["dirty", "save_failed"].includes(sessionRef.current.status)) return
      event.preventDefault()
      requestNavigation(destination)
    },
    [requestNavigation],
  )

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!["dirty", "save_failed"].includes(sessionRef.current.status)) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      if (!["dirty", "save_failed"].includes(sessionRef.current.status)) return
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
      navigate(currentUrlRef.current, { replace: true })
      apply({ type: "NAVIGATE_REQUESTED", destination })
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [apply, navigate])

  useEffect(() => {
    if (session.status !== "confirming") return
    stayButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        apply({ type: "STAY" })
        return
      }
      if (event.key !== "Tab") return
      const first = stayButtonRef.current
      const last = discardButtonRef.current
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [apply, session.status])

  const value: SettingsNavigationGuardValue = {
    session,
    register,
    requestNavigation,
    interceptLink,
    saveRequested: () => apply({ type: "SAVE_REQUESTED" }).session.status === "saving",
    saveFailed: () => {
      apply({ type: "SAVE_FAILED" })
    },
    authoritativeReloaded: (matchesDraft) => {
      apply({ type: "SAVE_SUCCEEDED" })
      apply({ type: "AUTHORITATIVE_RELOADED", matchesDraft })
    },
  }

  return (
    <SettingsNavigationGuardContext.Provider value={value}>
      {children}
      {session.status === "confirming" ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="settings-leave-title"
            aria-describedby="settings-leave-description"
            className="w-full max-w-md border border-stone-200 bg-white p-5 shadow-xl"
          >
            <h2 id="settings-leave-title" className="text-lg font-semibold text-stone-950">
              {pickUiText(uiLanguage, "변경 내용을 버릴까요?", "Discard unsaved changes?")}
            </h2>
            <p id="settings-leave-description" className="mt-2 text-sm leading-6 text-stone-600">
              {pickUiText(
                uiLanguage,
                "저장하지 않은 설정이 있습니다. 이 화면에 머물거나 변경을 버리고 이동하세요.",
                "You have unsaved settings. Stay here or discard them and continue.",
              )}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                ref={stayButtonRef}
                type="button"
                onClick={() => apply({ type: "STAY" })}
                className="min-h-11 border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800"
              >
                {pickUiText(uiLanguage, "계속 편집", "Keep editing")}
              </button>
              <button
                ref={discardButtonRef}
                type="button"
                onClick={() => {
                  discardRef.current?.()
                  apply({ type: "DISCARD_AND_LEAVE" })
                }}
                className="min-h-11 border border-red-600 bg-red-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {pickUiText(uiLanguage, "버리고 이동", "Discard and leave")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SettingsNavigationGuardContext.Provider>
  )
}

export function useSettingsNavigationGuard(): SettingsNavigationGuardValue {
  const value = useContext(SettingsNavigationGuardContext)
  if (!value) throw new Error("settings_navigation_guard_provider_missing")
  return value
}
