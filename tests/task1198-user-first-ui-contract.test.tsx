import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it, vi } from "vitest"
import { ExecutorWorkspaceShell } from "../packages/webui/src/components/topology/ExecutorWorkspaceShell.tsx"
import { projectUserTaskAction } from "../packages/webui/src/lib/user-task-action.ts"

describe("task1198 user-first UI contract", () => {
  it("projects available, blocked, and completed actions with explicit outcomes", () => {
    expect(projectUserTaskAction({ available: true, outcome: "opens_editor" })).toEqual({
      state: "available",
      outcome: "opens_editor",
    })
    expect(projectUserTaskAction({
      available: false,
      outcome: "saves_changes",
      blockedReason: "validation_failed",
    })).toEqual({
      state: "blocked",
      outcome: "saves_changes",
      reasonCode: "validation_failed",
    })
    expect(projectUserTaskAction({ available: true, completed: true, outcome: "saves_changes" })).toEqual({
      state: "completed",
      outcome: "saves_changes",
    })
  })

  it("renders one primary add action without disabled management clutter in the empty state", () => {
    const html = renderToStaticMarkup(createElement(ExecutorWorkspaceShell, {
      executorCount: 0,
      connectionCount: 0,
      saveDisabled: true,
      onAddExecutor: vi.fn(),
      onSaveDraft: vi.fn(),
      onAutoLayout: vi.fn(),
    }))

    expect(html).toMatch(/data-testid="executor-workspace-first-add-executor"[^>]*data-user-task-state="available"/u)
    expect(html).toMatch(/data-testid="executor-workspace-first-add-executor"[^>]*data-ui-priority="primary_action"/u)
    expect(html).not.toContain('data-testid="executor-workspace-top-add-executor"')
    expect(html).not.toContain('data-testid="executor-workspace-top-save"')
    expect(html).not.toContain('data-testid="executor-workspace-top-delete-executor"')
    expect(html).not.toContain('data-testid="executor-workspace-top-auto-layout"')
    expect(html).not.toContain('data-testid="executor-workspace-left-rail"')
    expect(html).not.toContain('data-testid="executor-workspace-start-recommended-flow"')
    expect(html).toContain("서브 에이전트 추가")
    expect(html.match(/data-ui-priority="primary_action"/gu)).toHaveLength(1)
  })

  it("keeps primary actions usable without horizontal viewport loss", () => {
    const html = renderToStaticMarkup(createElement(ExecutorWorkspaceShell, {
      executorCount: 1,
      connectionCount: 0,
      onAddExecutor: vi.fn(),
      onDeleteExecutor: vi.fn(),
      onSaveDraft: vi.fn(),
      onAutoLayout: vi.fn(),
    }))

    expect(html).toContain("flex min-w-0 flex-wrap")
    expect(html.match(/type="button"/gu)?.length).toBeGreaterThanOrEqual(4)
    expect(html).not.toContain("whitespace-nowrap")
    expect(html).toMatch(/data-testid="executor-workspace-top-save"[^>]*data-user-task-state="available"/u)
  })
})
