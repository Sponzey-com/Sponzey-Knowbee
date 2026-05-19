# Task 001 - 메모리 Compact Foundation과 Capsule 계약 Baseline

상태: auto_verified
자동 검증 상태: 완료
수동 smoke 상태: 대기
운영 증거: 없음
남은 리스크: 실제 UI/Runtime/Release smoke 미완료 상태에서 문서상 완료처럼 읽힐 수 있었던 구조를 이번 phase031 task001에서 정리해야 한다.
완료 판정 가능 여부: 아니오 (`operationally_verified` 아님)
검증 환경: 로컬 자동 테스트 결과 기준
검증 일시: 2026-05-18
검증 실행자: Codex

우선순위: P0

## 목표

메모리 compact 고도화의 가장 바닥 계약을 먼저 고정한다.  
이 태스크의 목표는 다음 3가지다.

1. 현재 메모리 계층과 책임을 정리해서 `raw window / pinned set / capsule / archive / long-term` 구조를 공식화한다.
2. 자유 텍스트 요약이 아니라 구조화된 `MemoryCapsule` 계약을 도입한다.
3. compact가 기존 대화 이력을 파괴적으로 덮어쓰지 않도록 `append-only history + active read model` 경계를 고정한다.

이 단계가 흔들리면 이후의 root compaction, sub-agent memory isolation, handoff capsule, restore, UI inspector가 전부 불안정해진다.

## 기준 문서

- `.tasks/plan.md`의 `0. 재검토 메모`
- `.tasks/plan.md`의 `2. 현재 상태 요약`
- `.tasks/plan.md`의 `3. 현재 구조의 부족한 점`
- `.tasks/plan.md`의 `4. 목표 아키텍처`
- `.tasks/plan.md`의 `7. compact 파이프라인`
- `.tasks/plan.md`의 `8. compact capsule 계약`
- `.tasks/plan.md`의 `11. DB / 저장소 개선 계획`
- `.tasks/plan.md`의 `15. Phase 1`, `Phase 2`

## 선행 조건

- 없음

## 후속 의존 태스크

- `task002.md`
- `task003.md`
- `task004.md`
- `task005.md`
- `task006.md`

## 포함 기능

- [x] 메모리 계층/책임 분리와 용어 정리
- [x] `MemoryCapsule` schema, validator, precedence 규칙 도입
- [x] append-only history와 active read model 경계 고정

---

## 기능 1 - 메모리 계층과 책임 정리

### 목표

현재 `compaction.ts`, `compressor.ts`, `session_snapshots`, `task_continuity`, `memory_policy`가 부분적으로 겹쳐 갖고 있는 책임을 정리한다.

### 구현 체크리스트

- [x] 현재 메모리 레이어를 다음 6단계로 고정한다.

  - [x] `Active Raw Window`
  - [x] `Pinned Working Set`
  - [x] `Compacted Capsule`
  - [x] `Searchable Archive`
  - [x] `Durable Long-Term / Review Queue`
  - [x] `Capsule Chain / Rollup`
- [x] 기존 코드의 역할을 새 용어에 매핑한다.

  - [x] `packages/core/src/memory/compaction.ts`
  - [x] `packages/core/src/memory/compressor.ts`
  - [x] `packages/core/src/memory/store.ts`
  - [x] `packages/core/src/memory/isolation.ts`
  - [x] `prompts/memory_policy.md`
  - [x] `session_snapshots`
  - [x] `task_continuity`
- [x] `결정적 상태`와 `모델 생성 상태`를 분리한다.

  - [x] 결정적 상태 예시를 문서와 타입으로 명시

    - [x] active task ids
    - [x] pending approvals
    - [x] pending delivery
    - [x] target selector
    - [x] latest tool receipts
    - [x] replay 금지 경계
  - [x] 모델 생성 상태 예시를 문서와 타입으로 명시

    - [x] narrative summary
    - [x] what happened
    - [x] open questions
    - [x] recovery hints 초안
