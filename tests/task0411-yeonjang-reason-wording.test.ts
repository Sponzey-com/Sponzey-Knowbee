import { describe, expect, it } from "vitest"
import {
  buildYeonjangTargetPickerPlacements,
  describeYeonjangDefaultTargetSelection,
  describeYeonjangReasonCode,
} from "../packages/webui/src/lib/yeonjang-fleet.ts"

const koText = (ko: string) => ko

describe("task0411 yeonjang reason wording", () => {
  it("uses user-readable reason messages instead of gateway, instance, or heartbeat wording", () => {
    expect(describeYeonjangReasonCode("single_trusted_local_interactive", koText)).toBe("신뢰된 이 컴퓨터의 연장을 자동 선택합니다.")
    expect(describeYeonjangReasonCode("local_profile_not_interactive", koText)).toBe("이 컴퓨터의 연장이 화면 조작을 지원하지 않아 직접 선택이 필요합니다.")
    expect(describeYeonjangReasonCode("remote_only_requires_explicit_selection", koText)).toBe("현재 원격 컴퓨터의 연장만 연결되어 직접 선택해야 합니다.")
    expect(describeYeonjangReasonCode("no_online_target_candidate", koText)).toBe("현재 연결된 연장이 없어 실행 대상을 선택할 수 없습니다.")
    expect(describeYeonjangReasonCode("heartbeat_age_mismatch", koText)).toBe("최근 연결 신호 차이")
    expect(describeYeonjangReasonCode("missing_capability_on_remote", koText)).toBe("원격 컴퓨터에 없는 기능이 있습니다.")
    expect(describeYeonjangReasonCode("missing_capability_on_local", koText)).toBe("이 컴퓨터에 없는 기능이 있습니다.")
    expect(describeYeonjangReasonCode("matched_gateway_host_fingerprint", koText)).toBe("현재 실행 중인 연장과 일치하는 내 기기입니다.")
    expect(describeYeonjangReasonCode("matched_gateway_default_node", koText)).toBe("기본 로컬 연장으로 확인되었습니다.")
    expect(describeYeonjangReasonCode("gateway_host_mismatch", koText)).toBe("현재 실행 중인 연장과 다른 컴퓨터입니다.")
  })

  it("uses direct selection wording in target guidance", () => {
    expect(describeYeonjangDefaultTargetSelection({
      status: "auto_selected_local_interactive",
      uiAction: "none",
      reasonCodes: [],
    }, koText)).toBe("대상을 따로 지정하지 않으면 이 컴퓨터의 화면 조작 연장을 자동 사용합니다.")

    const placements = buildYeonjangTargetPickerPlacements(koText)
    expect(placements.map((item) => item.label)).toEqual(["채팅 작성창", "실행 전 확인 패널", "관리 화면"])
    expect(placements.map((item) => item.description).join("\n")).not.toContain("online")
    expect(placements.map((item) => item.description).join("\n")).not.toContain("receipt")
    expect(placements.map((item) => item.description).join("\n")).not.toContain("stale")
    expect(placements.map((item) => item.description).join("\n")).toContain("원격 컴퓨터의 연장만 연결되어 있을 때")
    expect(placements.map((item) => item.description).join("\n")).toContain("실행 기록")
  })
})
