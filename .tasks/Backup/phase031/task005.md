# Task 005 - Retrieval / Restore / Capsule Rollup과 Bounded Injection

상태: auto_verified
자동 검증 상태: 완료
수동 smoke 상태: 대기
운영 증거: 없음
남은 리스크: 장시간 세션에서 rollup과 recall trace를 실제 inspector/runtime에서 아직 확인하지 않았다.
완료 판정 가능 여부: 아니오 (`operationally_verified` 아님)
검증 환경: 로컬 자동 테스트 결과 기준
검증 일시: 2026-05-18
검증 실행자: Codex

우선순위: P1

## 목표

compact 이후에도 필요한 과거 맥락을 필요한 만큼만 복원하되, capsule과 archive가 다시 무한히 prompt를 부풀리지 않게 만든다.  
이 태스크의 목표는 다음 3가지다.

1. prompt-time recall과 maintenance restore 경로를 분리하고 정책화한다.
2. capsule chain이 길어질 때 rollup을 수행해서 bounded injection을 유지한다.
3. restore/recall이 어떤 근거로 일어났는지 trace와 audit를 남긴다.

이 단계가 완료돼야 장시간 세션, 긴 위임 트리, 잦은 compact 환경에서 context budget을 안정적으로 유지할 수 있다.

## 기준 문서

- `.tasks/plan.md`의 `4.6 Layer F: Capsule Chain / Rollup`
- `.tasks/plan.md`의 `10. retrieval / restore 정책`
- `.tasks/plan.md`의 `10.6 capsule rollup 복원 규칙`
- `.tasks/plan.md`의 `11.2 memory_capsule_rollups`
- `.tasks/plan.md`의 `15. Phase 7`

## 선행 조건

- `task001.md`
- `task002.md`
- `task003.md`
- `task004.md`

## 후속 의존 태스크

- `task006.md`

## 포함 기능

- [x] prompt-time recall / maintenance restore 정책 구현
- [x] capsule chain rollup과 bounded injection
- [x] recall / restore trace와 conflict rule

---

## 기능 1 - Prompt-time Recall / Maintenance Restore 정책

### 목표

현재 요청에 필요한 과거 맥락만 복원하되, restore가 현재 의도를 덮어쓰지 않도록 만든다.

### 구현 체크리스트

- [x] restore 경로를 두 종류로 분리한다.

  - [x] `prompt-time recall`
  - [x] `maintenance restore`
- [x] `prompt-time recall` 규칙을 구현한다.

  - [x] current request 관련 chunk만 recall
  - [x] FTS 우선
  - [x] vector는 optional degrade
  - [x] artifact / diagnostic은 명시적으로만 포함
- [x] `maintenance restore` 규칙을 구현한다.

  - [x] latest capsule
  - [x] task continuity
  - [x] pinned working set
  - [x] latest valid owner scope
- [x] `latest instruction precedence`를 restore 단계에도 적용한다.
- [x] restore 금지 규칙을 구현한다.

  - [x] 다른 owner scope raw restore 금지
  - [x] expired exchange restore 금지
  - [x] revoked trust foreign restore 금지
  - [x] 다른 channel/thread raw memory auto merge 금지

### 검증 시나리오

- [x] 현재 요청과 관련 없는 오래된 archive chunk가 자동 recall되지 않는지 확인한다.
- [x] restore된 capsule 내용이 최신 사용자 지시를 덮어쓰지 않는지 확인한다.
- [x] channel/thread가 다른 세션의 raw memory가 자동 섞이지 않는지 확인한다.

---

## 기능 2 - Capsule Chain Rollup과 Bounded Injection

### 목표

capsule이 계속 쌓여도 active prompt에 들어가는 총량은 제한되게 만든다.

### 구현 체크리스트

- [x] `capsule_rollup_threshold`를 구현한다.

  - [x] capsule count 기준
  - [x] total char/token 기준
- [x] `recent capsules`와 `rollup capsule`의 관계를 구현한다.
- [x] rollup 대상 선정 규칙을 추가한다.

  - [x] 최신 recent capsules 유지
  - [x] 오래된 capsules만 rollup
  - [x] pending items는 rollup summary가 아니라 pinned set에 유지
