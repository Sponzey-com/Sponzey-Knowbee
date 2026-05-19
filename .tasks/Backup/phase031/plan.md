# Nobie / Sub-Agent 메모리 Compact 고도화 계획서

> 목적: Nobie와 모든 서브 에이전트가 `고정 크기의 활성 메모리(window)`를 유지하고, 크기 초과 시 `안전한 compaction snapshot`으로 압축해 맥락 손실과 메모리 혼합 없이 장기 실행을 지속할 수 있게 만든다.
>
> 상태: 작업 기준서
>
> 작성 원칙: 본 계획은 유출되었거나 비공개인 타사 소스를 직접 참고하지 않는다. 대신 현재 Nobie 코드베이스의 `memory_policy`, `memory/compaction`, `session_snapshots`, `task_continuity`, `DataExchangePackage` 구조를 기반으로 한 clean-room 설계만 사용한다.

---

## 0. 재검토 메모

현재 초안은 큰 방향은 맞지만, Nobie의 지향점과 현재 코드 경계에 맞추려면 아래 보강이 필요하다.

1. 구조화 상태를 모델 자유요약에 맡기면 안 된다.
   - `pending approval`, `pending delivery`, `active task`, `target selector`, `tool replay boundary` 같은 값은 런타임이 결정적으로 추출해야 한다.
   - 모델은 narrative summary와 보조 후보를 생성할 수는 있어도, source of truth가 되어서는 안 된다.
2. compact는 prompt window의 논리적 재구성이지, 원본 대화 이력의 파괴적 덮어쓰기여서는 안 된다.
   - 메시지/trace/history는 append-only audit를 유지하고, active read model만 compact된 window로 바꿔야 한다.
3. 장기 세션에서는 capsule도 계속 누적된다.
   - raw message만 compact해서는 충분하지 않고, `capsule chain` 자체에 대한 rollup 정책이 필요하다.
4. owner scope는 이름이 아니라 내부 ID 기준이어야 한다.
   - nickname/display name은 attribution snapshot으로만 보존하고, 실제 메모리 권한과 restore 범위는 내부 owner id와 channel/session boundary로 결정해야 한다.
5. compact는 long-term memory promotion과 동일 작업이 아니다.
   - session/task compaction은 실행 연속성 목적이고, durable fact 승격은 별도 review/writeback 경로를 따라야 한다.

이 문서는 아래 수정 사항을 기준으로 읽는다.

---

## 0.1 문서 상태 체계와 검증 규칙

`phase031`과 파생 task 문서는 모두 같은 상태 체계를 쓴다.

- `planned`
- `implemented`
- `auto_verified`
- `operationally_verified`

원칙:

- `implemented`는 코드/문서 반영이 끝난 상태일 뿐 완료가 아니다.
- `auto_verified`는 자동 테스트, 타입체크, 빌드, 정적 검사 같은 자동 검증이 끝난 상태다.
- `operationally_verified`는 실제 UI/Runtime/Release smoke와 운영 증거까지 확인된 상태다.
- phase headline 상태는 하위 task 상태의 최솟값으로 집계한다.

각 `taskXXX.md`는 최소 다음 필드를 가진다.

- 상태
- 자동 검증 상태
- 수동 smoke 상태
- 운영 증거
- 남은 리스크
- 완료 판정 가능 여부
- 검증 환경
- 검증 일시
- 검증 실행자

즉, `자동 검증 완료 / 수동 smoke 대기` 상태는 아직 완료가 아니다.

### 0.2 수동 smoke 분류

수동 smoke는 아래 3종으로 나눈다.

1. `UI smoke`
   - 실제 브라우저 렌더
   - console exception 없음
   - 주요 버튼/제어 클릭 가능
   - stale 또는 partial API shape에서도 패널 crash 없음
2. `Runtime smoke`
   - runtime restart 이후 continuity/restore/approval 상태 유지
   - recovery path와 latest capsule 복원 확인
3. `Release smoke`
   - release evidence 생성
   - runbook checklist 확인
   - readiness gate 결과 확인

운영 증거 기본 저장 위치:

- local working evidence
  - `.tasks/phase031/evidence/`
- tracked mirror evidence
  - `docs/phase031-memory-governance/`

tracked mirror 최소 파일:

- `docs/phase031-memory-governance/baseline.md`
- `docs/phase031-memory-governance/revision-log.md`
- `docs/phase031-memory-governance/smoke-evidence.md`
- `docs/phase031-memory-governance/decision-log.md`

### 0.3 문서 완료 판정 규칙

다음 조건을 모두 만족해야 phase나 task를 완료로 본다.

1. 관련 unit/integration/webui test 통과
2. 필요한 manual smoke checklist 완료
3. 운영 증거 경로 기록
4. known risk가 `warning` 이하
5. rollback path 문서화

금지:

- `operationally_verified`가 아닌데 headline이나 완료 조건을 완료처럼 적는 것
- runbook과 task 문서의 smoke 정의가 어긋난 상태를 방치하는 것

---

## 1. 목표 요약

이번 개선의 핵심 목표는 다음 8가지다.

1. Nobie와 모든 서브 에이전트가 각자 독립적인 메모리 window를 유지해야 한다.
2. 메모리 크기가 일정 임계치를 넘으면 오래된 raw context를 그대로 누적하지 말고 compact snapshot으로 축약해야 한다.
3. compact 이후에도 `열린 작업`, `대기 승인`, `대기 전달`, `핵심 결정`, `확정 사실`, `산출물 참조`는 반드시 보존해야 한다.
4. 부모 에이전트와 자식 에이전트의 메모리는 계속 분리되어야 하며, 명시적 `DataExchangePackage` 외에는 섞이면 안 된다.
5. compact된 내용은 단순 한 줄 요약이 아니라, 후속 실행에 다시 주입 가능한 `구조화된 capsule`이어야 한다.
6. 메모리 compact는 모델 호출 직전에 panic처럼 수행하는 임시 처리로 끝나면 안 되고, 런타임/DB/UI/테스트/운영 지표까지 포함한 정식 기능이어야 한다.
7. Nobie는 자기 메모리와 각 직속 서브 에이전트의 `compact 상태/마지막 snapshot/압축 이유/복원 흔적`을 모니터링할 수 있어야 한다.
8. 긴 세션, 중첩 위임, 재위임, 피드백 루프, 결과 취합 상황에서도 메모리 왜곡과 누락을 줄여야 한다.

---

## 2. 현재 상태 요약

