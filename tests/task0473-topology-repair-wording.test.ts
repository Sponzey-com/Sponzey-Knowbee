import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ENTERPRISE_TOPOLOGY_SCHEMA_VERSION,
  type EnterpriseTopology,
  type NodeContract,
} from "../packages/core/src/contracts/enterprise-topology.ts"
import {
  EXECUTOR_PROFILE_METADATA_KEY,
  type ExecutorProfile,
} from "../packages/core/src/topology/executor-profile.ts"
import { repairTopologyForPersistence } from "../packages/core/src/topology/repair.ts"

const now = Date.UTC(2026, 6, 6, 12, 0, 0)
const declineCriteria = "서브 에이전트 정의, 허용 도구, 위임 범위를 벗어난 요청은 직접 처리하지 않고 상위 에이전트에게 되돌립니다."

function node(): NodeContract {
  return {
    schemaVersion: ENTERPRISE_TOPOLOGY_SCHEMA_VERSION,
    entityType: "node",
    id: "node:worker",
    name: "자료 정리",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    nodeType: "function",
    description: "받은 자료를 정리합니다.",
    tags: [],
    children: [],
    allowedToolIds: [],
    allowedSystemIds: [],
  }
}

function topology(): EnterpriseTopology {
  return {
    schemaVersion: ENTERPRISE_TOPOLOGY_SCHEMA_VERSION,
    entityType: "topology",
    id: "topology:workspace",
    name: "Workspace",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    nodes: [node()],
    teams: [],
    orgUnits: [],
    positions: [],
    persons: [],
    memberships: [],
    authorityRules: [],
    responsibilities: [],
    systems: [],
    tools: [],
    processes: [],
    relations: [],
  }
}

describe("topology repair user-facing wording", () => {
  it("creates default executor profile decline criteria with sub-agent wording", () => {
    const result = repairTopologyForPersistence(topology())
    const repairedNode = result.topology.nodes[0]
    const profile = repairedNode?.metadata?.[EXECUTOR_PROFILE_METADATA_KEY] as ExecutorProfile | undefined
    const json = JSON.stringify(result.topology)

    expect(profile?.declineCriteria).toEqual([declineCriteria])
    expect(json).not.toContain("노드 정의")
    expect(json).not.toContain("상위 실행자")
  })

  it("keeps the repair TS and JS sources free from legacy default decline wording", () => {
    const files = [
      join(process.cwd(), "packages", "core", "src", "topology", "repair.ts"),
      join(process.cwd(), "packages", "core", "src", "topology", "repair.js"),
    ]

    for (const file of files) {
      const source = readFileSync(file, "utf-8")
      expect(source).toContain(declineCriteria)
      expect(source).not.toContain("노드 정의, 허용 도구, 위임 범위를 벗어난 요청은 직접 처리하지 않고 상위 실행자에게 되돌립니다.")
    }
  })
})
