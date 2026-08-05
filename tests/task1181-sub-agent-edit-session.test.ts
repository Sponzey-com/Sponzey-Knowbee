import { describe, expect, it, vi } from "vitest"
import { SubAgentAdvancedSettingsPanel } from "../packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx"
import {
  beginSubAgentEditSave,
  cancelSubAgentEditSession,
  changeSubAgentEditSession,
  completeSubAgentEditSave,
  createSubAgentEditSession,
  failSubAgentEditSave,
  openSubAgentEditSession,
  restoreSubAgentEditFocus,
} from "../packages/webui/src/lib/sub-agent-edit-session.ts"

type Draft = { agentName: string; role: string }

describe("task1181 sub-agent edit session", () => {
  it("drops the working draft on cancel and reopens from the baseline without persistence", () => {
    const persist = vi.fn()
    let session = createSubAgentEditSession<Draft>({ agentName: "Researcher", role: "research" })
    session = openSubAgentEditSession(session)
    session = changeSubAgentEditSession(session, { agentName: "Temporary", role: "draft" })
    session = cancelSubAgentEditSession(session)
    session = openSubAgentEditSession(session)

    expect(session.status).toBe("editing")
    expect(session.working).toEqual({ agentName: "Researcher", role: "research" })
    expect(persist).not.toHaveBeenCalled()
  })

  it("keeps save success and failure as explicit transitions", () => {
    let session = openSubAgentEditSession(createSubAgentEditSession<Draft>({ agentName: "A", role: "one" }))
    session = changeSubAgentEditSession(session, { agentName: "B", role: "two" })
    session = beginSubAgentEditSave(session)
    expect(session.status).toBe("saving")

    const failed = failSubAgentEditSave(session)
    expect(failed.status).toBe("failed")
    expect(failed.working.agentName).toBe("B")

    const saved = completeSubAgentEditSave(session)
    expect(saved.status).toBe("saved")
    expect(saved.baseline).toEqual({ agentName: "B", role: "two" })
  })

  it("returns focus to the invoking control and uses a safe fallback when it is gone", () => {
    const primary = { isConnected: true, focus: vi.fn() }
    const fallback = { isConnected: true, focus: vi.fn() }
    restoreSubAgentEditFocus(primary, fallback, (callback) => callback())
    expect(primary.focus).toHaveBeenCalledOnce()
    expect(fallback.focus).not.toHaveBeenCalled()

    primary.isConnected = false
    restoreSubAgentEditFocus(primary, fallback, (callback) => callback())
    expect(fallback.focus).toHaveBeenCalledOnce()
  })

  it("routes Escape through the same cancel transition unless save is in progress", () => {
    const onCancel = vi.fn()
    const event = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() }
    const common = {
      view: {} as never,
      onSelectAgent: () => undefined,
      onSave: () => undefined,
      onCancel,
      onRefresh: () => undefined,
    }
    const editable = SubAgentAdvancedSettingsPanel({ ...common, saving: false })
    ;(editable.props.onKeyDown as (value: typeof event) => void)(event)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()

    const saving = SubAgentAdvancedSettingsPanel({ ...common, saving: true })
    ;(saving.props.onKeyDown as (value: typeof event) => void)(event)
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