현재 코드베이스에는 메모리 compact의 기초가 이미 있다.

- `prompts/memory_policy.md`
  - short-term / session / task / artifact / diagnostic / long-term 메모리 범위를 이미 구분한다.
- `packages/core/src/memory/compaction.ts`
  - 세션 기준 token/message threshold
  - silent flush
  - `session_snapshots` 저장
  - pending approval / pending delivery 보존
- `packages/core/src/memory/compressor.ts`
  - 오래된 메시지를 요약하고 tail만 유지하는 초안 로직이 있다.
- `packages/core/src/memory/store.ts`
  - memory document / chunk / FTS / embedding degrade path가 이미 있다.
- `packages/core/src/memory/isolation.ts`
  - 에이전트 간 메모리 전달은 `DataExchangePackage`로 제한하는 구조가 있다.
- `packages/core/src/db`
  - `memory_writeback_queue`
  - `session_snapshots`
  - `task_continuity`
  - 관련 migration이 있다.

즉, 바닥부터 새로 만드는 일이 아니다. 현재 구조를 `세션 단위 snapshot`에서 `에이전트-스코프 compaction runtime`으로 확장하는 것이 맞다.

---

## 3. 현재 구조의 부족한 점

### 3.1 compaction 결과가 너무 얕다

현재 `compressor.ts`의 요약은 짧은 자유 텍스트 중심이라 다음 정보가 빠질 수 있다.

- 아직 끝나지 않은 목표
- 부모가 기대하는 completion condition
- 자식에게서 받아온 핵심 결과와 미해결 충돌
- 파일/스크린샷/receipt 같은 artifact provenance
- 다음 턴에서 꼭 다시 주입해야 할 제약

### 3.2 세션 중심이고 에이전트 중심이 아니다

현재 snapshot은 session 기준이다. 하지만 Nobie 프로젝트에서 실제로 필요한 단위는 다음이다.

- Nobie 자신의 메모리
- 각 서브 에이전트의 own memory
- 같은 에이전트 안의 session memory
- request group / lineage 기준 task continuity

즉 `session only`는 부족하다.

### 3.3 raw tail 유지 규칙이 에이전트 역할별로 다르지 않다

Nobie와 검증형 reviewer agent, 액션 실행형 agent, 수집형 research agent는 보존해야 할 문맥이 다르다.

- Nobie는 사용자 의도, 최종 답변 방향, 직속 child의 결과 취합 상태가 중요하다.
- reviewer는 판단 근거와 충돌 목록이 중요하다.
- tool-heavy child는 마지막 tool receipt와 재실행 경계가 중요하다.

### 3.4 compact 이후 재주입 계약이 약하다

compact summary를 실제 prompt bundle에 어떻게 넣을지, raw tail과 어떤 순서로 합칠지, 어느 scope까지 불러올지 계약이 충분히 선명하지 않다.

### 3.5 drift 감지가 없다

compact summary가 원문을 잘못 요약하거나 중요한 사실을 누락해도, 이를 감지하는 장치가 약하다.

### 3.6 capsule 누적 성장에 대한 경계가 약하다

raw head를 capsule로 바꾸기만 하면 긴 세션에서는 capsule 목록 자체가 다시 비대해질 수 있다.

- latest capsule 하나만 보는 경우 오래된 중요한 흐름이 끊길 수 있다.
- 반대로 capsule을 무한 누적하면 raw history 대신 capsule history가 비대해진다.

즉, `capsule chain`과 `rollup` 규칙이 필요하다.

### 3.7 append-only history 경계가 문서상 충분히 분명하지 않다

현재 초안만 읽으면 compact가 기존 message row를 실제로 덮어쓰거나 삭제하는 것처럼 오해할 수 있다.

- audit
- recovery
- regression replay
- human inspection

을 생각하면, 원본 이력은 append-only로 유지하는 쪽이 맞다.

### 3.8 owner scope와 이름/채널 경계가 약하다

현재 초안은 owner scope를 말하지만, 실제 권한 경계에서 더 중요한 것은 다음이다.

- internal owner id
- session id
- request group id
- lineage id
- channel/thread boundary

별명이나 display name은 바뀔 수 있으므로, 메모리 소유권 기준으로 쓰면 안 된다.

### 3.9 결정적 상태와 모델 생성 상태가 분리되어 있지 않다

`confirmed_facts`, `constraints`, `pending_items` 중 일부는 런타임이 구조적으로 알고 있는 값이다.

이 값을 모델이 자유 생성하게 두면:

- 누락
- 과잉 요약
- 잘못된 일반화
- sibling/private scope 혼입

위험이 커진다.

---

## 4. 목표 아키텍처

각 에이전트는 아래 5계층 메모리 구조를 가진다.

### 4.1 Layer A: Active Raw Window

실제 모델 호출 직전에 그대로 주입되는 최근 raw context다.

구성:

- 최근 사용자 메시지
- 최근 assistant 메시지
- 아직 닫히지 않은 tool_use / tool_result pair
- 최근 handoff 결과
- 현재 run의 필수 system/runtime envelope

특징:

- 가장 비싸지만 가장 정확한 문맥
- 전체 과거를 다 넣지 않고 일정 크기까지만 유지
- compact 이후에도 마지막 tail은 raw로 남긴다

### 4.2 Layer B: Pinned Working Set

compact 여부와 무관하게 항상 보존해야 하는 구조화 상태다.

예:

- active task ids
- pending approvals
- pending delivery
- current target / explicit selector
- open artifact refs
- unresolved conflict list
- user confirmed constraints
- do-not-forget facts for the current lineage
- parent가 child에게 부여한 completion criteria

특징:

- 절대 자유 서술 한 줄에만 의존하지 않는다.
- compact 전후 동일 semantics를 유지해야 한다.

### 4.3 Layer C: Compacted Capsule

오래된 raw head를 대신하는 구조화 snapshot이다.

이 capsule은 단순 summary가 아니라 다음 필드를 가진다.

- `capsule_id`
- `owner_scope`
- `capsule_kind`
  - `session_compaction`
  - `task_compaction`
  - `lineage_compaction`
  - `handoff_compaction`
- `summary`
- `active_objectives`
- `decisions`
- `confirmed_facts`
- `constraints`
- `artifact_refs`
- `pending_items`
- `open_questions`
- `recovery_hints`
- `source_refs`
- `compaction_reason`
- `source_token_estimate`
- `result_token_estimate`

### 4.4 Layer D: Searchable Archive

