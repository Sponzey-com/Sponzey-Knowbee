# Task 003 - Agent Memory State와 Owner Scope / Channel Boundary Isolation

상태: auto_verified
자동 검증 상태: 완료
수동 smoke 상태: 대기
운영 증거: 없음
남은 리스크: rename 이후 continuity, cross-channel 분리, child bootstrap 경로를 실운영 trace로 아직 확인하지 않았다.
완료 판정 가능 여부: 아니오 (`operationally_verified` 아님)
검증 환경: 로컬 자동 테스트 결과 기준
검증 일시: 2026-05-18
검증 실행자: Codex

우선순위: P0

## 목표

Nobie와 모든 서브 에이전트가 각자 독립된 메모리 상태를 갖고, 이름 변경이나 채널 차이와 무관하게 내부 ID 기준으로 안전하게 격리되게 만든다.  
이 태스크의 목표는 다음 3가지다.

1. Nobie와 서브 에이전트용 `agent_memory_state`와 owner scope mapping을 도입한다.
2. nickname/display name 변경이 메모리 소유권을 흔들지 않도록 `nickname snapshot + internal owner id` 규칙을 구현한다.
3. WebUI/Slack/Telegram 등 channel/session boundary가 다른 메모리가 자동 혼합되지 않도록 막는다.

이 단계가 불안정하면 sibling memory leak, rename confusion, cross-channel 오염, 잘못된 restore가 발생한다.

## 기준 문서

- `.tasks/plan.md`의 `5. 메모리 소유권과 격리 규칙`
- `.tasks/plan.md`의 `5.4 owner scope는 내부 ID 기준으로 고정한다`
- `.tasks/plan.md`의 `5.5 channel/session 경계를 섞지 않는다`
- `.tasks/plan.md`의 `8.1 최소 계약`
- `.tasks/plan.md`의 `15. Phase 3`, `Phase 5`

## 선행 조건

- `task001.md`
- `task002.md`

## 후속 의존 태스크

- `task004.md`
- `task005.md`
- `task006.md`

## 포함 기능

- [x] `agent_memory_state`와 owner scope mapping
- [x] nickname snapshot / rename stability / internal id ownership
- [x] channel/thread boundary isolation과 child own memory bootstrap

---

## 기능 1 - `agent_memory_state`와 owner scope mapping

### 목표

세션 중심 메모리에서 에이전트 중심 메모리 상태로 확장한다.

### 구현 체크리스트

- [x] `agent_memory_state` 저장 구조를 추가한다.
- [x] 필수 필드를 정의한다.

  - [x] `agent_id`
  - [x] `session_id`
  - [x] `request_group_id`
  - [x] `lineage_id`
  - [x] `channel_key`
  - [x] `thread_key`
  - [x] `latest_capsule_id`
  - [x] `current_raw_token_estimate`
  - [x] `current_raw_message_count`
  - [x] `last_compaction_at`
  - [x] `compaction_block_reason`
- [x] Nobie 본체와 sub-agent의 owner scope 규칙을 분리한다.

  - [x] `main_agent`
  - [x] `sub_agent`
  - [x] `session`
  - [x] `task`
- [x] owner scope resolver를 구현한다.
- [x] 같은 session 안에서도 `request_group` / `lineage` 기준 분리를 지원할지 규칙을 정한다.
- [x] `agent_memory_state`와 `session_snapshots`의 역할 차이를 문서화한다.

### 검증 시나리오

- [x] 같은 session 안에 Nobie와 child agent가 동시에 있어도 owner scope가 분리되는지 확인한다.
- [x] child run이 많아져도 `agent_id + lineage` 기준으로 state가 나뉘는지 확인한다.
- [x] 같은 agent라도 channel/thread boundary가 다르면 별도 state로 분리되는지 확인한다.

---

## 기능 2 - nickname snapshot / rename stability / internal id ownership

### 목표

에이전트의 이름이 바뀌어도 기존 memory ownership과 restore 대상은 변하지 않게 한다.

### 구현 체크리스트

- [x] `nickname_snapshot` 필드를 capsule / state / trace에 반영한다.
- [x] memory ownership은 다음 내부 필드로만 계산되게 한다.

  - [x] `agent_id`
  - [x] `session_id`
  - [x] `request_group_id`
  - [x] `lineage_id`
  - [x] `channel_key`
  - [x] `thread_key`
