export type TopologyWorkspaceLayer = "build" | "run" | "trace" | "improve" | "resources"

export interface TopologyWorkspaceLayerCopy {
  layer: TopologyWorkspaceLayer
  labelKo: string
  labelEn: string
  tooltipKo: string
  tooltipEn: string
}

export interface TopologyWorkspaceUserTermCopy {
  key: "step" | "connection" | "tool" | "context" | "run" | "runRecord" | "issue"
  labelKo: string
  labelEn: string
  descriptionKo: string
  descriptionEn: string
}

export const TOPOLOGY_WORKSPACE_LAYER_COPY: TopologyWorkspaceLayerCopy[] = [
  {
    layer: "build",
    labelKo: "만들기",
    labelEn: "Build",
    tooltipKo: "업무 단계와 연결을 만든다.",
    tooltipEn: "Create work steps and connections.",
  },
  {
    layer: "run",
    labelKo: "실행",
    labelEn: "Run",
    tooltipKo: "선택한 업무 흐름을 실행한다.",
    tooltipEn: "Run the selected work flow.",
  },
  {
    layer: "trace",
    labelKo: "기록",
    labelEn: "Trace",
    tooltipKo: "실제로 지나간 실행 경로를 본다.",
    tooltipEn: "Inspect the path used by the run.",
  },
  {
    layer: "improve",
    labelKo: "개선",
    labelEn: "Improve",
    tooltipKo: "실제 실행과 다른 점을 고친다.",
    tooltipEn: "Fix differences found in real runs.",
  },
  {
    layer: "resources",
    labelKo: "리소스",
    labelEn: "Resources",
    tooltipKo: "업무 단계에 연결할 실행 리소스를 본다.",
    tooltipEn: "View execution resources that can power work steps.",
  },
]

export const TOPOLOGY_WORKSPACE_USER_TERMS: TopologyWorkspaceUserTermCopy[] = [
  {
    key: "step",
    labelKo: "업무 단계",
    labelEn: "Work step",
    descriptionKo: "노비가 실행하거나 판단하는 하나의 일 단위.",
    descriptionEn: "One unit of work Nobie can run or decide on.",
  },
  {
    key: "connection",
    labelKo: "연결",
    labelEn: "Connection",
    descriptionKo: "업무 단계, 도구, 조직을 이어 주는 선.",
    descriptionEn: "A line connecting work steps, tools, or groups.",
  },
  {
    key: "tool",
    labelKo: "도구",
    labelEn: "Tool",
    descriptionKo: "업무 단계가 사용할 수 있는 기능 또는 시스템.",
    descriptionEn: "A capability or system a work step can use.",
  },
  {
    key: "context",
    labelKo: "상황",
    labelEn: "Context",
    descriptionKo: "실행할 때 함께 넣는 요청 조건.",
    descriptionEn: "Request conditions used when a flow runs.",
  },
  {
    key: "run",
    labelKo: "실행",
    labelEn: "Run",
    descriptionKo: "업무 흐름을 한 번 시작한 결과.",
    descriptionEn: "One started execution of a work flow.",
  },
  {
    key: "runRecord",
    labelKo: "실행 기록",
    labelEn: "Run record",
    descriptionKo: "실행이 어떤 경로를 지나갔는지 남은 기록.",
    descriptionEn: "A record of the path taken by a run.",
  },
  {
    key: "issue",
    labelKo: "고칠 점",
    labelEn: "Issue",
    descriptionKo: "실행 전에 고치거나 확인해야 하는 항목.",
    descriptionEn: "Something to fix or confirm before running.",
  },
]

export const TOPOLOGY_WORKSPACE_INTERNAL_TERMS = [
  "Declared",
  "Observed",
  "CompiledSnapshot",
  "CompiledTopologySnapshot",
  "SubSession",
  "AgentConfig",
  "AuthorityScope",
  "FailureExhaustion",
  "Runtime Resource Topology",
] as const

export const TOPOLOGY_WORKSPACE_FIRST_START_COPY = {
  titleKo: "첫 업무 흐름 만들기",
  titleEn: "Create your first work flow",
  descriptionKo: "템플릿을 고르면 업무 단계와 연결이 자동으로 채워진다.",
  descriptionEn: "Choose a template to start with work steps and connections already filled in.",
  primaryActionKo: "첫 업무 단계 추가",
  primaryActionEn: "Add first work step",
  templateSectionKo: "바로 시작",
  templateSectionEn: "Start quickly",
  blankTemplateKo: "빈 그래프",
  blankTemplateEn: "Blank graph",
} as const

export const TOPOLOGY_WORKSPACE_BEGINNER_COPY_SURFACE = {
  layers: TOPOLOGY_WORKSPACE_LAYER_COPY.map((item) => ({
    labelKo: item.labelKo,
    labelEn: item.labelEn,
    tooltipKo: item.tooltipKo,
    tooltipEn: item.tooltipEn,
  })),
  terms: TOPOLOGY_WORKSPACE_USER_TERMS.map((item) => ({
    labelKo: item.labelKo,
    labelEn: item.labelEn,
    descriptionKo: item.descriptionKo,
    descriptionEn: item.descriptionEn,
  })),
  firstStart: TOPOLOGY_WORKSPACE_FIRST_START_COPY,
}

export function containsInternalTopologyTerm(value: string): boolean {
  return TOPOLOGY_WORKSPACE_INTERNAL_TERMS.some((term) => value.includes(term))
}

export function topologyWorkspaceLayerLabel(layer: TopologyWorkspaceLayer, language: "ko" | "en"): string {
  const copy = TOPOLOGY_WORKSPACE_LAYER_COPY.find((item) => item.layer === layer)
  if (!copy) return layer
  return language === "ko" ? copy.labelKo : copy.labelEn
}