compact로 raw prompt에서 빠진 오래된 메모리는 DB와 검색 인덱스에 남는다.

역할:

- 필요할 때만 검색해서 다시 가져온다.
- 모든 과거를 매번 prompt에 넣지 않는다.
- FTS 우선, vector는 optional degrade path 유지

### 4.5 Layer E: Durable Long-Term / Review Queue

장기 기억 후보와 운영 진단은 별도 경로로 보존한다.

예:

- `memory_writeback_queue`
- reviewed durable fact
- flash feedback promotion
- diagnostic memory

이 레이어는 일반 대화 문맥에 자동 섞이지 않는다.

### 4.6 Layer F: Capsule Chain / Rollup

한 번 compact된 capsule도 무한히 active injection 대상이 되면 안 된다.

따라서 각 owner scope는 다음 구조를 가진다.

- latest raw window
- recent capsule 몇 개
- rollup capsule 하나

원칙:

- active prompt에는 `recent capsule subset + latest rollup capsule`만 들어간다.
- 더 오래된 capsule은 append-only archive로 남기되, 필요 시 retrieval로만 복원한다.
- rollup은 capsule들의 상위 summary이지만, pending item 같은 활성 상태는 별도 pinned set에서 유지한다.

---

## 5. 메모리 소유권과 격리 규칙

### 5.1 모든 에이전트는 자기 메모리만 직접 읽고 쓴다

- Nobie는 Nobie 자신의 memory scope를 직접 읽고 쓴다.
- 서브 에이전트는 자기 owner scope의 memory만 직접 읽고 쓴다.
- sibling agent memory는 직접 검색 금지다.

### 5.2 부모-자식 전달은 capsule 또는 exchange로만 한다

메모리 전달 허용 경로:

- `DataExchangePackage`
- `CommandRequest`
- `ResultReport`
- 부모가 child 결과를 검토 후 만든 `synthesized capsule`

금지:

- child raw conversation transcript를 부모 prompt에 그대로 주입
- 부모 private memory 전체를 child에게 자동 주입
- sibling memory cross-search

### 5.3 팀은 메모리 소유자가 아니다

- team shared memory를 만들지 않는다.
- team execution은 member memory + owner synthesis memory로만 처리한다.

### 5.4 owner scope는 내부 ID 기준으로 고정한다

- memory owner는 `agent_id`, `session_id`, `request_group_id`, `lineage_id`, `channel_key`, `thread_key` 기준으로 식별한다.
- nickname/display name은 `nickname_snapshot`으로만 보존한다.
- 에이전트 이름이 바뀌어도 기존 memory ownership과 capsule restore 범위는 변하지 않아야 한다.

### 5.5 channel/session 경계를 섞지 않는다

- WebUI session
- Telegram thread
- Slack thread
- 기타 channel session

은 서로 다른 session memory boundary를 가진다.

- 같은 사용자의 요청이라도 channel/thread가 다르면 자동 raw memory merge 금지
- cross-channel continuity가 필요하면 explicit restore 또는 reviewed handoff만 허용

---

## 6. compact 트리거 정책

### 6.1 기본 원칙

메모리는 무한히 쌓지 않는다. 다만 너무 일찍 compact해서 최근 문맥을 잃지도 않는다.

따라서 트리거는 `soft threshold`와 `hard threshold` 두 단계로 둔다.

### 6.2 기본 트리거 입력값

기본 시작값은 현재 코드와 맞춘다.

- `session_compaction_token_threshold = 120_000`
- `session_compaction_message_threshold = 40`
- `tail_size = 10`

단, 최종 구조에서는 이 값을 하드코딩하지 않고 다음 우선순위로 계산한다.

1. agent config override
2. agent runtime profile default
3. provider/model context budget 기반 계산
4. system fallback default

### 6.3 향후 목표 계산식

- `soft_token_threshold`: provider max context의 약 50%~60%
- `hard_token_threshold`: provider max context의 약 65%~75%
- `tail_message_count`: 최근 8~12개 메시지 또는 최근 tool-balanced window
- `max_raw_tool_result_chars`: 대형 tool result는 preflight pruning
- `capsule_rollup_threshold`: active injection에 포함되는 capsule 수 또는 capsule 총 char budget

즉, 단일 숫자보다 `모델/context 크기에 비례한 budget`이 맞다.

### 6.4 compact 실행 조건

다음 조건을 먼저 검사한다.

- token threshold 초과 여부
- message count threshold 초과 여부
- balanced tool pair 여부
- pending approval / pending delivery 보존 가능 여부
- active sub-session review 중인지 여부
- final delivery 직전인지 여부
- active capsule chain 길이 및 rollup 필요 여부

### 6.5 compact 금지 또는 지연 조건

다음 상황에서는 즉시 compact하지 않고 지연한다.

- unmatched tool_use/tool_result pair 존재
- 아직 parent validation이 끝나지 않은 child result만 남아 있는 경우
- pending approval payload가 raw context에만 있고 pinned set으로 승격되지 않은 경우
- final delivery 직전으로 summary drift가 리스크가 큰 경우
- cancellation/recovery 판단 중으로 latest state freeze가 필요한 경우

---

## 7. compact 파이프라인

### 7.1 Stage 0: candidate analysis

입력:

- owner scope
- current raw messages
- token estimate
- pinned working set
- task continuity state
- last capsule metadata

출력:

- `compact_required`
- `compact_reason_codes`
- `candidate_head_range`
- `raw_tail_range`

### 7.2 Stage 1: silent preservation flush

현재 이미 있는 `runSilentMemoryFlushBeforeCompaction`을 확장한다.

보존 대상:

- pending approvals
- pending delivery
- durable facts
- active task ids
- current target selector
- latest artifact receipts
- unresolved conflict ids
- explicit user corrections

결과:

- writeback queue candidate
- preservation audit record

### 7.3 Stage 2: deterministic state extraction

먼저 런타임이 구조적으로 알고 있는 상태를 결정적으로 뽑는다.

예:

- active task ids
- pending approvals
- pending delivery
- target selector / target session
- latest tool receipts
- unresolved result review items
- explicit user corrections
- retry do-not-repeat boundary

이 단계는 모델 없이도 재현 가능해야 하며, compact capsule의 source of truth가 된다.

### 7.4 Stage 3: structured summary build

오래된 raw head에 대해서는 구조화된 compaction contract를 만든다.

여기서 모델은 다음에만 제한적으로 사용한다.

- `summary`
- `what_happened`
- `open_questions`
- `recovery_hints` 초안

