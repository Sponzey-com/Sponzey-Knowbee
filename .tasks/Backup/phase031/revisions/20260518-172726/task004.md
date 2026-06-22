# Task 004 - Child Handoff Capsule, Feedback Capsule, Finalization Continuity

상태: auto_verified
자동 검증 상태: 완료
수동 smoke 상태: 대기
운영 증거: 없음
남은 리스크: reviewer 후 재작업/재위임과 continuity 복구를 실제 sub-agent runtime trace에서 아직 확인하지 않았다.
완료 판정 가능 여부: 아니오 (`operationally_verified` 아님)
검증 환경: 로컬 자동 테스트 결과 기준
검증 일시: 2026-05-18
검증 실행자: Codex

우선순위: P0

## 목표

부모와 자식 에이전트 사이에서 raw transcript 없이도 위임, 재작업, 재위임, 종료 복구가 가능하도록 `handoff capsule`과 `feedback capsule`을 도입한다.  
이 태스크의 목표는 다음 3가지다.

1. child run 시작 시 handoff-ready capsule만 전달하는 경로를 구현한다.
2. 결과가 부족할 때 reviewer/parent가 `feedback capsule`을 합성해 재작업이나 재위임에 사용할 수 있게 한다.
3. run 종료 시 finalization이 continuity와 latest instruction precedence를 보존하게 만든다.

이 단계가 완료돼야 서브 에이전트 트리에서 메모리 혼합 없이 재위임과 복구가 가능해진다.

## 기준 문서

- `.tasks/plan.md`의 `9. Knowbee와 서브 에이전트별 동작`
- `.tasks/plan.md`의 `9.3 재위임 시 메모리`
- `.tasks/plan.md`의 `10. retrieval / restore 정책`
- `.tasks/plan.md`의 `12.3 sub-session runner`
- `.tasks/plan.md`의 `12.4 feedback loop`
- `.tasks/plan.md`의 `12.5 finalization`
- `.tasks/plan.md`의 `15. Phase 5`, `Phase 6`

## 선행 조건

- `task001.md`
- `task002.md`
- `task003.md`

## 후속 의존 태스크

- `task005.md`
- `task006.md`

## 포함 기능

- [x] child start용 handoff capsule과 exchange integration
- [x] review / redelegation용 feedback capsule synthesis
- [x] finalization continuity와 latest instruction precedence

---

## 기능 1 - Child Start용 handoff capsule과 exchange integration

### 목표

자식 실행 시작 시 parent raw memory를 직접 주지 않고, 최소한의 handoff capsule만 전달한다.

### 구현 체크리스트

- [x] `handoff capsule` 생성 규칙을 정의한다.
- [x] handoff capsule 포함 필드를 정한다.

  - [x] current goal
  - [x] completion criteria
  - [x] constraints
  - [x] artifact refs
  - [x] target/session selector
  - [x] latest safe context summary
  - [x] do-not-repeat boundary
- [x] parent -> child 전달을 `DataExchangePackage`와 연결한다.
- [x] `allowedUse`, `retentionPolicy`, `redactionState`가 handoff capsule에 맞게 설정되는지 규칙을 정한다.
- [x] child prompt seed가 raw parent transcript가 아니라 handoff capsule을 읽도록 조정한다.
- [x] handoff capsule provenance를 기록한다.

### 검증 시나리오

- [x] child run 시작 시 parent raw conversation 전체가 주입되지 않는지 확인한다.
- [x] completion criteria와 artifact ref는 유지되지만 불필요한 raw tool result는 제거되는지 확인한다.
- [x] handoff capsule의 source refs가 `DataExchangePackage`와 trace에서 추적되는지 확인한다.

---

## 기능 2 - review / redelegation용 feedback capsule synthesis

### 목표

하위 결과가 부족하거나 잘못됐을 때, parent가 검토 후 구조화된 피드백만 다시 내려보내게 만든다.

### 구현 체크리스트

- [x] `feedback capsule` 타입을 정의한다.
- [x] 입력 소스를 정한다.

  - [x] source result reports
  - [x] reviewer findings
  - [x] preserved artifacts
  - [x] unresolved conflicts
  - [x] rejected assumptions