- [x] nickname/display name은 attribution과 UI 표시용으로만 사용한다.
- [x] rename 이후에도 기존 capsule chain과 continuity restore가 유지되는지 보장한다.
- [x] display name 충돌이나 nickname 변경이 ownership에 영향을 주지 않도록 validator를 추가한다.

### 검증 시나리오

- [x] sub-agent 이름을 바꾼 뒤에도 이전 capsule이 같은 owner scope로 복원되는지 확인한다.
- [x] nickname만 바뀌고 `agent_id`가 같으면 memory state가 이어지는지 확인한다.
- [x] `nickname_snapshot`은 과거 attribution을 보존하지만 최신 권한 계산에는 쓰이지 않는지 확인한다.

---

## 기능 3 - channel/thread boundary isolation과 child own memory bootstrap

### 목표

서로 다른 채널/스레드 메모리가 자동 혼합되지 않게 하고, child run은 자기 own memory state로 시작하게 만든다.

### 구현 체크리스트

- [x] channel/session boundary 규칙을 구현한다.

  - [x] WebUI session
  - [x] Telegram thread
  - [x] Slack thread
  - [x] 기타 channel session
- [x] cross-channel raw memory auto merge를 차단한다.
- [x] cross-channel continuity가 필요한 경우 explicit restore 또는 reviewed handoff만 허용한다.
- [x] child own memory bootstrap 경로를 추가한다.

  - [x] parent raw transcript 전체 전달 금지
  - [x] child initial pinned set 생성
  - [x] child latest capsule seed 여부 결정
  - [x] child source provenance 기록
- [x] sibling memory direct search를 차단하는 guard를 보강한다.

### 검증 시나리오

- [x] WebUI 대화와 Slack thread 대화가 같은 사용자라도 raw memory를 자동 공유하지 않는지 확인한다.
- [x] explicit handoff 없이 sibling child memory search가 막히는지 확인한다.
- [x] child run 시작 시 parent raw transcript 대신 handoff-ready 최소 컨텍스트만 seed로 들어가는지 확인한다.

---

## 자동 테스트

- [x] `agent_memory_state` owner scope resolver unit test
- [x] main/sub agent state separation test
- [x] nickname rename stability test
- [x] `nickname_snapshot` attribution-only test
- [x] channel/thread boundary isolation test
- [x] cross-channel raw merge rejection test
- [x] sibling memory direct access block test
- [x] child own memory bootstrap contract test

## 수동 smoke

- 분류:
  - UI smoke: inspector 관찰 필요
  - Runtime smoke: 높음
  - Release smoke: 낮음
- [ ] 같은 사용자가 WebUI와 Telegram에서 각각 대화한 뒤 memory inspector에서 별도 session/state로 보이는지 확인
- [ ] sub-agent 이름 변경 후 이전 continuity가 유지되는지 확인
- [ ] child run 시작 시 parent full transcript가 보이지 않는지 trace로 확인

## 완료 조건

- [x] Nobie와 모든 sub-agent가 owner-scoped memory state를 가진다.
- [x] 이름 변경과 ownership이 분리된다.
- [x] channel/thread boundary가 다른 메모리는 자동 혼합되지 않는다.
- [x] child run이 자기 own memory state로 시작한다.
- [ ] channel/rename/child bootstrap runtime evidence가 기록된다.

## 관련 파일 후보

- `packages/core/src/memory/isolation.ts`
- `packages/core/src/db/*`
- `packages/core/src/orchestration/sub-session-runner.ts`
- `packages/core/src/orchestration/prompt-bundle.ts`
- `packages/core/src/runs/*`
- `tests/*memory*`
- `tests/*sub-session*`

## 비범위

- feedback capsule
- retrieval / restore / rollup
- UI inspector

## 롤백 기준

- owner scope mapping이 기존 단일-session 흐름을 깨면, `agent_memory_state`는 shadow write만 하고 실제 read path는 기존 session memory를 유지한다.
- channel boundary isolation이 기존 채널 기능을 막으면, 자동 merge만 금지하고 explicit restore 경로만 먼저 남긴다.