즉, narrative compression helper 역할만 하고, 결정적 상태를 덮어쓰지 않는다.

필수 필드:

- `what_happened`
- `current_goal`
- `still_open`
- `confirmed_facts`
- `must_keep_constraints`
- `artifacts_and_receipts`
- `tool_side_effect_boundary`
- `retry_do_not_repeat`
- `handoff_ready_context`

### 7.5 Stage 4: merge and capsule validation

생성된 capsule을 그대로 믿지 않는다.

검사:

- required field missing 여부
- pending approval / delivery 보존 여부
- source refs 존재 여부
- deterministic state와 모델 생성 필드 충돌 여부
- 금지된 scope 혼입 여부
- secret/raw diagnostic leakage 여부
- channel/session boundary 위반 여부

원칙:

- 결정적 상태 > reviewed continuity > 모델 생성 summary

### 7.6 Stage 5: DB persistence

저장 순서:

1. `memory_compaction_runs`
2. `memory_capsules`
3. `memory_capsule_sources`
4. `session_snapshots` compatibility projection
5. `task_continuity` update

주의:

- 기존 `messages`, `run_events`, `result_reports`, `exchange packages`는 삭제/덮어쓰기하지 않는다.
- compact는 append-only 기록과 active read model projection 추가로 끝내야 한다.

#### 7.6.1 compaction run 상태 기계

`memory_compaction_runs.status`는 최소 다음 상태를 가진다.

- `planned`
- `started`
- `persisting_capsule`
- `projecting`
- `completed`
- `failed_retryable`
- `failed_terminal`
- `abandoned`
- `superseded`

원칙:

- 모든 compaction 시도는 고유한 `compaction_run_id`를 가진다.
- active read model은 `completed` 상태 run만 신뢰한다.
- `superseded`는 같은 owner scope에서 더 최신이고 더 완전한 run이 active pointer를 차지한 경우에만 사용한다.
- `failed_retryable`과 `failed_terminal`은 operator와 recovery worker가 구분 가능해야 한다.

#### 7.6.2 owner scope single-writer lease

compaction은 `owner_scope_key` 기준 single-writer여야 한다.

lease 필드:

- `owner_scope_key`
- `lease_owner`
- `lease_acquired_at`
- `lease_expires_at`
- `heartbeat_at`

원칙:

- 같은 owner scope에서 동시에 두 개의 active run이 `started` 이상으로 올라가면 안 된다.
- stale lease는 timeout 이후 recovery worker가 회수할 수 있어야 한다.
- process crash 후 lock이 영구 고착되면 안 된다.
- cleanup worker도 같은 lease namespace를 공유한다.

#### 7.6.3 idempotency와 duplicate suppression

각 compaction 시도는 다음 조합으로 식별한다.

- `compaction_run_id`
- `idempotency_key`
- `owner_scope_key`
- `source_head_signature`
- `raw_tail_signature`
- `trigger_reason_codes`
- `policy_version`

원칙:

- `compaction_run_id`는 개별 실행 식별자다.
- `idempotency_key`는 같은 입력과 같은 정책 버전의 재시도를 같은 logical run으로 묶기 위한 키다.

같은 입력에서 재시도되면 다음 중 하나를 택한다.

- 기존 run 재사용
- 동일 capsule checksum이면 duplicate suppression
- 더 완전한 최신 run만 남기고 이전 run은 `superseded`

즉, 재시도는 중복 row 생산보다 deterministic 재사용을 우선한다.

#### 7.6.4 transaction boundary

권장 저장 순서와 별개로 논리적 transaction boundary를 분명히 둔다.

- `Tx1 - run start`
  - `memory_compaction_runs` row 생성
  - owner scope lock 획득
- `Tx2 - capsule persist`
  - `memory_capsules`
  - `memory_capsule_sources`
  - checksum / provenance 확정
- `Tx3 - projection switch`
  - `agent_memory_state.latest_capsule_id`
  - `session_snapshots` projection
  - `task_continuity` projection
- `Tx4 - finalize`
  - run status `completed`
  - lock release

실패 시 원칙:

- `Tx1`만 성공하고 종료되면 stale run cleanup 대상
- `Tx2`까지 성공하고 `Tx3` 전에 종료되면 다음 recovery pass가 projection만 복구 가능해야 함
- incomplete run은 prompt assembly나 restore 경로로 보이면 안 됨

#### 7.6.5 crash recovery worker

기동 시 또는 주기적으로 recovery worker가 다음을 수행한다.

1. `started / persisting_capsule / projecting` 상태의 오래된 run 탐색
2. lock owner 생존 여부 또는 timeout 확인
3. capsule 존재 여부 확인
4. projection 누락 여부 확인
5. 다음 중 하나로 정리
   - `resume`
   - `reproject`
   - `abandoned`
   - `failed_terminal`

recovery worker 목표는 “최대한 복구”이지, 무조건 삭제가 아니다.

#### 7.6.6 orphan class

다음 orphan class를 정의한다.

- `run_row_only`
- `capsule_without_projection`
- `source_rows_without_capsule`
- `rollup_audit_without_result_capsule`

각 orphan class는 다음으로 분류한다.

- 자동 복구 가능
- 수동 개입 필요
- delete safe

orphan은 delete 전에 provenance와 recovery 가능성부터 판정해야 한다.

#### 7.6.7 projection switch safety

active read model은 다음 조건에서만 새 capsule을 본다.

- capsule validator 통과
- required source refs 존재
- deterministic state merge 완료
- projection write 성공
- run status `completed`

즉 incomplete capsule이 runtime prompt나 restore 경로로 들어가면 안 된다.

#### 7.6.8 persistence observability

추가 이벤트:

- `memory_compaction_lock_acquired`
- `memory_compaction_lock_contended`
- `memory_compaction_resume_started`
- `memory_compaction_projection_recovered`
- `memory_compaction_orphan_detected`
- `memory_compaction_orphan_cleaned`

이 이벤트는 debugging용이 아니라 운영 복구 판단 근거여야 한다.

#### 7.6.9 cleanup / compaction 상호 배제

retention cleanup과 compaction/recovery가 같은 owner scope를 동시에 만지면 안 된다.

원칙:

- compaction worker와 cleanup worker는 `owner_scope_key` 기준 같은 lease namespace를 공유한다.
- compaction이 active이면 cleanup은 defer 한다.
- cleanup이 오래 걸리는 동안 새 compaction이 들어오면 cleanup은 safe pause 또는 abort 가능해야 한다.
- projection rebuild와 cleanup delete가 같은 capsule chain을 동시에 처리하면 안 된다.

