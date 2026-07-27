import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { ArtifactCleanupPanel } from "../packages/webui/src/components/runs/ArtifactCleanupPanel.tsx"
import type { AdminArtifactCleanupDisplay } from "../packages/webui/src/api/client.ts"

const text = (ko: string) => ko
const displayText = (value: string) => value
const formatTime = (value: number) => `time:${value}`

function renderPanel(display: AdminArtifactCleanupDisplay | null): string {
  return renderToStaticMarkup(
    createElement(ArtifactCleanupPanel, {
      display,
      loading: false,
      running: false,
      message: "정리 대상을 확인했습니다.",
      releaseOutputDir: "",
      onReleaseOutputDirChange: () => undefined,
      onPreview: () => undefined,
      onExecute: () => undefined,
      text,
      displayText,
      formatTime,
    }),
  )
}

describe("task097 artifact cleanup WebUI", () => {
  it("renders cleanup display projection without exposing internal reason codes or raw paths", () => {
    const display = {
      kind: "knowbee.artifact_cleanup.user_projection",
      generatedAt: 1,
      confirmed: false,
      targets: [
        {
          kind: "release_package_output",
          label: "릴리스 출력",
          status: "attention_required",
          deletedLabel: "삭제됨 1",
          verifiedLabel: "확인됨 1",
          skippedLabel: "건너뜀 2",
          attentionLabel: "확인 필요 1",
          deleteEligibleFiles: 3,
          deletedFiles: 1,
          verifiedDeletedFiles: 1,
          skippedFiles: 2,
          attentionCount: 1,
          reasonCounts: { unsafe_symlink: 1 },
          privatePath: "/Users/dongwooshin/private/release/payload/app.tar.gz",
        },
      ],
    } as AdminArtifactCleanupDisplay

    const html = renderPanel(display)

    expect(html).toContain("결과물 정리")
    expect(html).toContain("릴리스 출력")
    expect(html).toContain("정리 가능 3")
    expect(html).toContain("삭제됨 1")
    expect(html).toContain("확인 필요 1")
    expect(html).not.toContain("unsafe_symlink")
    expect(html).not.toContain("private/release")
    expect(html).not.toContain("app.tar.gz")
    expect(html).not.toContain("reasonCounts")
  })

  it("connects the diagnostic page to admin artifact cleanup APIs", () => {
    const pageSource = readFileSync("packages/webui/src/pages/RunsDiagnosticPage.tsx", "utf8")
    const clientSource = readFileSync("packages/webui/src/api/client.ts", "utf8")

    expect(clientSource).toContain("adminArtifactCleanupPreview")
    expect(clientSource).toContain("adminArtifactCleanup")
    expect(pageSource).toContain("<ArtifactCleanupPanel")
    expect(pageSource).toContain("api.adminArtifactCleanupPreview")
    expect(pageSource).toContain("api.adminArtifactCleanup")
    expect(pageSource).not.toContain("reasonCounts")
    expect(pageSource).not.toContain("unsafe_symlink")
    expect(pageSource).not.toContain("package_path_invalid")
  })
})
