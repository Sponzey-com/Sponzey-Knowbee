# Task 002 - Nobie Root Session Structured Compaction과 Context Preflight 연동

상태: auto_verified
자동 검증 상태: 완료
수동 smoke 상태: 대기
운영 증거: 없음
남은 리스크: 실제 긴 세션과 approval UI 보존을 브라우저/런타임에서 아직 확인하지 않았다.
완료 판정 가능 여부: 아니오 (`operationally_verified` 아님)
검증 환경: 로컬 자동 테스트 결과 기준
검증 일시: 2026-05-18
검증 실행자: Codex

우선순위: P0

## 목표

Nobie 본체의 root session에서 실제로 compact가 동작하도록 만든다.  
이 태스크의 목표는 다음 3가지다.

1. root session raw context에서 `결정적 상태`와 `pinned working set`을 먼저 추출한다.
2. 오래된 raw head를 구조화된 summary로 compact하고 capsule로 저장한다.
3. `context-preflight`에 compact를 연결해 oversized context가 모델 호출 전에 안정적으로 줄어들게 만든다.

이 단계가 완료돼야 긴 WebUI 세션, 긴 채널 대화, 반복적인 도구 실행 상황에서 Nobie가 문맥을 잃지 않고 지속 실행할 수 있다.

## 기준 문서

- `.tasks/plan.md`의 `6. compact 트리거 정책`
- `.tasks/plan.md`의 `7. compact 파이프라인`
- `.tasks/plan.md`의 `8.4 결정적 상태 우선 규칙`
- `.tasks/plan.md`의 `12.1 context preflight`
- `.tasks/plan.md`의 `12.2 prompt bundle`
- `.tasks/plan.md`의 `15. Phase 4`

## 선행 조건

- `task001.md`

## 후속 의존 태스크

- `task003.md`
- `task004.md`
- `task005.md`
- `task006.md`

## 포함 기능

- [x] root session 결정적 상태 추출기와 pinned working set builder
- [x] structured summary build / merge validation / capsule persistence
- [x] `context-preflight` 연동과 active window rewrite

---

## 기능 1 - Root Session 결정적 상태 추출기와 pinned working set builder

### 목표

compact 전 단계에서 모델이 아니라 런타임이 꼭 보존해야 할 상태를 먼저 추출한다.

### 구현 체크리스트

- [x] root session 대상 `deterministic state extractor`를 추가한다.
- [x] 추출 대상 정의:

  - [x] active task ids
  - [x] pending approvals
  - [x] pending delivery
  - [x] explicit target selector
  - [x] latest artifact receipts
  - [x] unresolved result review items
  - [x] explicit user corrections
  - [x] retry do-not-repeat boundary
  - [x] final delivery block reason
- [x] `PinnedWorkingSet` 타입을 정의한다.
- [x] root run에서 pinned set을 만드는 builder를 구현한다.
- [x] unmatched tool_use/tool_result pair를 감지하는 규칙을 compaction eligibility 전에 연결한다.
- [x] root session용 `compact_reason_codes`를 정한다.

  - [x] token threshold exceeded
  - [x] message threshold exceeded
  - [x] large tool payload pruned
  - [x] root continuity refresh needed
  - [x] blocked by pending finalization
- [x] compact 금지 조건을 연결한다.

  - [x] unmatched tool pair
  - [x] pending approval가 raw context에만 있는 상태
  - [x] final delivery 직전
  - [x] cancellation/recovery 판단 중

### 검증 시나리오

- [x] 긴 대화에서 pending approval와 pending delivery가 raw text가 아니라 pinned set으로 추출되는지 확인한다.
- [x] tool result가 매우 커도 receipt와 side-effect boundary는 유지되는지 확인한다.
- [x] unmatched tool pair가 있으면 compact가 지연되는지 확인한다.
- [x] latest user correction이 summary에 묻히지 않고 pinned set에 남는지 확인한다.

---

## 기능 2 - Structured Summary Build / Merge Validation / Capsule Persistence

### 목표

오래된 raw head를 구조화된 capsule로 만들되, 결정적 상태와 충돌하지 않게 병합하고 저장한다.

### 구현 체크리스트

- [x] root session raw head를 narrative summary 입력으로 만드는 formatter를 추가한다.
- [x] compact summary 생성 contract를 구현한다.

  - [x] `what_happened`
  - [x] `current_goal`
  - [x] `still_open`
  - [x] `confirmed_facts`
  - [x] `must_keep_constraints`
  - [x] `artifacts_and_receipts`
  - [x] `tool_side_effect_boundary`
  - [x] `retry_do_not_repeat`
  - [x] `handoff_ready_context`