#### 7.6.10 version compatibility와 shadow rollout

다음 버전 축을 함께 본다.

- `MemoryCapsule.capsuleVersion`
- `memory_compaction_runs.policy_version`
- projection schema version
- restore reader version

원칙:

- 새 코드가 구버전 capsule을 읽을 수 있어야 한다.
- mixed-version restore 실패를 허용하지 않는다.
- destructive backfill 대신 shadow projection을 우선한다.

rollout 단계:

1. shadow write
2. recovery worker dry-run
3. projection compare
4. active pointer switch
5. orphan cleanup enable

### 7.7 Stage 6: active window rewrite

최종 prompt raw message list는 다음 구조로 재조립한다.

1. system/runtime envelope
2. pinned working set summary block
3. latest valid compacted capsule block
4. raw tail messages
5. optional retrieval snippets

여기서의 rewrite는 `prompt injection window 재계산`을 뜻한다.

- DB 원본 message row를 물리적으로 덮어쓰지 않는다.
- UI/history replay에서는 원본 이력을 계속 볼 수 있어야 한다.

### 7.8 Stage 7: capsule chain rollup

active injection 대상 capsule이 많아지면 rollup을 수행한다.

원칙:

- latest recent capsules는 유지
- 더 오래된 capsules는 상위 rollup capsule로 합친다.
- pending item 같은 활성 상태는 rollup summary에만 두지 않고 pinned working set에 남긴다.

### 7.9 Stage 8: observability

이벤트를 남긴다.

- `memory_compaction_started`
- `memory_compaction_blocked`
- `memory_compaction_completed`
- `memory_compaction_failed`
- `memory_capsule_restored`
- `memory_capsule_rollup_completed`
- `memory_drift_detected`

---

## 8. compact capsule 계약

### 8.1 최소 계약

```ts
interface MemoryCapsule {
  capsuleId: string
  capsuleVersion: number
  parentCapsuleId?: string
  ownerScope: {
    ownerType: "main_agent" | "sub_agent" | "session" | "task"
    ownerId: string
    sessionId?: string
    requestGroupId?: string
    lineageId?: string
    channelKey?: string
    threadKey?: string
  }
  nicknameSnapshot?: string
  capsuleKind: "session_compaction" | "task_compaction" | "lineage_compaction" | "handoff_compaction"
  summary: string
  activeObjectives: string[]
  confirmedFacts: string[]
  decisions: string[]
  constraints: string[]
  pendingItems: string[]
  artifactRefs: Array<{ artifactId?: string; path?: string; receiptId?: string; note: string }>
  recoveryHints: string[]
  sourceRefs: string[]
  compactedMessageIds: string[]
  sourceTokenEstimate: number
  resultTokenEstimate: number
  createdAt: number
}
```

### 8.2 금지 계약

capsule에는 다음이 들어가면 안 된다.

- raw secret
- OAuth token / API key
- sibling agent private memory
- raw stack trace 전체
- raw screenshot binary
- tool input/output 전체 dump

### 8.3 user-facing summary와 runtime capsule 분리

사용자에게 보여주는 요약과 모델에 넣는 capsule은 동일하지 않다.

- user-facing summary: 짧고 읽기 쉬운 설명
- runtime capsule: 구조화된 재주입 컨텍스트

이 둘을 섞지 않는다.

### 8.4 결정적 상태 우선 규칙

다음 값은 모델 generated field보다 런타임 구조값이 우선한다.

- active task ids
- pending approvals
- pending delivery
- target selector
- latest artifact receipt refs
- explicit user correction flags
- replay 금지 경계

### 8.5 compaction과 long-term promotion 분리

capsule 생성은 자동 long-term promotion이 아니다.

- capsule은 session/task continuity 목적
- long-term fact는 writeback review와 승인을 거친 뒤 별도 저장
- compact 과정에서 `confirmed_facts`를 곧바로 global durable fact로 승격하지 않는다

---

## 9. Nobie와 서브 에이전트별 동작

### 9.1 Nobie 메모리

Nobie는 다음을 pinned set으로 더 강하게 유지해야 한다.

- 사용자 최신 의도
- 최종 답변에 꼭 포함해야 할 조건
- 직속 child dispatch 현황
- 검증 대기 child result
- 현재 선택된 top-level skill/capability
- final delivery 차단 사유

### 9.2 서브 에이전트 메모리

서브 에이전트는 자기 역할별로 pinned set이 다르다.

- research agent
  - 조사 질문
  - 수집 source refs
  - 검증 필요 주장
- action/tool agent
  - last tool receipt
  - side-effect replay 금지 정보
  - target/session selector
- reviewer/verifier agent
  - acceptance criteria
  - 충돌 목록
  - rejection reason

### 9.3 재위임 시 메모리

하위 결과가 불만족스러워 재위임할 때는 raw history를 넘기지 않는다.

대신 부모가 아래를 구조화해 넘긴다.

- 유지할 산출물
- 부족한 항목
- 잘못된 항목
- 새 제약
- 재시도 금지 행동

즉, `feedback capsule`을 만든 뒤 `DataExchangePackage`로 전달한다.

---

## 10. retrieval / restore 정책

### 10.1 기본 원칙

compact했다고 과거를 삭제하지 않는다.

- raw prompt window에서는 제거
- searchable archive에는 유지
- 필요 시 selective restore

### 10.2 restore 방식

restore는 두 종류다.

1. `prompt-time recall`
   - 현재 요청과 관련된 과거 chunk만 snippet으로 다시 주입
2. `maintenance restore`
   - session resume / restart / lineage continuation 시 최신 capsule + continuity를 복원

### 10.3 restore 우선순위

1. latest valid capsule
2. task continuity
3. pinned working set
4. memory search result
5. archived raw messages 직접 복원은 마지막 수단

### 10.4 latest instruction 우선 규칙

복원된 capsule 내용이 최신 사용자 지시와 충돌하면 최신 사용자 지시가 우선한다.

- restore는 continuity 보조 수단이지, 현재 의도를 덮어쓰는 source of truth가 아니다.

### 10.5 restore 금지

- 다른 agent owner scope raw restore 금지
- expired exchange package 기반 restore 금지
- revoked trust scope의 foreign memory restore 금지
- 다른 channel/thread raw memory 자동 merge 금지

### 10.6 capsule rollup 복원 규칙