- [x] `memory_capsule_rollups` audit 저장을 구현한다.
- [x] active prompt injection에서 다음 구조를 강제한다.

  - [x] rollup capsule 1개
  - [x] 최신 recent capsules 일부
  - [x] pinned working set
  - [x] raw tail
- [x] rollup 이후 recall compatibility를 보장한다.

### 검증 시나리오

- [x] 매우 긴 세션에서 capsule 수가 threshold를 넘으면 rollup이 발생하는지 확인한다.
- [x] rollup 이후에도 latest recent capsule은 그대로 남는지 확인한다.
- [x] rollup 이후 prompt budget이 bounded 상태를 유지하는지 확인한다.
- [x] pending approvals/pending delivery 같은 활성 상태가 rollup 중 사라지지 않는지 확인한다.

---

## 기능 3 - Recall / Restore Trace와 Conflict Rule

### 목표

어떤 메모리가 언제 왜 복원됐는지 추적 가능하게 하고, 복원 간 충돌 시 우선순위를 정한다.

### 구현 체크리스트

- [x] `memory_recall_events` 기록을 구현한다.
- [x] trace에 포함할 필드를 정의한다.

  - [x] run id
  - [x] owner scope
  - [x] recall source type
  - [x] capsule id / chunk id
  - [x] reason code
  - [x] canUseForFinalAnswer 여부
  - [x] same-session 여부
- [x] restore conflict rule을 정의한다.

  - [x] latest user instruction 우선
  - [x] deterministic state 우선
  - [x] recent capsule 우선
  - [x] rollup capsule은 fallback context
- [x] retrieval degrade 상태를 진단 메모리로 남기되 user-facing 기본 응답에는 숨긴다.
- [x] recall trace가 inspector와 release evidence에서 소비 가능하도록 projection shape를 만든다.

### 검증 시나리오

- [x] 어떤 run이 어떤 capsule과 archive chunk를 사용했는지 trace로 확인 가능한지 검증한다.
- [x] same-session recall만 final answer 근거로 허용되는 정책이 지켜지는지 확인한다.
- [x] retrieval degrade가 발생해도 run 자체는 계속 진행되고 trace에만 남는지 확인한다.

---

## 자동 테스트

- [x] prompt-time recall selection test
- [x] maintenance restore ordering test
- [x] latest instruction precedence during restore test
- [x] cross-channel restore rejection test
- [x] capsule rollup threshold test
- [x] bounded injection prompt assembly test
- [x] rollup pending item preservation test
- [x] recall event logging test
- [x] recall conflict resolution test
- [x] retrieval degrade without run failure test

## 수동 smoke

- 분류:
  - UI smoke: inspector trace 확인 필요
  - Runtime smoke: 높음
  - Release smoke: 중간
- [ ] 장시간 대화 세션에서 여러 차례 compact 후 rollup이 발생하는지 확인
- [ ] 세션 재개 시 latest capsule + continuity만으로 자연스럽게 이어지는지 확인
- [ ] inspector에서 recall trace를 보고 어떤 capsule이 사용됐는지 확인

## 완료 조건

- [x] restore와 recall 정책이 분리되어 동작한다.
- [x] capsule chain이 bounded injection을 유지한다.
- [x] recall/restore trace가 남고 conflict rule이 정의된다.
- [x] 오래된 memory를 복원해도 최신 사용자 지시와 다른 채널 경계를 침범하지 않는다.
- [ ] rollup/restore/recall smoke evidence가 기록된다.

## 관련 파일 후보

- `packages/core/src/memory/search.ts`
- `packages/core/src/memory/store.ts`
- `packages/core/src/memory/compaction.ts`
- `packages/core/src/runs/web-retrieval-cache.ts`
- `packages/core/src/orchestration/prompt-bundle.ts`
- `packages/core/src/db/*`
- `tests/*memory*`
- `tests/*retrieval*`

## 비범위

- memory inspector UI 자체 구현
- compaction model selection UI
- release gate 최종 구성

## 롤백 기준

- rollup이 continuity를 깨면, rollup은 audit only로 내리고 recent capsule bounded injection만 먼저 유지한다.
- recall 정책이 과도하게 보수적이면 final answer 근거 제한은 유지하되 discovery hint recall만 허용하는 degrade 모드로 내린다.