- [x] compact와 long-term promotion의 목적을 분리한다.

  - [x] compact는 session/task continuity 목적
  - [x] long-term memory는 writeback review 목적
  - [x] compact 결과가 자동 durable fact promotion이 아님을 명시
- [x] `append-only history`와 `active read model`의 차이를 문서화한다.

### 검증 시나리오

- [ ] 현재 메모리 관련 파일이 어느 레이어 책임을 가지는지 표로 매핑했을 때 공백과 중복이 없는지 확인한다.
- [ ] `결정적 상태` 항목이 모델 없이 런타임에서 재구성 가능한지 검토한다.
- [ ] compact와 long-term promotion을 분리하지 않으면 생길 수 있는 회귀 예시가 문서에 반영됐는지 확인한다.

---

## 기능 2 - `MemoryCapsule` 계약과 validator 도입

### 목표

compact 결과를 자유 텍스트 한 줄이 아니라 재주입 가능한 구조화 계약으로 고정한다.

### 구현 체크리스트

- [x] `MemoryCapsule` 타입을 추가한다.
- [x] 필수 필드를 명시한다.

  - [x] `capsuleId`
  - [x] `capsuleVersion`
  - [x] `parentCapsuleId`
  - [x] `ownerScope`
  - [x] `nicknameSnapshot`
  - [x] `capsuleKind`
  - [x] `summary`
  - [x] `activeObjectives`
  - [x] `confirmedFacts`
  - [x] `decisions`
  - [x] `constraints`
  - [x] `pendingItems`
  - [x] `artifactRefs`
  - [x] `recoveryHints`
  - [x] `sourceRefs`
  - [x] `compactedMessageIds`
  - [x] `sourceTokenEstimate`
  - [x] `resultTokenEstimate`
  - [x] `createdAt`
- [x] `ownerScope` 세부 필드를 명시한다.

  - [x] `ownerType`
  - [x] `ownerId`
  - [x] `sessionId`
  - [x] `requestGroupId`
  - [x] `lineageId`
  - [x] `channelKey`
  - [x] `threadKey`
- [x] `capsuleKind` enum을 정의한다.

  - [x] `session_compaction`
  - [x] `task_compaction`
  - [x] `lineage_compaction`
  - [x] `handoff_compaction`
- [x] validator를 추가한다.

  - [x] required field 누락 거부
  - [x] source ref 누락 거부
  - [x] owner scope 불일치 거부
  - [x] channel/thread boundary 불일치 거부
  - [x] 금지 필드 포함 거부

    - [x] raw secret
    - [x] OAuth token / API key
    - [x] raw screenshot binary
    - [x] raw stack trace 전체
    - [x] sibling agent private memory
    - [x] tool input/output 전체 dump
- [x] precedence 규칙을 정의한다.

  - [x] 결정적 상태 > reviewed continuity > 모델 생성 summary
  - [x] `pendingItems` 등 핵심 구조값은 모델 자유 생성값으로 덮어쓰지 않음
- [x] user-facing summary와 runtime capsule을 분리한다.

### 검증 시나리오

- [ ] capsule 필수 필드 중 하나라도 빠지면 저장/사용이 차단되는지 확인한다.
- [ ] 다른 agent owner scope의 source ref를 섞어 만든 capsule이 validator에서 거부되는지 확인한다.
- [ ] `pending approval`이 모델 요약에서 빠져도 최종 capsule에는 결정적 상태로 남는지 확인한다.
- [ ] 사용자 표시용 summary를 바꿔도 runtime capsule 본문이 바뀌지 않는지 확인한다.

---

## 기능 3 - append-only history와 active read model 경계

### 목표

compact 이후에도 메시지 원본, trace, receipt, result report는 감사와 복구를 위해 계속 남기고, prompt에 주입되는 active window만 재조립되게 만든다.