- active prompt에는 rollup capsule 하나와 최신 recent capsules 일부만 넣는다.
- 더 오래된 capsule은 retrieval 필요성이 검증될 때만 가져온다.

---

## 11. DB / 저장소 개선 계획

### 11.1 기존 테이블 유지

기존 것은 유지하고 compatibility layer로 활용한다.

- `memory_writeback_queue`
- `session_snapshots`
- `task_continuity`
- `memory_documents`
- `memory_chunks`
- `memory_access_log`

### 11.2 신규 테이블

#### `agent_memory_state`

- agent/session 기준 현재 메모리 상태
- latest capsule id
- current raw token estimate
- current raw message count
- last compaction at
- compaction blocked reason

#### `memory_capsules`

- capsule 본문 저장
- owner scope
- capsule kind
- structured fields json
- source/result token stats

#### `memory_capsule_sources`

- 어떤 raw message / run event / result report / exchange package를 바탕으로 capsule이 만들어졌는지 추적

#### `memory_compaction_runs`

- compaction 실행 audit
- trigger reason
- model used
- latency
- validation result
- failure reason
- status
- owner scope lease metadata
- idempotency signature
- recovery classification

#### `memory_recall_events`

- 어떤 capsule/archive chunk가 어떤 run에서 복원되었는지 기록

#### `memory_capsule_rollups`

- capsule chain rollup audit
- source capsule ids
- result rollup capsule id
- rollup reason
- recall compatibility metadata

### 11.3 projection

`session_snapshots`는 당장 없애지 않는다.

대신:

- `memory_capsules` → `session_snapshots` summary projection
- `memory_capsules` → `task_continuity` handoff projection

으로 점진 전환한다.

### 11.4 retention 계층과 TTL 정책

append-only는 “영구 무제한 보존”과 같지 않다.

따라서 저장소 수명 관리는 다음 5계층으로 나눈다.

1. `hot`
   - 최신 active capsule
   - current continuity
   - current agent memory state
2. `warm`
   - 최근 recall 가능한 capsule
   - recent rollup
   - 최근 audit 일부
3. `archive`
   - 오래된 searchable raw archive
   - 오래된 chunk/document
4. `diagnostic`
   - recall events
   - compaction runs
   - failure audit
5. `deletion-pending`
   - TTL 만료 또는 명시적 삭제 요청 후 sweep 대기

주요 저장소별 retention class:

- `agent_memory_state`
  - `active-until-replaced`
- `memory_capsules`
  - `medium-term`
- `memory_capsule_sources`
  - `short-to-medium provenance`
- `memory_compaction_runs`
  - `medium-term diagnostic`
- `memory_recall_events`
  - `short diagnostic`
- `memory_capsule_rollups`
  - `medium-term structural audit`
- `memory_documents`
  - `archive`
- `memory_chunks`
  - `archive`

TTL 정책은 숫자를 하드코딩하지 않고 계층별 policy로 둔다.

- `short diagnostic TTL`
- `medium continuity TTL`
- `long archive TTL`
- `explicit retain override`

원칙:

- active capsule과 최신 continuity는 TTL로 바로 지우지 않는다.
- diagnostic event는 archive보다 더 빨리 지울 수 있다.
- user explicit retain flag가 있으면 기본 TTL보다 우선한다.

TTL 면책 규칙:

- `pending approval`
- `pending delivery`
- `awaiting_user`
- `final delivery blocked`
- `active recovery hint in use`

위 항목 중 하나라도 owner scope에 존재하면, 해당 scope의 다음 항목은 cleanup 대상에서 제외한다.

- latest capsule
- current continuity
- required provenance

### 11.5 storage budget, archive compaction, provenance 최소 보존

prompt budget과 storage budget은 별도다.

storage budget 종류:

- `per owner scope byte budget`
- `global memory archive budget`
- `per channel archive budget`

budget 초과 시 cleanup 우선순위:

1. short diagnostic cleanup
2. stale recall event cleanup
3. old rollup audit compaction
4. raw archive segment secondary compaction
5. operator warning

금지:

- budget 초과를 이유로 active continuity를 먼저 지우는 것
- pending state가 있는 owner scope의 latest capsule을 먼저 지우는 것

archive compaction은 retrieval contract를 깨지 않는 선에서만 허용한다.

- 오래된 raw chunk를 larger archive segment로 묶기
- duplicate snapshot dedupe
- obsolete projection cleanup
- provenance hash only retention 옵션

cleanup이 진행돼도 다음 최소 provenance는 남겨야 한다.

- 어떤 capsule이 현재 continuity의 기반인지
- 어떤 recall이 final answer 근거로 허용되었는지
- 어떤 rollup이 어떤 source capsule들을 대체했는지

즉, cleanup 때문에 “왜 이 답이 나왔는지”를 완전히 잃으면 안 된다.

retrieval compatibility 보장:

- latest capsule restore
- latest rollup compatibility
- current continuity restore
- final answer provenance minimum chain

### 11.6 redaction / delete / rebuild / background cleanup

민감정보 정정 또는 삭제 요청 시 다음을 지원해야 한다.

- raw archive redaction
- capsule field redaction
- recall event payload masking
- projection rebuild

append-only 원칙:

- 기본은 tombstone / redacted payload / rebuild pointer 전략을 사용한다.
- 법적/운영상 hard delete가 필요한 클래스만 별도 예외 경로를 둔다.

cleanup 실행 모델:

- request path 직접 실행 금지
- background maintenance worker 수행
- owner-scope 단위 chunked cleanup
- rate limit 적용
- active owner scope는 cleanup 우선순위에서 뒤로 미룸

privacy / scope 정책:

- foreign scope archive merge 금지
- shared archive index 금지
- deleted owner scope는 연관 archive도 함께 sweep

즉, retention과 cleanup은 restore/retrieval contract를 깨지 않는 범위에서만 허용된다.

---

## 12. 런타임 통합 지점

### 12.1 context preflight

현재 `context-preflight`가 oversized context를 막고 있으므로, 여기에 compaction planner를 연결한다.

순서:

1. token estimate
2. prune transient large tool results
3. deterministic state extraction
4. compaction eligibility 판단
5. compact 실행 또는 block
6. final prompt assembly token re-check

### 12.2 prompt bundle

`orchestration/prompt-bundle.ts`에는 raw history 전체가 아니라 아래를 주입한다.

- memory capsule summary block
- pinned set
- task continuity
- optional retrieval snippets

원칙:

- capsule summary block은 source provenance와 owner scope 검증을 통과한 것만 주입
- final prompt budget 초과 시 recent capsule 일부를 rollup capsule로 대체

### 12.3 sub-session runner

자식 실행 시작 시:

- child own memory state 준비
- parent raw history 전체 전달 금지
- handoff capsule만 전달

자식 실행 종료 시:

- result report를 child task memory로 기록
- parent는 raw child history가 아니라 synthesized result context만 흡수

### 12.4 feedback loop

`feedback-loop.ts`는 재작업용 capsule을 생성해야 한다.

즉:

- source result reports
- reviewer findings
- preserved artifacts
- do-not-repeat actions

를 구조화해 새 child run의 seed memory로 준다.

### 12.5 finalization

run 종료 시:

- latest successful summary
- last good state
- pending delivery
- failure recovery hints

를 capsule/continuity에 반영한다.

---

## 13. WebUI / Runtime Inspector 계획

### 13.1 메모리 상태 카드

Nobie와 각 agent inspector에 다음을 노출한다.

- current raw token estimate
- raw message count
- latest capsule age
- active capsule chain depth
- latest rollup age
- last compaction reason
- pending preservation count
- recall hit count
- drift warning state

### 13.2 compact preview

advanced/admin 화면에서 다음을 볼 수 있어야 한다.

- compact 전 head 범위
- compact 후 capsule preview
- preserved pinned items
- dropped raw count

### 13.3 restore trace

특정 run이 어떤 memory capsule과 archive chunk를 참조했는지 inspector trace로 보여줘야 한다.

### 13.4 manual controls

최소한 다음 운영 제어가 필요하다.

- dry-run compaction
- force compaction
- latest capsule inspect
- capsule invalidate
- safe restore
- rollup inspect

단, 기본 사용자 흐름에는 숨긴다.

---

## 14. 모델 정책

### 14.1 compact 전용 모델 허용

실행 모델과 compaction 모델은 분리 가능해야 한다.

이유:

- compaction은 구조화 요약 품질이 중요하다.
- 메인 응답 모델보다 더 저렴하거나 더 안정적인 모델을 쓸 수 있다.
- 단, 구조화 상태의 source of truth는 계속 런타임이어야 한다.

### 14.2 agent별 모델 정책

서브 에이전트는 이미 별도 모델 지정이 가능하므로, memory compaction도 다음 정책을 따른다.

- explicit agent compaction model
- fallback model
- provider budget block
- model audit log

### 14.3 compact 실패 시 fallback

compact 모델 실패 시:

1. structured heuristic compaction
2. 더 작은 raw tail만 유지
3. retrieval-only degrade

순으로 내려가고, 사용자 요청 자체를 바로 실패시키지 않는다.

---

## 15. 단계별 개발 순서

복잡한 자동 학습보다 먼저, 안전한 raw window 관리와 structured capsule부터 만든다.

### Phase 1. 현재 메모리 구조 정리

목표:

- 기존 `compaction.ts`, `compressor.ts`, `session_snapshots`, `task_continuity`, `memory_policy`의 책임 분리

작업:

- session snapshot과 future capsule의 역할 명확화
- compaction entrypoint를 `context-preflight` 기준으로 단일화
- free-text summary와 structured capsule 계약 분리
- append-only history와 active read model 경계 명확화

### Phase 2. structured capsule 계약 도입

목표:

- 자유 텍스트 compaction에서 구조화 capsule로 전환

작업:

- `MemoryCapsule` schema 정의
- validator/normalizer 추가
- source refs / preserved facts / artifact refs 포함
- deterministic state precedence 규칙 추가

### Phase 3. agent memory state 도입

목표:

- Nobie와 각 서브 에이전트가 독립적인 memory state를 갖게 함

작업:

- `agent_memory_state`
- owner scope mapping
- last capsule / token estimate / block reason 저장
- nickname snapshot과 internal id ownership 분리

### Phase 4. Nobie 단독 compact 안정화

목표:

- 우선 Nobie 본체 session에서 compact를 안정화

작업:

- root run preflight compaction
- pinned set preservation
- latest capsule restore
- latest instruction precedence 보장

### Phase 5. sub-agent compact 확장

목표:

- child run / nested child run으로 compaction 확장

작업:

- child own memory state
- parent raw memory 미주입 보장
- handoff capsule only 정책 적용
- channel/thread boundary isolation 보장

### Phase 6. feedback / redelegation capsule

목표:

- 불만족 결과 재위임 시 raw transcript 없이도 재작업 가능하게 함

작업:

- review synthesis capsule
- do-not-repeat / preserve / improve fields
- feedback loop 연동

### Phase 7. retrieval and restore 고도화

목표:

- compact 이후에도 필요한 과거 맥락을 필요한 만큼만 복원

작업:

- capsule recall
- archive recall
- recall trace logging
- capsule rollup and bounded injection

### Phase 8. UI / inspector / 운영 제어

목표:

- 운영자가 compaction 상태를 추적 가능하게 함

작업:

- memory inspector
- compaction preview
- recall trace
- force/dry-run controls

### Phase 9. quality / drift / release gate

목표:

- 요약 왜곡과 회귀를 자동 검증

작업:

- drift regression
- compaction quality snapshot
- release gate 반영

### Phase와 Task 매핑

- `task001`
  - phase031 문서 상태 체계, smoke/evidence, 완료 판정 규칙 정렬
- `task002`
  - persistence state machine / lock / recovery / orphan 규칙 보강
- `task003`
  - retention / TTL / archive lifecycle / redaction 정책 보강
- `task004`
  - backup baseline / tracked mirror / revision governance 정리
- `task005`
  - 기능 본체: retrieval / restore / capsule rollup / bounded injection
- `task006`
  - 기능 본체: memory inspector / compaction model audit / drift / release gate

원칙:

- `task001~004`는 `phase031` 본체 기능을 운영 가능한 수준으로 올리기 위한 governance/persistence/lifecycle 문서 보강이다.
- `task005~006`는 phase031 기능 본체의 후반부 구현과 운영 표면을 다룬다.

---

## 16. 테스트 전략

### 16.1 단위 테스트

- threshold 계산
- balanced tool pair 검사
- pinned set preservation
- capsule validator
- owner scope isolation
- forbidden field rejection
- deterministic state precedence
- append-only history preservation

### 16.2 통합 테스트