- [x] feedback capsule 필드를 정의한다.

  - [x] keep
  - [x] remove
  - [x] revise
  - [x] add constraints
  - [x] do-not-repeat
  - [x] expected output revision
- [x] 같은 child에 재작업 요청하는 경로와 다른 child에 재위임하는 경로를 분리한다.
- [x] feedback capsule을 `feedback-loop.ts`에 연결한다.
- [x] parent가 raw child transcript를 다시 넘기지 않도록 보장한다.

### 검증 시나리오

- [x] reviewer가 “유지할 것 / 버릴 것 / 다시 조사할 것”을 구조화해 새 child run에 넘길 수 있는지 확인한다.
- [x] feedback capsule 기반 재작업에서 raw child memory가 직접 주입되지 않는지 확인한다.
- [x] 다른 child로 재위임해도 sibling private memory가 그대로 건너가지 않는지 확인한다.

---

## 기능 3 - finalization continuity와 latest instruction precedence

### 목표

run 종료 시 다음 턴 복구에 필요한 state를 continuity로 남기되, 복원된 과거 정보가 최신 사용자 지시를 덮어쓰지 않게 만든다.

### 구현 체크리스트

- [x] finalization 단계에서 저장할 continuity 필드를 정한다.

  - [x] latest successful summary
  - [x] last good state
  - [x] pending delivery
  - [x] failure recovery hints
  - [x] latest target context
- [x] `task_continuity` projection을 handoff/feedback 결과와 연계한다.
- [x] restore 시 `latest instruction precedence` 규칙을 구현한다.

  - [x] 최신 사용자 지시가 capsule/continuity보다 우선
  - [x] stale restore가 현재 목표를 덮어쓰지 않음
- [x] cancelled / failed / awaiting_user 상태별 continuity 기록 정책을 구분한다.
- [x] final delivery 차단 사유와 review pending 상태를 continuity에 반영한다.

### 검증 시나리오

- [x] run 실패 후 restart해도 last good state와 recovery hints가 continuity로 복원되는지 확인한다.
- [x] 이전 capsule이 최신 사용자 정정 지시를 덮어쓰지 않는지 확인한다.
- [x] awaiting_user 상태에서 compact/continuity가 approval 또는 추가 입력 요구를 잃지 않는지 확인한다.

---

## 자동 테스트

- [x] handoff capsule contract test
- [x] `DataExchangePackage` handoff integration test
- [x] child prompt seed without raw parent transcript test
- [x] feedback capsule synthesis test
- [x] same-child revision test
- [x] cross-child redelegation isolation test
- [x] finalization continuity persistence test
- [x] latest instruction precedence restore test
- [x] failure recovery hints continuity test

## 수동 smoke

- 분류:
  - UI smoke: 해당 없음
  - Runtime smoke: 높음
  - Release smoke: 낮음
- [ ] sub-agent 결과가 부족한 시나리오에서 reviewer 후 재작업이 raw transcript 없이 진행되는지 확인
- [ ] 다른 child로 재위임할 때 sibling private memory가 직접 보이지 않는지 trace 확인
- [ ] 실패 후 세션 재개 시 continuity 기반 복구가 작동하는지 확인

## 완료 조건

- [x] child start가 handoff capsule 기반으로 동작한다.
- [x] feedback/redelegation이 구조화 capsule로 이어진다.
- [x] finalization이 continuity를 저장하고 restore가 최신 사용자 지시를 우선한다.
- [x] raw parent/child transcript 직접 공유가 기본 경로에서 제거된다.
- [ ] sub-agent runtime smoke evidence가 기록된다.

## 관련 파일 후보

- `packages/core/src/memory/isolation.ts`
- `packages/core/src/orchestration/sub-session-runner.ts`
- `packages/core/src/orchestration/feedback-loop.ts`
- `packages/core/src/runs/finalization.ts`
- `packages/core/src/db/*`
- `tests/*feedback*`
- `tests/*sub-session*`

## 비범위

- capsule chain rollup
- memory inspector UI
- release gate

## 롤백 기준

- feedback capsule 경로가 현재 재작업 흐름을 깨면, reviewer synthesis는 저장하되 실제 child seed는 기존 continuity 요약 경로를 유지한다.
- latest instruction precedence가 불안정하면 continuity restore는 read-only hint로만 주입하고 current instruction overwrite는 금지한다.
