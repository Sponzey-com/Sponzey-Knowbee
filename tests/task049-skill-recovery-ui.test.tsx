import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import React, {
  type ReactElement,
  type ReactNode,
} from "../packages/webui/node_modules/react/index.js"
import { UserRecoveryNotice } from "../packages/webui/src/components/UserRecoveryNotice"
import { UiRequestFailure, projectUserRecovery } from "../packages/webui/src/lib/user-recovery"
import { SkillCatalogView } from "../packages/webui/src/pages/SkillCatalogPage"

const text = (ko: string, _en: string) => ko

function findButton(node: ReactNode): ReactElement<{ onClick: () => void }> | null {
  if (!React.isValidElement(node)) return null
  if (typeof (node.props as { onClick?: unknown }).onClick === "function") {
    return node as ReactElement<{ onClick: () => void }>
  }
  const children = (node.props as { children?: ReactNode }).children
  for (const child of React.Children.toArray(children)) {
    const found = findButton(child)
    if (found) return found
  }
  return null
}

describe("Task049 Skills recovery notice", () => {
  it("renders safe localized guidance without raw failure text", () => {
    const html = renderToStaticMarkup(
      <UserRecoveryNotice
        projection={projectUserRecovery(new Error("500 stack /Users/private token=secret"), "read")}
        text={text}
        onAction={() => undefined}
        subject="skills"
      />,
    )
    expect(html).toContain("Skill 정보를 불러오지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).not.toMatch(/stack|Users|secret/u)
    expect(html).toContain('role="alert"')
  })

  it("invokes the explicit refresh action once", () => {
    const onAction = vi.fn()
    const element = UserRecoveryNotice({
      projection: projectUserRecovery(new Error("network"), "read"),
      text,
      onAction,
      subject: "skills",
    })
    const button = findButton(element)
    expect(button).not.toBeNull()
    button?.props.onClick()
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it("replaces the canonical Skills raw error body with the recovery projection", () => {
    const html = renderToStaticMarkup(
      <SkillCatalogView
        items={[]}
        selectedItem={null}
        loading={false}
        loadingMore={false}
        error={projectUserRecovery(new Error("stack /Users/private token=secret"), "read")}
        nextCursor={null}
        search=""
        sourceKind=""
        runtimeStatus=""
        boundOnly={false}
        onSearchChange={() => undefined}
        onSourceKindChange={() => undefined}
        onRuntimeStatusChange={() => undefined}
        onBoundOnlyChange={() => undefined}
        onSelect={() => undefined}
        onCloseDetail={() => undefined}
        onRefresh={() => undefined}
        onLoadMore={() => undefined}
      />,
    )
    expect(html).toContain("Skill 정보를 불러오지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).not.toMatch(/stack|Users|secret|request_failed/u)
  })

  it("does not wire authentication guidance to the refresh command", () => {
    const onRefresh = vi.fn()
    const html = renderToStaticMarkup(
      <SkillCatalogView
        items={[]}
        selectedItem={null}
        loading={false}
        loadingMore={false}
        error={projectUserRecovery(
          new UiRequestFailure({
            status: 401,
            reasonCode: "authentication_required",
            safeMessage: null,
          }),
          "read",
        )}
        nextCursor={null}
        search=""
        sourceKind=""
        runtimeStatus=""
        boundOnly={false}
        onSearchChange={() => undefined}
        onSourceKindChange={() => undefined}
        onRuntimeStatusChange={() => undefined}
        onBoundOnlyChange={() => undefined}
        onSelect={() => undefined}
        onCloseDetail={() => undefined}
        onRefresh={onRefresh}
        onLoadMore={() => undefined}
      />,
    )
    expect(html).toContain("다시 인증")
    expect(html).not.toContain(">상태 새로고침<")
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