- 긴 세션에서 preflight compaction이 실제로 작동하는지
- compact 후 prompt bundle token이 감소하는지
- pending approval / pending delivery가 유지되는지
- Nobie memory와 child memory가 섞이지 않는지
- child result를 부모가 synthesize해도 raw child memory가 직접 보이지 않는지
- restart 후 latest capsule 복원이 되는지
- long session에서 capsule rollup이 bounded injection을 유지하는지
- rename 후에도 owner scope와 recall 대상이 유지되는지
- channel/thread가 다른 세션 memory가 자동 혼합되지 않는지
- same owner concurrent compaction rejection
- crash between capsule persist and projection switch recovery
- stale lease reclaim
- incomplete run not visible in prompt assembly
- duplicate suppression / superseded run handling
- cleanup와 compaction mutual exclusion
- mixed-version restore compatibility
- TTL expiry projection safety
- pending state latest capsule immunity
- active continuity never selected for cleanup
- per-owner storage budget enforcement
- archive compaction keeps latest continuity
- final answer provenance minimum chain preserved
- redacted capsule no longer injected
- cleanup during active run non-blocking
- maintenance worker rate-limit
- foreign scope restore remains blocked
- deleted owner archive sweep

### 16.3 회귀 테스트

- 기존 `task005-writeback-compaction`
- 기존 `task006-context-preflight`
- memory search / writeback / continuity 회귀

에 더해 다음을 추가한다.

- `agent-memory-compaction-isolation.test.ts`
- `memory-capsule-contract.test.ts`
- `memory-capsule-restore.test.ts`
- `feedback-capsule-redelegation.test.ts`
- `memory-drift-guard.test.ts`
- `memory-capsule-rollup.test.ts`
- `memory-append-only-history.test.ts`
- `memory-owner-rename-stability.test.ts`
- `memory-channel-boundary-isolation.test.ts`

### 16.4 WebUI 테스트

- memory inspector 렌더
- compact preview
- latest capsule view
- recall trace
- advanced/admin gating

### 16.5 smoke 검증

#### UI smoke

- `/advanced/memory` 실제 브라우저 렌더
- browser console exception 없음
- compact preview / latest capsule / rollup 보기 / safe restore 제어가 crash 없이 표시
- beginner/default UI에는 memory internals가 노출되지 않음

#### Runtime smoke

- 아주 긴 대화 후 compact 발생
- child 2단계 위임 후 child마다 own capsule 생성
- parent 결과 취합 후 raw child transcript 미노출
- restart 후 same session continuity 복원
- 장시간 세션에서 capsule rollup 후에도 최신 작업 continuity 유지
- cleanup deferred 상태에서 active owner scope continuity가 유지됨
- redaction 이후 restore preview에 민감정보가 재주입되지 않음

#### Release smoke

- release manifest에 memory compaction evidence 생성
- release runbook의 memory compaction manual smoke checklist와 일치
- readiness gate와 drift gate 결과 확인

---

## 17. 리스크와 대응

### 17.1 summary drift

위험:

- capsule이 원문을 잘못 줄여 중요한 사실이 사라질 수 있다.

대응:

- structured required fields
- source refs 강제
- preserved fact validator
- drift regression suite

### 17.2 memory leakage

위험:

- parent/child/sibling memory가 compact 과정에서 섞일 수 있다.

대응:

- owner scope validator
- DataExchangePackage-only cross-scope rule
- restore 단계에서도 same-scope 검사

### 17.3 pending work loss

위험:

- approval/delivery/open task가 compact 중 사라질 수 있다.

대응:

- pinned set 우선 승격
- silent flush before compaction
- blocked compaction rule

### 17.4 excessive latency

위험:

- compact가 잦으면 응답이 느려질 수 있다.

대응:

- soft/hard threshold 이원화
- background maintenance compaction
- cheaper compaction model fallback

### 17.5 over-compaction

위험:

- 너무 이르게 compact해서 최근 문맥 감도가 떨어질 수 있다.

대응:

- tail raw 유지
- agent role별 tail profile
- recent correction/pending items pinning

### 17.6 identity drift / rename confusion

위험:

- 에이전트 이름 변경이나 channel 이동 후 잘못된 capsule이 복원될 수 있다.

대응:

- internal owner id ownership
- nickname snapshot 분리
- channel/thread boundary validation

### 17.7 capsule chain explosion

위험:

- raw history는 줄었는데 capsule chain이 다시 비대해질 수 있다.

대응:

- rollup threshold
- bounded capsule injection
- rollup recall trace

---

## 18. 완료 기준

다음이 만족되면 이 계획의 MVP를 완료로 본다.

1. Nobie와 모든 서브 에이전트가 owner-scoped memory state를 가진다.
2. raw context가 일정 budget을 넘으면 structured capsule compaction이 작동한다.
3. compact 후에도 pending approval, pending delivery, active task, 핵심 제약이 유지된다.
4. parent/child/sibling memory 혼합이 자동으로 일어나지 않는다.
5. 재위임/피드백 루프가 raw transcript 없이 feedback capsule로 이어진다.
6. memory inspector에서 latest capsule, compaction reason, restore trace를 볼 수 있다.
7. 관련 unit/integration/webui/smoke 테스트가 추가된다.
8. 기존 `memory_policy`와 충돌하지 않고, 현재 `session_snapshots`/`task_continuity`와 호환된다.
9. 원본 message/run history는 append-only로 유지되고, compact는 active read model만 바꾼다.
10. compact가 long-term durable fact 승격을 자동 수행하지 않는다.
11. 각 `task001~006` 문서가 공통 상태 필드를 가지며, phase headline 상태는 하위 task 상태의 최솟값과 일치한다.
12. 필요한 UI/Runtime/Release smoke가 끝나고 evidence 경로가 기록된다.
13. `operationally_verified`가 아닌 항목은 완료로 선언되지 않는다.
14. retention class, TTL 면책, storage budget, provenance minimum chain, redaction/rebuild 정책이 문서화된다.

---

## 19. 다음 작업 제안

이 문서를 기반으로 바로 쪼개면 다음 순서가 적절하다.

1. `task001`: phase031 문서 상태 체계, smoke/evidence, 완료 판정 규칙 정렬
2. `task002`: persistence state machine / lock / recovery / orphan 규칙 보강
3. `task003`: retention / TTL / archive lifecycle / redaction 정책 보강
4. `task004`: backup baseline / tracked mirror / revision governance 정리
5. `task005`: retrieval / restore / capsule rollup / bounded injection 구현 유지
6. `task006`: memory inspector / drift gate / release readiness 유지