- [x] summary build 단계에서 모델이 생성 가능한 필드와 불가능한 필드를 분리한다.
- [x] `merge and validation` 단계를 추가한다.

  - [x] 결정적 상태 우선 병합
  - [x] pending approval / delivery 보존 확인
  - [x] source refs 존재 확인
  - [x] runtime deterministic field와 모델 결과 충돌 검사
  - [x] 금지 필드 유출 검사
- [x] capsule 저장 경로를 구현한다.

  - [x] `memory_compaction_runs`
  - [x] `memory_capsules`
  - [x] `memory_capsule_sources`
  - [x] `session_snapshots` compatibility projection
- [x] compact 결과를 user-facing summary와 runtime capsule로 분리 저장한다.

### 검증 시나리오

- [x] 모델 summary가 일부 빠뜨려도 pending approvals가 capsule 최종 결과에 유지되는지 확인한다.
- [x] source ref가 없는 summary 결과는 저장이 거부되는지 확인한다.
- [x] compact 결과가 `session_snapshots` projection으로도 보이면서 runtime capsule 원문은 별도 저장되는지 확인한다.
- [x] secret/stack trace/raw screenshot 등이 summary에 들어오면 validator에서 걸러지는지 확인한다.

---

## 기능 3 - `context-preflight` 연동과 active window rewrite

### 목표

모델 호출 전에 oversized context를 줄이고, compact 뒤 prompt injection window를 재구성한다.

### 구현 체크리스트

- [x] `context-preflight`에 compaction planner를 연결한다.
- [x] 실행 순서를 고정한다.

  - [x] token estimate
  - [x] large transient tool result prune
  - [x] deterministic state extraction
  - [x] compaction eligibility 판단
  - [x] compact 실행 또는 block
  - [x] final prompt assembly
  - [x] token re-check
- [x] active window rewrite 규칙을 구현한다.

  - [x] system/runtime envelope
  - [x] pinned working set summary block
  - [x] latest valid compacted capsule block
  - [x] raw tail messages
  - [x] optional retrieval snippets
- [x] rewrite가 DB 원본 messages를 물리적으로 변경하지 않도록 보장한다.
- [x] compact 후 final prompt budget이 여전히 초과되면 secondary degrade 정책을 구현한다.

  - [x] 더 작은 raw tail
  - [x] retrieval-only degrade
  - [x] provider call block
- [x] compaction observability event를 기록한다.

### 검증 시나리오

- [x] 큰 tool result가 있는 긴 대화에서 preflight가 provider 호출 전에 prompt를 줄이는지 확인한다.
- [x] compact 후 prompt token 수가 감소하는지 확인한다.
- [x] compact 후에도 raw tail의 최신 대화는 그대로 남는지 확인한다.
- [x] 최종 prompt budget을 다시 계산했을 때 초과면 fallback 정책이 작동하는지 확인한다.

---

## 자동 테스트

- [x] deterministic state extractor unit test
- [x] pinned working set builder unit test
- [x] pending approval / delivery preservation test
- [x] unmatched tool pair block test
- [x] structured summary merge precedence test
- [x] compact capsule persistence test
- [x] `context-preflight` compaction integration test
- [x] active window rewrite token reduction test
- [x] DB 원본 message row 비파괴 보장 테스트

## 수동 smoke

- 분류:
  - UI smoke: approval UI / history replay 확인 필요
  - Runtime smoke: 높음
  - Release smoke: 중간
- [ ] WebUI에서 매우 긴 세션을 만든 뒤 compact가 자동 발생하는지 확인
- [ ] compact 후 응답은 계속되지만 history replay는 원본 대화 이력을 유지하는지 확인
- [ ] approval 대기 상태에서 compact가 일어나도 approval UI가 사라지지 않는지 확인

## 완료 조건

- [x] root session에서 compact가 실제로 동작한다.
- [x] 결정적 상태가 모델 summary보다 우선한다.
- [x] `context-preflight`가 compact를 포함한 최종 prompt budget 조정을 수행한다.
- [x] compact 후에도 pending approval / delivery / latest correction이 유지된다.
- [x] 원본 메시지 이력은 파괴되지 않는다.
- [ ] 실제 UI/Runtime smoke evidence가 기록된다.

## 관련 파일 후보

- `packages/core/src/memory/compaction.ts`
- `packages/core/src/memory/compressor.ts`
- `packages/core/src/runs/context-preflight.ts`
- `packages/core/src/orchestration/prompt-bundle.ts`
- `packages/core/src/db/*`
- `tests/*context*`
- `tests/*compaction*`

## 비범위

- sub-agent own memory state
- handoff capsule / feedback capsule
- capsule rollup
- UI inspector

## 롤백 기준

- `context-preflight` 연동이 기존 root run을 막으면, compaction planner는 dry-run only 모드로 내리고 기존 prune path만 유지한다.
- summary merge가 불안정하면 capsule persistence는 유지하되, active prompt 주입은 기존 `session_snapshots` 요약만 사용한다.
