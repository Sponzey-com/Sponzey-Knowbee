# Task 006 - Memory Inspector UI, Compaction Model Audit, Drift / Release Gate

상태: auto_verified
자동 검증 상태: 완료
수동 smoke 상태: 일부 완료
운영 증거:
- 2026-05-18 `GET /api/memory/inspector?limit=5` 200
- 2026-05-18 `GET http://127.0.0.1:4220/advanced/memory` 200
- 2026-05-18 `buildRequired=false`, `restartRequired=false`
남은 리스크: 브라우저 실화면 클릭 흐름과 release dry-run evidence, manual control end-to-end는 아직 미완료다.
완료 판정 가능 여부: 아니오 (`operationally_verified` 아님)
검증 환경: 로컬 runtime 재시작 + API 응답 확인 + 자동 테스트
검증 일시: 2026-05-18
검증 실행자: Codex

우선순위: P1

## 목표

운영자와 개발자가 메모리 compact 상태를 실제로 관찰하고 검증할 수 있게 만든다.  
이 태스크의 목표는 다음 3가지다.

1. WebUI / Runtime Inspector에서 메모리 상태, capsule, recall trace, manual control을 볼 수 있게 한다.
2. compaction 전용 모델 선택, fallback, budget block, audit를 정식 정책으로 관리한다.
3. summary drift와 메모리 회귀를 release gate 수준에서 검증한다.

이 단계가 완료돼야 메모리 compact가 “동작하는 것처럼 보이는 기능”이 아니라 운영 가능한 기능이 된다.

## 기준 문서

- `.tasks/plan.md`의 `13. WebUI / Runtime Inspector 계획`
- `.tasks/plan.md`의 `14. 모델 정책`
- `.tasks/plan.md`의 `16. 테스트 전략`
- `.tasks/plan.md`의 `17. 리스크와 대응`
- `.tasks/plan.md`의 `18. 완료 기준`
- `.tasks/plan.md`의 `15. Phase 8`, `Phase 9`

## 선행 조건

- `task001.md`
- `task002.md`
- `task003.md`
- `task004.md`
- `task005.md`

## 후속 의존 태스크

- 없음

## 포함 기능

- [x] Memory Inspector / advanced UI / manual controls
- [x] compaction model policy / fallback / audit
- [x] drift regression / quality snapshot / release readiness

---

## 기능 1 - Memory Inspector / Advanced UI / Manual Controls

### 목표

운영 화면에서 compact 상태를 확인하고, 문제 상황에서 최소한의 수동 제어를 할 수 있게 만든다.

### 구현 체크리스트

- [x] Nobie와 각 agent inspector에 메모리 상태 카드를 추가한다.
- [x] 표시 항목 정의:

  - [x] current raw token estimate
  - [x] raw message count
  - [x] latest capsule age
  - [x] active capsule chain depth
  - [x] latest rollup age
  - [x] last compaction reason
  - [x] pending preservation count
  - [x] recall hit count
  - [x] drift warning state
- [x] compact preview 화면을 추가한다.

  - [x] compact 전 head 범위
  - [x] compact 후 capsule preview
  - [x] preserved pinned items
  - [x] dropped raw count
- [x] restore trace viewer를 추가한다.
- [x] manual controls를 추가한다.

  - [x] dry-run compaction
  - [x] force compaction
  - [x] latest capsule inspect
  - [x] capsule invalidate
  - [x] safe restore
  - [x] rollup inspect
- [x] 이 기능들을 `advanced/admin`에서만 보이도록 gating한다.

### 검증 시나리오

- [ ] 일반 사용자 화면에는 memory internals가 보이지 않는지 확인한다.
- [ ] advanced/admin 모드에서는 특정 agent의 latest capsule과 recall trace를 볼 수 있는지 확인한다.
- [ ] dry-run compaction이 실제 write 없이 preview만 보여주는지 확인한다.
- [ ] force compaction이 pending approval를 잃지 않는지 확인한다.

---

## 기능 2 - Compaction Model Policy / Fallback / Audit

### 목표

메인 실행 모델과 compaction 모델을 분리하면서도, 구조화 상태는 여전히 런타임이 source of truth가 되게 유지한다.

### 구현 체크리스트

- [x] compaction 전용 모델 선택 정책을 정의한다.

  - [x] explicit agent compaction model
  - [x] fallback model
  - [x] provider budget block
  - [x] model audit log
