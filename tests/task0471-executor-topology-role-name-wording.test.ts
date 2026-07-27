import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  EXECUTOR_TOPOLOGY_V2_SCHEMA_VERSION,
  enterpriseTopologyFromExecutorTopologyV2,
  type ExecutorTopologyV2,
} from "../packages/core/src/topology/executor-topology-v2.ts"

const now = Date.UTC(2026, 6, 6, 0, 0, 0)

function topology(): ExecutorTopologyV2 {
  return {
    schemaVersion: EXECUTOR_TOPOLOGY_V2_SCHEMA_VERSION,
    id: "workspace:draft",
    name: "서브 에이전트 구성",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        id: "node:default-role",
        name: "자료 정리",
        description: "자료를 정리합니다.",
        position: { x: 80, y: 80 },
        status: "active",
      },
      {
        id: "node:custom-role",
        name: "검토 담당",
        roleName: "검토 담당",
        description: "결과를 검토합니다.",
        position: { x: 320, y: 80 },
        status: "active",
      },
    ],
    edges: [],
  }
}

describe("task0471 executor topology role name wording", () => {
  it("uses sub-agent as the default role name when materializing EnterpriseTopology metadata", () => {
    const enterprise = enterpriseTopologyFromExecutorTopologyV2(topology(), { materializedAt: now })
    const defaultNode = enterprise.nodes.find((node) => node.id === "node:default-role")
    const customNode = enterprise.nodes.find((node) => node.id === "node:custom-role")

    expect(defaultNode?.metadata?.roleName).toBe("서브 에이전트")
    expect(customNode?.metadata?.roleName).toBe("검토 담당")
  })

  it("does not keep the old executor roleName fallback in source", () => {
    const sourceFiles = [
      "packages/core/src/topology/executor-topology-v2.ts",
      "packages/core/src/topology/executor-topology-v2.js",
    ]
    const combined = sourceFiles
      .map((filePath) => readFileSync(join(process.cwd(), filePath), "utf8"))
      .join("\n")

    expect(combined).not.toContain('roleName: node.roleName ?? "실행자"')
    expect(combined).toContain('roleName: node.roleName ?? "서브 에이전트"')
  })
})