### 구현 체크리스트

- [x] compact 동작이 수행돼도 다음 원본 저장소를 물리적으로 삭제/덮어쓰지 않도록 규칙을 고정한다.

  - [x] messages
  - [x] run events
  - [x] result reports
  - [x] exchange packages
  - [x] delivery receipts
- [x] `active read model`의 의미를 정의한다.

  - [x] prompt injection window
  - [x] latest capsule projection
  - [x] pinned working set projection
  - [x] continuity projection
- [x] compat projection 경로를 설계한다.

  - [x] `memory_capsules -> session_snapshots`
  - [x] `memory_capsules -> task_continuity`
- [x] append-only audit를 위한 테이블 후보를 정의한다.

  - [x] `memory_capsules`
  - [x] `memory_capsule_sources`
  - [x] `memory_compaction_runs`
- [x] 기존 데이터와 호환되는 migration 전략을 정의한다.

  - [x] 기존 `session_snapshots` 유지
  - [x] 기존 `task_continuity` 유지
  - [x] destructive migration 금지
  - [x] shadow mode 가능 여부 검토

### 검증 시나리오

- [ ] compact 후에도 원본 message row 수가 감소하지 않는지 확인한다.
- [ ] compact 후 prompt에 들어가는 active window만 줄어드는지 확인한다.
- [ ] `session_snapshots`와 `task_continuity`가 새 capsule projection과 병행 가능한지 확인한다.
- [ ] rollback 시 active read model만 비활성화하고 원본 이력을 그대로 유지할 수 있는지 확인한다.

---

## 자동 테스트

- [x] 메모리 레이어 책임 매핑 검증 테스트
- [x] `MemoryCapsule` schema validator unit test
- [x] 금지 필드 거부 테스트
- [x] owner scope / channel boundary validator test
- [x] 결정적 상태 precedence test
- [x] append-only history preservation test
- [x] `session_snapshots` compatibility projection test
- [x] destructive migration guard test

## 수동 smoke

- 분류:
  - UI smoke: 해당 없음
  - Runtime smoke: 낮음
  - Release smoke: 낮음
- [ ] 샘플 긴 세션에 대해 compact 전/후 원본 message history가 그대로 남는지 DB에서 확인
- [ ] runtime capsule preview와 user-facing summary가 서로 다른 값으로 유지되는지 확인
- [ ] 기존 memory 관련 API가 문서 정리 후에도 깨지지 않는지 기본 응답 확인

## 완료 조건

- [x] 메모리 레이어와 책임이 문서/타입/후속 구현 기준으로 고정된다.
- [x] `MemoryCapsule` 계약과 validator가 존재한다.
- [x] append-only history와 active read model의 경계가 명확하다.
- [x] compact와 long-term promotion의 목적이 분리된다.
- [x] 후속 태스크가 이 계약 위에서 작업 가능한 수준으로 정리된다.
- [ ] Runtime 또는 release smoke evidence가 기록된다.
- [ ] 상태를 `operationally_verified`로 올릴 운영 근거가 확보된다.

## 관련 파일 후보

- `prompts/memory_policy.md`
- `packages/core/src/memory/compaction.ts`
- `packages/core/src/memory/compressor.ts`
- `packages/core/src/memory/store.ts`
- `packages/core/src/memory/isolation.ts`
- `packages/core/src/db/*`
- `packages/core/src/contracts/*`
- `tests/*memory*`

## 비범위

- 실제 root run compaction 실행
- sub-agent own memory bootstrapping
- handoff/feedback capsule 생성
- UI inspector 구현

## 롤백 기준

- 새 capsule 계약이 기존 `session_snapshots` 경로를 깨면, capsule 저장은 shadow mode로만 두고 active injection은 기존 경로를 유지한다.
- append-only 경계를 맞추기 어려우면 destructive write를 금지한 상태에서 read-model projection만 먼저 추가한다.