- [x] compaction 모델과 main execution 모델을 분리 저장한다.
- [x] compact 실패 fallback 순서를 구현한다.

  - [x] structured heuristic compaction
  - [x] smaller raw tail
  - [x] retrieval-only degrade
- [x] compact 모델이 결정적 상태를 덮어쓰지 못하도록 guard를 추가한다.
- [x] compaction audit event를 inspector/release evidence에서 볼 수 있게 한다.

### 검증 시나리오

- [ ] agent별 compaction model override가 가능한지 확인한다.
- [ ] compact 모델이 실패해도 run 자체는 계속 진행되고 fallback이 적용되는지 확인한다.
- [ ] model audit log에서 어느 모델이 compact에 사용됐는지 추적 가능한지 확인한다.

---

## 기능 3 - Drift Regression / Quality Snapshot / Release Readiness

### 목표

compact summary 왜곡과 메모리 경계 회귀를 자동 검증하고 release gate에 포함시킨다.

### 구현 체크리스트

- [x] `memory quality snapshot` 또는 동등한 운영 지표를 보강한다.
- [x] drift regression 기준을 정의한다.

  - [x] pending approval 보존
  - [x] pending delivery 보존
  - [x] latest instruction precedence
  - [x] owner scope isolation
  - [x] channel boundary isolation
  - [x] append-only history preservation
  - [x] rollup bounded injection
- [x] release evidence에 memory compaction readiness를 추가한다.
- [x] architecture / runtime / prompt gate와 충돌 없는지 검토한다.
- [x] manual smoke checklist를 release runbook에 추가한다.

### 검증 시나리오

- [ ] summary drift regression이 깨지면 release gate가 실패하는지 확인한다.
- [ ] append-only history가 깨지는 경우 readiness evidence에서 경고/차단되는지 확인한다.
- [ ] owner scope isolation 회귀가 있으면 자동 테스트에서 잡히는지 확인한다.

---

## 자동 테스트

- [x] memory inspector view model test
- [x] advanced/admin gating UI test
- [x] compact preview rendering test
- [x] restore trace rendering test
- [x] compaction model policy unit test
- [x] fallback order test
- [x] model audit log serialization test
- [x] memory quality snapshot test
- [x] drift regression suite
- [x] release readiness evidence test

## 수동 smoke

- 분류:
  - UI smoke: 일부 완료
  - Runtime smoke: 일부 완료
  - Release smoke: 대기
- [ ] advanced settings 또는 runtime inspector에서 memory state card가 보이는지 확인
- [ ] force compaction / dry-run compaction / safe restore 제어를 직접 실행해 확인
- [ ] release dry-run에서 memory readiness evidence가 생성되는지 확인

### 수동 smoke 메모

- 2026-05-18: 로컬 runtime 재빌드/재시작 후 `GET /api/memory/inspector?limit=5` 응답 200 확인
- 2026-05-18: 로컬 runtime `snapshot.summary = { owners: 5, warningOwners: 0, qualityStatus: "healthy" }` 확인
- 2026-05-18: `GET http://127.0.0.1:4220/advanced/memory` 응답 200 확인
- 2026-05-18: `buildRequired=false`, `restartRequired=false` 확인

## 완료 조건

- [x] 운영자가 memory compact 상태를 UI에서 관찰할 수 있다.
- [x] compaction model / fallback / audit 정책이 정리된다.
- [x] drift와 memory boundary 회귀가 자동 검증된다.
- [x] release readiness evidence에 memory compact 항목이 포함된다.
- [ ] 브라우저 실클릭과 release smoke evidence까지 확인돼 `operationally_verified`로 올릴 수 있다.

## 관련 파일 후보

- `packages/webui/src/pages/*`
- `packages/webui/src/components/*`
- `packages/core/src/api/routes/memory.ts`
- `packages/core/src/memory/quality.ts`
- `packages/core/src/release/*`
- `docs/release-runbook.md`
- `tests/*memory*`
- `tests/*release*`

## 비범위

- 새로운 메모리 검색 알고리즘 도입
- durable fact review UI 전체 재설계
- 외부 채널별 별도 운영 콘솔

## 롤백 기준

- inspector UI가 기본 사용자 흐름을 복잡하게 만들면 advanced/admin gating을 강화하고 beginner/default UI에서는 완전히 숨긴다.
- drift gate가 과도한 false positive를 내면 release block 대신 warning evidence로 먼저 운영하고 기준을 다시 조정한다.
