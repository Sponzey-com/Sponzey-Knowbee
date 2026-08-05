# source.md

## 역할

- `runs`는 사용자 작업 실행 엔진입니다.

## 현재 정리 기준

- 모든 채널/WebUI/스케줄 진입점은 동일한 실행 결정 계약을 타야 한다.
- 서브 에이전트 선택은 현재 에이전트의 direct child 후보와 execution decision trace를 기준으로 한다.
- 컴파일된 기본 진입점, first child selection, 일반 요청의 provider direct fallback은 신규 실행 경로에 들어오면 안 된다.
- child result는 즉시 최종 응답이 아니며 parent aggregation과 final validation을 거쳐야 한다.
- retry/attempt/count는 실패 한도가 아니라 다른 전략을 찾기 위한 신호이다.
- 일반 model/sub-session timeout은 업무 실패 조건으로 쓰지 않고, 큐/외부 도구/사용자 승인 timeout은 boundary timeout으로 분리한다.
- raw user request를 keyword/regex로 읽어 서브 에이전트, 도구, 영역을 고르는 코드는 제거 대상이다.
- 명시 provider target은 `decideExecutionRoute`의 explicit provider branch에서만 처리하며, 일반 root request fallback이나 topology runtime off fallback으로 쓰지 않는다.

## 검증 게이트

- 실행 결정, fallback, provider direct, child result aggregation, final validation 변경은 `pnpm run test:architecture:runtime`을 통과해야 한다.
- default entry, keyword routing, retry/attempt 업무 실패 한도, provider direct fallback 같은 삭제된 개념은 `pnpm run test:architecture:static`으로 막는다.
- prompt/source 문구가 실행 정책을 바꾸는 경우 `pnpm run test:architecture:prompts`를 함께 실행한다.

## 주요 파일

- `start.ts`: root run 생성, request-group 큐 등록, intake/취소/clarification 분배, 승인, 복구, 완료 처리, 후속 오케스트레이션
- `ingress.ts`: 채널 진입점에서 공통으로 쓰는 즉시 접수 receipt, resolved ingress params, ingress 시작 helper
- `entry-semantics.ts`: request-group 재사용, 활성 실행 취소 같은 진입 단계 해석
- `loop-directive.ts`: 루프 안에서 쓰는 `complete/retry_intake/awaiting_user` directive 계약
- `loop-bootstrap.ts`: initial pending directive, queued run 재시작, worker runtime bypass bootstrap helper
- `root-loop.ts`: bootstrap, loop-entry, execution-cycle을 묶는 root loop orchestration helper
- `root-loop-bootstrap-state.ts`: bootstrap 결과와 초기 execution state 조립 helper
- `root-loop-pass-launch.ts`: `loop-entry`, `execution-cycle` 호출용 params/dependencies 조립 helper
- `root-loop-turn.ts`: root loop의 한 번의 turn(`loop-entry -> execution-cycle`) 실행 helper
- `start-plan.ts`: request-group 재사용, reconnect selection, context mode, worker session 계산 helper
- `start-launch.ts`: start-plan, session ensure, run 생성, start initialization helper
- `start-support.ts`: worker session id, active queue 취소, session ensure, journal, filesystem verification wrapper helper
- `task-model.ts`: 기존 run/request-group 저장 구조를 `Task / Attempt / Recovery Attempt / Delivery` projection으로 읽고, 표준 activity timeline, monitor 관측 포인트, explicit `runIds/latestAttemptId` 연결, 사용자용 failure summary/detailLines와 checklist state를 계산하는 helper
- `intake-queue.ts`: `sessionId` 단위 intake 직렬화 helper
- `execution-queue.ts`: `requestGroupId` 단위 execution 직렬화 helper
- `recovery-queue.ts`: `runId` 단위 recovery 직렬화 helper
- `run-queueing.ts`: delayed session queue, delayed run arm/fire helper, one-time delayed run lifecycle 분리 경계
- `start-bridges.ts`: finalization dependency 조립, loop directive apply, intake bridge wrapper helper
- `start-driver-dependencies.ts`: finalization dependency, synthetic approval runtime dependency, root-run driver dependency 조립 helper
- conversation acceptance의 production start adapter는 `channels/start-root-run-conversation-probe.ts`에서 이 `startRootRun -> buildStartRootRunDriverDependencies` 경계를 그대로 사용하며 별도 실행 경로를 만들지 않는다.
- `canonical-self-solve-capability-planning.ts`: Tool이 필요한 root self-solve intake에 canonical snapshot의 실행 가능한 `capability:*` ref만 제공하고, 기존 LLM solution-plan 선택을 admission과 run scope로 변환하는 Application helper. `exclusive_methods -> preferred_methods -> purpose-specific approval Tool -> unconstrained LLM plan` 순서로 후보 범위를 좁히며, exact method가 선택된 실행에는 범용 executor를 companion 후보로 섞지 않습니다. 현재 채널 artifact 전달 capability만 별도 필수 단계로 추가합니다.
- `run-scoped-tool-admission.ts`: solution-plan/policy admission receipt를 immutable 실행 범위로 투영하고, 실행 owner agent와 선택된 외부 exact target을 분리해 보존한 뒤 schema-declared target 필드에 admission target을 결속하는 helper. `yeonjang:<instanceId>` execution ref는 LLM이 만든 복수 target 표현을 제거한 뒤 하나의 structured `instance_id` selector로 투영합니다. Preferred method의 companion Tool 확장은 safe Skill에만 허용하고 side-effecting Skill은 exact effect 범위를 유지합니다. camera capture recovery에는 같은 bound target의 read-only permission status만 명시적으로 companion으로 보존합니다.
- `start-initialization.ts`: instruction journal, active controller binding, 초기 step/status/event 적용 helper
- `execution-profile.ts`: fallback structured request/intent envelope, execution loop runtime state 초기화 helper
- `execution-profile.ts`는 raw request 문구를 재해석하지 않는다. 대신 LLM 계획·정책 검증 후 승인된 capability scope에 현재 채널의 파일 전달 도구가 있으면, 그 durable admission을 단일 `direct artifact delivery` 계약으로 승격한다. 따라서 캡처 artifact가 생성된 뒤에는 재촬영이 아니라 해당 채널 전송 receipt를 먼저 만들어야 한다. direct delivery receipt가 있어도 successful Tool evidence가 있으면 `review-gate.ts`가 LLM completion review를 실행해 실제 촬영과 사용자 목표 충족을 검증한다.
- direct artifact delivery는 preferred method가 있더라도 LLM solution-plan admission을 거쳐 capture와 현재 채널 delivery를 각각 exact Tool/target으로 결속합니다. Exclusive method는 가장 강한 method 제한이며, preferred method와 purpose-specific approval Tool보다 먼저 exact scope를 결정합니다.
- `direct-artifact-delivery-followup.ts`는 typed `camera_artifact`가 생성됐지만 current channel delivery receipt가 없는 경우, 이미 admission된 channel delivery Tool만 다음 follow-up의 실행 범위로 고정합니다. 이 순서 보호는 LLM이 선택한 direct-delivery 계약을 수행하는 것이며, artifact 생성 Tool의 재실행이나 별도의 의미 해석을 하지 않습니다.
- `request-prompt.ts`: `structured_request`를 단계형 checklist execution brief로 바꾸는 공통 helper
- `root-loop-launch.ts`: execution loop runtime state를 `runRootLoop` 호출용 params/dependencies로 바꾸는 bridge helper, 죽은 `originalUserRequest` 중간 반환값 없이 root loop 입력만 조립
- `root-run-driver-failure.ts`: root run driver의 fatal failure 종료와 error chunk 전달 helper
- `root-run-driver.ts`: execution profile 초기화, root loop 실행, fatal failure 처리, cleanup helper
- `loop-directive-application.ts`: `complete/awaiting_user` directive 적용 helper
- `loop-entry-pass.ts`: pending directive, retry_intake, cancellation/intake bridge를 묶는 loop-entry helper
- `loop-pass-application.ts`: loop-entry/recovery-entry/post-execution/review-cycle 결과를 다음 loop 상태로 적용하는 helper
- `intake-bridge-pass.ts`: intake 결과의 즉시 응답, provider receipt-bound 실패 전달, 일정 재분석 directive, delegated follow-up 생성 helper
- intake AI provider의 typed 실패는 exact invocation ref를 `CanonicalExecutionFailure.safeEvidenceRefs`에 보존합니다. bridge는 provider 오류 문구나 deterministic wrapper를 새로운 해결 전략으로 합성하지 않으며, 실행되지 않은 Tool·장치·OS 원인을 이 경계에서 만들지 않습니다.
- `action-execution.ts`: intake action 실행 경계, 예약 등록/취소 실행, delegated follow-up prompt/receipt 조립, `ScheduleActionReceipt`
- `execution.ts`: 파일 변경 감지, 변경 경로 수집, 암묵적 실행 요약, 완료 근거 판단 helper, `ToolExecutionReceipt.executor`
- `execution-attempt-pass.ts`: execution stream 생성, chunk loop, error chunk 처리, tracked delivery 적용을 묶는 execution attempt helper
- `execution-cycle-pass.ts`: execution attempt, recovery entry, post-execution, review cycle 전체를 묶는 execution cycle helper
- `execution-chunk-pass.ts`: `text / execution_recovery / tool_start / tool_end / ai_recovery` chunk 처리 helper
- `tool-chunk-application.ts`: `tool_start/tool_end`의 pending params, receipt 적용, event/summary 반영 helper
- `error-chunk-pass.ts`: error chunk의 worker runtime 복구, fatal failure 적용, error chunk 전달 helper
- `failure-application.ts`: 실행 chunk failure와 unexpected error의 failed/cancelled 종료 적용 helper
- `contract-failure-resolution.ts`: canonical 계약 실패를 repair, changed-strategy, wait, persistence reload, adapter recovery 또는 internal fault의 closed directive로 분류하는 순수 Application helper
- `execution-retry-application.ts`: `execution_recovery`의 실패 기록, execution budget 사용, retry/stop 적용 helper
- `execution-postpass.ts`: command failure와 generic execution recovery를 묶는 post-pass decision helper
- `execution-postpass-application.ts`: execution post-pass의 `retry/stop/continue` 적용 helper
- `execution-runtime.ts`: 설정된 AI backend로 execution chunk stream 생성
- `filesystem-verification.ts`: 파일 생성 결과 검증 prompt, 검증 대상 추론, 실제 파일/폴더 존재 확인 helper
- `analysis-subrun.ts`: 결과 검증 하위 run 생성과 analysis-only subrun 종료 정리 helper, `lineageRootRunId/parentRunId/runScope`를 가진 child lineage와 `handoff` context mode 적용 경계
- `external-recovery.ts`: AI/worker runtime 외부 실행 복구 재라우팅, duplicate-stop, recovery prompt 조립 helper. 외부 복구는 다른 provider/model 전환이 아니라 같은 AI 연결과 같은 대상 유지가 기본이며, worker runtime 경로가 실패한 경우에만 같은 AI 연결의 기본 추론 경로로 되돌립니다.
- `external-recovery-application.ts`: external recovery plan의 duplicate-stop 적용, recovery key 기록, route event 반영, next state 적용 helper
- `external-recovery-pass.ts`: external recovery의 `plan -> apply -> next state` pass helper
- `external-recovery-sequence.ts`: `ai -> worker_runtime` 외부 복구 순회와 next state 적용 helper
- `external-retry-application.ts`: external recovery의 실패 기록, external budget 소모, retry/stop 적용 helper
- `recovery-entry-pass.ts`: 실행 복구 중단, external recovery sequence, failed/aborted 종료를 묶는 복구 진입 helper
- `filesystem-recovery.ts`: 실제 파일 변경 없음/검증 실패에 대한 `initial_retry/retry/stop/verified` decision helper
- `filesystem-postpass.ts`: 파일 변경 없음/검증 subrun/verification decision을 묶는 filesystem post-pass helper
- `filesystem-postpass-application.ts`: filesystem post-pass의 `stop/initial_retry/retry/verified` 적용 helper
- `post-execution-pass.ts`: execution post-pass, delivery pass, filesystem post-pass, review-entry를 한 번에 묶는 post-execution helper
- `delivery-postpass.ts`: preview 보정, 직접 결과 전달 완료, direct artifact delivery post-pass decision helper
- `delivery-pass.ts`: delivery outcome, preview 보정, direct delivery application을 묶는 delivery pass helper
- `delivery-application.ts`: direct artifact 전달의 `complete/retry/stop` 적용 helper

   `terminal-application.ts`: `stop/awaiting_user` terminal 상태 적용 helper
- `review-transition.ts`: 실행 종료 직후 worker runtime 종료 이벤트, runtime preview 저장, reply log 기록, reviewing step 진입 helper
- `review-entry-pass.ts`: review 준비와 direct delivery complete/stop/retry 적용을 묶는 helper
- `store.ts`: 메모리/DB 기반 run 상태 업데이트
- root/child/analysis run은 이제 `lineageRootRunId`, `parentRunId`, `runScope`, `handoffSummary`를 저장합니다. child run은 별도 AI 연결이 아니라 같은 AI 연결을 공유하는 독립 실행 단위로 다루고, handoff 시에는 request-group 전체 대화가 아니라 해당 run의 국소 메시지와 handoff 요약만 사용합니다.
- `routing.ts`: 대상 선택과 복구 시 재라우팅, 설정된 backend만 후보로 삼는 route resolution
- `worker-runtime.ts`: 제거된 외부 worker runtime 경로를 더 이상 실행하지 않도록 막는 보호 helper
- `scheduled.ts`: 예약 후속 실행 프롬프트 생성
- `delivery.ts`: 채널 전달 receipt, 파일 전달 요약, 청크 전달 helper, assistant 텍스트 송신 경계, tracked chunk 전달/receipt 적용 helper
- `completion-state.ts`: completion을 `해석/실행/전달/복구 종료` 4축 checklist 상태로 계산하는 helper
- task projection과 completion checklist는 이제 `lineageRootRunId` 기준 root/child/analysis run 전체를 함께 보며, child run이 남아 있으면 root task를 `completed`로 닫지 않습니다.
- `terminal-outcome-policy.ts`: `completed/failed/cancelled/awaiting_user` terminal 상태 의미를 판정하는 helper
- `completion-flow.ts`: completion review 이후 `complete/followup/ask_user/retry_truncated/recover_empty_result` 결정 helper
- `completion-pass.ts`: completion review 결과를 flow decision과 application decision으로 묶는 completion pass helper
- `completion-application-pass.ts`: completion application의 `complete/stop/retry/awaiting_user` 적용 helper
- completion follow-up은 `tool` 또는 `response_only` 실행 모드와 필요한 Tool 이름, 대상 ref, 근거 ref를 구조화 계약으로 전달합니다. 미해결 freshness/accuracy 증거가 있는데 `response_only`를 선택하거나, `tool` 모드에서 Tool 이름을 생략하면 harness가 거절하고 LLM repair를 요청합니다.
- `intake-retry-application.ts`: `retry_intake`의 failure journal, interpretation budget, retry/stop 적용 helper
- `running-application.ts`: retry/continuation 공통의 running 상태/event/summary 적용 helper
- `retry-application.ts`: recovery retry 공통의 실패 기록, budget 소모, recovery event, running 전환 helper
- `completion-application.ts`: completion decision 적용, 빈 결과 복구/후속 처리/중간 절단 복구/ask_user/stop 후처리 helper
- `review-pass.ts`: completion review 호출과 synthetic approval 감지 묶음 helper
- `review-gate.ts`: direct artifact delivery 완료 시 checklist 기준 완료 항목이 모두 충족되면 불필요한 completion review를 생략하는 helper
- `review-cycle-pass.ts`: review pass와 review outcome pass를 한 번에 묶는 review tail helper
- `review-outcome-pass.ts`: review 이후 synthetic approval/ completion retry·stop 적용을 묶는 helper
- `finalization.ts`: assistant 응답 송신, awaiting_user 전환, cancelled-after-stop 전환, completed 전환 helper, stop/awaiting_user 메시지의 `중단 사유`와 `원본 오류` 분리, 실패 finalization의 단일 typed evidence context 전달, `markRunCompleted`
- `final-response-renderer.ts`: 최종 사용자 문장 생성과 언어 검토 경계. 실패 응답은 하나의 `FinalResponseFailureEvidence`를 정확히 수락한 출력만 허용하고, 별도 LLM 검토로 관측되지 않은 실행·권한·전달 원인 주장을 교정하거나 차단합니다.
- `journaling.ts`: instruction/success/failure 메모리 기록 입력 조립과 안전한 journal insert helper
- `recovery.ts`: 실패 유형 분류, 복구 key, 대안 프롬프트, 중간 절단/빈 결과 복구 helper
- `recovery-budget.ts`: failure kind별 recovery budget 계산 helper
- `approval.ts`: synthetic approval 필요 여부 판단, 승인 안내 요약, 승인 후 continuation prompt helper, 승인 요청 타임아웃/허용/거부 orchestration
- `approval-application.ts`: synthetic approval 승인 후 continuation 결정과 `operation-scoped grant -> running 전환 -> next message` 적용 helper
- `approval-pass.ts`: 같은 run과 tool operation에 결속된 기승인 scope 재사용, 승인 요청, continuation 적용을 묶는 synthetic approval pass helper
- `types.ts`: run과 task profile 계약

## 메모

- request-group 동작, 재질의 예산, “멈추지 말고 계속 진행” 정책이 주로 여기 있습니다.
- ingress 1차 분리로 채널은 이제 공통 `ingress.ts` receipt를 먼저 사용자에게 전달하고, `startIngressRun()`을 통해 무거운 intake/실행은 뒤에서 계속 진행합니다.
- `ingress.ts`는 이제 `sessionId`, `runId(requestId)`, `source`를 먼저 고정한 뒤 `startRootRun()`으로 넘깁니다. 채널/API 진입점은 이 resolved ingress 정보를 기준으로 접수 응답을 만들고, 실제 실행은 같은 식별자를 유지한 채 뒤에서 계속 진행합니다.
- `entry-semantics.ts`는 intake 전에 필요한 진입 의도만 따로 계산합니다. 그래서 `request_group` 재사용, 활성 실행 취소 같은 판단은 `agent/intake`가 아니라 `runs` 계층 책임으로 정리됩니다.
- `loop-entry-pass.ts`는 메인 loop 진입 경계입니다. pending directive 적용, interpretation retry, active queue cancellation, intake bridge를 한 helper로 묶어 `start.ts`가 상단 분기 전체를 직접 들고 있지 않게 정리합니다.
- `loop-pass-application.ts`는 pass 결과 적용 경계입니다. loop-entry/recovery-entry/post-execution/review-cycle helper가 만든 결과를 다음 loop 상태로 바꾸는 공통 apply 로직을 `start.ts` 밖으로 옮깁니다.
- `loop-directive-application.ts`는 pending directive의 실제 apply 경계입니다. `complete`와 `awaiting_user`를 `start.ts` 밖 helper로 묶어 directive apply 세부를 메인 루프 밖으로 옮깁니다.
- `loop-bootstrap.ts`는 loop 시작 전 bootstrap 경계입니다. initial pending directive 구성, queued run 재시작 표시, worker runtime bypass를 `start.ts` 밖 helper로 묶어 상단 preflight glue를 줄입니다.
- `root-loop.ts`는 root loop orchestration 경계입니다. bootstrap, loop-entry, execution-cycle 전체를 한 helper로 묶어 `start.ts`가 while-loop 자체를 직접 들고 있지 않게 정리합니다.
- `start-plan.ts`는 loop 시작 전 request-group/reconnect 계산 경계입니다. request-group 재사용, reconnect candidate 선택, clarification 필요 여부, context mode와 worker session 계산을 `start.ts` 밖 helper로 묶어 상단 초기 계산 glue를 줄입니다.
- `start-launch.ts`는 root run 시작 준비 경계입니다. start-plan, session ensure, run 생성, start initialization을 `start.ts` 밖 helper로 묶어 최상단 launch glue를 줄입니다.
- `start-support.ts`는 시작 공통 보조 경계입니다. worker session id 계산, active queue 취소, session ensure, journal, filesystem verification wrapper를 `start.ts` 밖 helper로 묶어 중복 선언을 줄입니다.
- `intake-queue.ts`는 intake queue 경계입니다. `sessionId` 단위 직렬화를 통해 같은 세션의 intake bridge 분석이 root run execution queue와 섞이지 않도록 분리합니다.
- `execution-queue.ts`는 execution queue 경계입니다. `requestGroupId` 단위 직렬화를 delayed/session queue와 분리해, root run 실행 직렬화가 별도 목적 queue라는 점을 코드 표면으로 올립니다.
- `recovery-queue.ts`는 recovery queue 경계입니다. `runId` 단위 직렬화를 통해 같은 run 안의 recovery entry와 external recovery sequence가 execution attempt 본문과 다른 목적 queue를 타도록 분리합니다.
- `run-queueing.ts`는 큐/지연 실행 경계입니다. delayed session queue와 delayed run arm/fire를 `start.ts` 밖 helper로 묶어 메인 진입점이 지연 실행용 큐 map과 타이머 관리 세부를 직접 들고 있지 않게 정리합니다.
- `task-model.ts`는 상태 모니터와 디버그 API가 기존 `run` 저장 구조 위에서 `Task / Attempt / Recovery Attempt / Delivery`를 읽을 수 있게 하는 projection 경계입니다. 현재 연결 키는 `taskId=requestGroupId`, `attemptId=runId`, `delivery.taskId=requestGroupId`, `delivery.sourceAttemptId=latest attempt runId` 기준으로 두고, recovery 성격 run은 별도 `recoveryAttempts`로 다시 드러냅니다.
- 이 projection은 이제 `runIds`, `latestAttemptId`, `attempt.prompt`까지 함께 내려 프런트가 raw run을 다시 `requestGroupId`로 regroup하지 않고 explicit task ownership만 따라가게 정리 중입니다.
- 이 projection은 이제 free-form recent event label과 별개로 `activities`의 표준 kind(`attempt.*`, `recovery.*`, `delivery.*`), `monitor` 관측 포인트(`activeAttemptCount`, `duplicateExecutionRisk`, `deliveryStatus` 등), checklist state(`request / execution / delivery / completion`)를 함께 계산합니다. 따라서 상태 모니터는 문자열 재해석보다 stable signal을 우선 사용할 수 있습니다.
- `start-bridges.ts`는 시작 bridge 경계입니다. finalization dependency 조립, loop directive apply, intake bridge wrapper를 `start.ts` 밖 helper로 묶어 메인 진입점이 로컬 wrapper 함수 없이 orchestration에 집중하게 정리합니다.
- `start-driver-dependencies.ts`는 driver wiring 경계입니다. finalization dependency, synthetic approval runtime dependency, root-run driver dependency 조립을 `start.ts` 밖 helper로 묶어 메인 진입점이 runtime wiring 세부를 직접 들고 있지 않게 정리합니다.
- Tool이 필요한 root self-solve intake에 사용자 method 제약이 없으면 `start-driver-dependencies.ts`는 canonical policy가 허용한 실행 가능한 ref와 각 Tool의 bounded description, risk, effect class를 기존 solution-plan provider에 전달합니다. 이 metadata는 LLM이 read-only status/discovery, 실제 effect와 별도 artifact delivery를 한 번의 plan에서 구분하기 위한 구조화 context이며 natural-language adapter routing에는 사용하지 않습니다. 모델이 고른 ref는 별도 solution-plan receipt와 capability admission receipt를 거쳐 scope가 되며, intake payload에 역기록하거나 과거 capability-selection provider를 다시 호출하지 않습니다.
- solution-plan scope의 `ownerAgentId`는 실행을 소유한 agent이고 `selectedToolTargets`는 admission의 step/capability/Tool별 binding target과 execution target을 보존합니다. `selectedTargetIds`는 per-selection entry가 없는 기존 single-target scope의 호환 projection으로만 사용합니다. owner와 외부 target identity를 같다고 가정하지 않으며, 선택되지 않은 Tool과 `action:*` 메타 capability는 실행 scope에 포함하지 않습니다.
- direct Telegram artifact 요청은 Tool의 `channelCapability` metadata에서 delivery capability를 찾습니다. 자연어 또는 Tool 이름 비교로 고르지 않으며, 현재 session destination은 raw ID 대신 scope-bound hash ref로 planning에 주입합니다.
- solution-plan admission은 각 selection의 capability binding target과 execution target을 독립적으로 검증하고 execution scope는 그 entry를 Tool 이름까지 보존합니다. missing binding owner를 execution target으로 대체하지 않습니다. dispatch는 현재 Tool에 대응하는 entry의 unique execution target만 사용하며, direct artifact delivery는 실제 Tool params에 target을 추가하지 않고 current source/session에서 다시 만든 opaque destination ref와 scope ref가 일치할 때만 진행합니다. 따라서 camera capture는 선택된 Yeonjang target에, artifact delivery는 현재 Telegram destination에 각각 결속되고 두 target을 하나의 전역 값으로 재사용하지 않습니다.
- `start-initialization.ts`는 run 생성 직후 초기화 경계입니다. instruction journal, active controller binding, orphan worker 정리, 초기 step/status/event 적용을 `start.ts` 밖 helper로 묶어 상단 초기화 glue를 줄입니다.
- `execution-profile.ts`는 execution profile 초기화 경계입니다. fallback structured request/intent envelope 계산과 recovery/delivery 추적 set 초기화를 `start.ts` 밖 helper로 묶어 상단 setup glue를 줄입니다.
- `root-run-driver.ts`는 request-group queue 내부 실행 경계입니다. execution profile 초기화, root loop 실행, fatal failure 처리, cleanup을 `start.ts` 밖 helper로 묶어 queue callback glue를 줄입니다.
- `intake-bridge-pass.ts`는 intake bridge apply 경계입니다. intake 결과에서 즉시 응답, schedule retry_intake, delegated follow-up run 생성을 `start.ts` 밖 helper로 묶어 상단 intake orchestration을 더 줄입니다. delegated follow-up 생성은 이제 실제 결과 run으로 조용히 handoff하고, 실행 시작 안내문을 사용자 채널에 먼저 보내지 않습니다.
- intake provider 실패는 exact run과 LLM invocation receipt를 보존합니다. provider adapter 내부의 실제 대체 payload만 재시도로 인정하고, 실패 문구를 감싼 가짜 changed-strategy directive는 만들지 않습니다. 허용 경로가 끝난 실패 보고는 raw receipt를 자연어 source에 넣지 않고 allowlisted evidence ref, intake stage, reason code, effect 미관측 사실과 next action을 canonical blocked terminal report로 결속합니다. 기존 finalization fact-preservation gate가 LLM 응답을 한 번 repair·재검증하므로 실행되지 않은 도구·장치·OS·전달 원인으로 바뀐 응답은 채널에 전달되지 않습니다.
- 이 bridge는 이제 schedule action receipt를 `schedule.created`, `schedule.cancelled` typed event로도 내보냅니다. 따라서 예약 등록/취소는 현재 run의 응답 텍스트뿐 아니라 별도 lifecycle 레코드로도 관찰됩니다.
- `action-execution.ts`는 intake 결과에서 나온 `create_schedule`, `cancel_schedule`, delegated follow-up prompt/receipt 조립을 `start.ts` 밖으로 뺀 경계입니다. 이 분리로 예약 등록/취소와 후속 실행 브리지 구성은 루프 제어가 아니라 실행 계층 책임으로 옮겨가기 시작했습니다.
- `request-prompt.ts`는 실행 요청문 표준화 경계입니다. 루트 실행 첫 시도, delegated follow-up, scheduled follow-up은 모두 `structured_request`를 `[target] / [to] / [context] / [complete-condition] / [checklist]` 블록으로 펼쳐, 처리 단계를 체크박스 기준으로 확인하며 진행하는 같은 execution brief 형식을 사용합니다.
- 예약 등록/취소 결과도 이제 `ScheduleActionReceipt`로 구조화되어, 일회성 예약/반복 예약/취소가 각각 어떤 실행 결과였는지 completion과 recovery가 문자열 재해석 없이 알 수 있게 정리하고 있습니다.
- 일회성 예약 receipt는 destination을 항상 명시적인 문자열로 정규화하고, recurring receipt는 optional reason을 undefined 속성으로 남기지 않도록 정리해 타입 경계를 안정화합니다.
- `execution-runtime.ts`는 설정된 AI backend 실행 경계입니다. `start.ts`는 더 이상 외부 worker나 다른 CLI를 고르지 않고, 구조화된 실행 파라미터를 이 helper에 넘겨 AI chunk stream만 소비합니다.
- 현재 메인 원칙은 `분석 -> 처리 분배 -> 검토 -> 재분석` 루프이며, 취소 응답이나 intake 즉답도 가능하면 루프 안의 directive로 처리합니다.
- 메인 루프 안에서는 원문 문자열을 다시 직접 해석하지 않고, intake가 넘긴 `intent_envelope`를 우선 사용합니다. `structured_request`와 `execution_semantics`는 이 envelope에서 파생된 하위 구조로 취급합니다.
- intake는 envelope를 만들기 전에 `target`, `destination`, `context`, `complete_condition`, `normalized_english`를 검증·보정하고, 그 결과를 `notes`에 남깁니다. `runs`는 이 검증이 끝난 envelope만 받는 전제를 가집니다.
- 파일 변경 감지, 변경 경로 수집, 암묵적 실행 요약, 완료 근거 판단은 `execution.ts`로 분리해, 이 부분이 자연어 원문 대신 `toolName`, `tool params`, `execution_semantics`만 보도록 정리하기 시작했습니다.
- `ToolExecutionReceipt`는 이제 `tool_end.details.via`와 파일 도구 종류를 이용해 `yeonjang/local/file_tool/core` 실행 경계를 구조화합니다. 그래서 Yeonjang 호출, 로컬 도구 실행, 파일 도구 실행이 recovery/completion에서 문자열 재해석 없이 구분됩니다.
- `execution-chunk-pass.ts`는 일반 execution chunk apply 경계입니다. `text / execution_recovery / tool_start / tool_end / ai_recovery` 처리에서 공통으로 쓰이던 usedTurns/maxTurns 계산과 상태 반영을 `start.ts` 밖 helper로 묶습니다.
- `execution-attempt-pass.ts`는 execution 시도 전체 경계입니다. stream 생성, chunk loop, error chunk 처리, tracked delivery 적용을 한 번에 묶어 `start.ts`가 실행 시도 세부를 직접 들고 있지 않게 정리합니다.
- direct artifact delivery가 실제 receipt로 성공하면 `execution-attempt-pass.ts`는 같은 시도 안의 추가 chunk 소비를 즉시 멈춥니다. 따라서 파일 전송이 끝난 뒤 같은 시도에서 AI/worker의 후속 텍스트나 동일 오류가 계속 흘러나오지 않도록 정리했습니다.
- `execution-cycle-pass.ts`는 while-loop 본문 경계입니다. execution attempt, recovery entry, post-execution, review cycle 전체를 한 helper로 묶어 `start.ts`가 loop 내부 orchestration보다 상태 반영에 더 집중하게 정리합니다.
- `tool-chunk-application.ts`는 `tool_start/tool_end` apply 경계입니다. pending tool params 관리와 tool receipt 적용 뒤 event/summary 반영을 `start.ts` 밖으로 공통화합니다.
- `error-chunk-pass.ts`는 error chunk apply 경계입니다. worker runtime 복구 시도, fatal failure 적용, error chunk 전달을 `start.ts` 밖 helper로 공통화합니다.
- `tool_end` chunk는 이제 바로 루프 상태를 뒤섞지 않고, 먼저 `execution.ts`의 `ToolExecutionReceipt`로 구조화된 뒤 메인 루프가 그 receipt를 적용합니다.
- `tool_end` 이후 성공 도구 누적, 파일 변경 경로 누적, 명령 실패 누적도 `execution.ts` helper가 맡기 시작했고, `start.ts`는 적용 결과만 반영하는 방향으로 정리하고 있습니다.
- `execution-retry-application.ts`는 `execution_recovery` 청크 적용 경계입니다. 실패 기록, execution budget 확인, retry/stop 상태 전환을 `start.ts` 밖 helper로 공통화합니다.
- `execution-postpass.ts`는 command failure와 generic execution recovery를 하나의 post-pass decision으로 묶는 경계입니다. `start.ts`는 더 이상 두 분기를 따로 풀지 않고 helper 결과를 적용합니다.
- `execution-postpass-application.ts`는 execution post-pass 적용 경계입니다. `retry / stop / continue`의 실제 적용을 `start.ts` 밖 helper로 공통화하고, 메인 루프는 seen key 등록과 next message 전환만 반영합니다.
- 파일 생성 결과 검증 규칙도 `filesystem-verification.ts`로 분리해, `start.ts`는 검증 하위 run 생성과 상태 반영만 맡고 검증 대상 추론/실제 존재 확인은 별도 execution 보조 모듈이 담당합니다.
- synthetic approval 대상 여부와 승인 안내 요약/continuation prompt도 `approval.ts`로 분리해, 메인 루프는 승인 이벤트를 열고 결과를 반영하는 역할에 더 가깝게 정리하고 있습니다.
- synthetic approval 요청 자체의 타임아웃, 이벤트 발행, 거부/허용 반영도 `approval.ts`로 옮겨, `start.ts`는 승인 필요 여부를 감지하고 helper 결과를 적용하는 orchestration 쪽으로 더 좁혀졌습니다.
- synthetic approval 승인 후 continuation 적용도 `approval-application.ts`로 분리해, `start.ts`는 scope grant와 continuation 전환만 반영하는 쪽으로 더 좁혀졌습니다.
- synthetic approval 승인 후 `scope grant -> running 전환 -> next message` 적용도 `approval-application.ts`에서 같이 묶기 시작해, `start.ts`는 approval pass 결과를 받고 상태 반영만 하도록 더 좁혀졌습니다.
- synthetic approval의 `기승인 scope 재사용 -> 승인 요청 -> continuation 결정` 전체 패스도 `approval-pass.ts`로 묶어, `start.ts`는 grant 반영과 다음 message 전환만 맡는 방향으로 더 좁혀졌습니다.
- completion review 호출과 synthetic approval 감지 묶음도 `review-pass.ts`로 분리해, `start.ts`는 review 결과와 approval request를 소비하는 orchestration 쪽으로 더 좁혀졌습니다.
- review 이후의 synthetic approval retry와 completion retry/stop 적용 묶음도 `review-outcome-pass.ts`로 분리해, `start.ts`는 review 결과 뒤의 next message와 flag 반영만 맡도록 더 좁아졌습니다.
- `review-cycle-pass.ts`는 review 이후의 `review pass -> review outcome pass` 연쇄를 한 번에 처리해, `start.ts`가 review tail에서 retry 결과와 flag만 반영하도록 더 줄입니다.
- 실행 종료 직후 `worker runtime 종료 이벤트`, runtime preview 저장, reply log 기록, reviewing step 진입도 `review-transition.ts`로 분리해, `start.ts`는 review 전환 세부보다 post-pass orchestration에 더 집중하게 정리했습니다.
- completion review 이후의 `flow decision -> application decision` 조합 계산도 `completion-pass.ts`로 묶어, `start.ts`는 completion apply 결과를 소비하는 orchestration 쪽으로 더 좁혀졌습니다.
- completion application의 `complete / stop / retry / awaiting_user` 실제 적용도 `completion-application-pass.ts`로 묶어, `start.ts`는 completion apply 결과를 받고 flag와 next message만 반영하도록 더 좁아졌습니다.
- `retry_intake`의 실패 기록, interpretation budget 확인, retry/stop 적용도 `intake-retry-application.ts`로 묶어, `start.ts`는 일정 해석 복구 적용 세부를 직접 들고 있지 않도록 더 좁아졌습니다.
- 실행 중 `chunk failure`와 `unexpected error`의 `event/status/journal/cancelled` 적용도 `failure-application.ts`로 분리해, `start.ts`가 fatal failure 종료 세부를 직접 들고 있지 않도록 더 좁아졌습니다.
- review 진입 직전의 `prepare review + direct delivery complete/stop/retry` glue도 `review-entry-pass.ts`로 묶어, `start.ts`는 delivery/review 경계의 다음 상태 반영에 더 집중하게 정리했습니다.
- `post-execution-pass.ts`는 execution 이후 `retry/break/continue`와 preview, delivery outcome, seen recovery key를 한 번에 계산해 `start.ts`의 post-pass glue를 더 줄입니다.
- `execution-postpass.ts`는 이제 새 recovery key나 구조화된 대안이 없으면 `none`으로 넘기지 않고 `stop`을 반환합니다. 따라서 `실행 실패 + 대안 있음 => retry`, `실행 실패 + 대안 없음 => terminal stop` 규칙을 post-pass 경계에서 구조적으로 고정합니다.
- Agent가 typed terminal Tool failure notice를 내보내면 `execution-chunk-pass`가 이를 같은 run의 terminal stop으로 전환합니다. 따라서 실패한 화면/카메라/연장 작업이 completion follow-up의 가상 Tool 호출이나 직접 전달 재시도 루프로 되돌아가지 않습니다.
- filesystem post-pass의 `stop / initial_retry / retry / verified` 적용도 `filesystem-postpass-application.ts`로 묶어, `start.ts`는 filesystem decision의 다음 상태 반영에 더 집중하게 정리했습니다.
- direct delivery retry, synthetic approval continuation, completion retry에 공통으로 쓰이는 running 상태/event/summary 적용도 `running-application.ts`로 분리해, `start.ts`는 message 전환과 clear flag 반영만 맡는 방향으로 더 좁혀졌습니다.
- command failure, generic execution failure, filesystem mutation/verification retry, direct delivery retry, completion retry에 공통으로 쓰이는 실패 기록, budget 소모, recovery event, running 전환도 `retry-application.ts`로 분리하기 시작했고, `start.ts`는 retry별 고유한 next message와 clear flag 반영에 더 집중합니다.
- execution scope의 Tool admission/target bind가 dispatcher 전에 실패하면 `run_scoped_pre_dispatch_failure`가 effect 미발생, bounded reason code와 scope/Tool/target-entry-bound opaque fingerprint를 기록합니다. 모델이 target selector나 output path 표현을 바꿔도 같은 scope failure fingerprint를 유지하며 현재 Tool round를 한 번에 끝내 기존 LLM execution-recovery 경계로 돌립니다. camera recovery에서 dispatcher에 도달한 같은 request-group의 동일 Tool 이름과 canonical params hash는 승인이나 remote dispatch 전에 `recovery_strategy_unchanged`로 거부합니다. permission status 조회, 새 admission scope, 다른 device/target 또는 다른 허용 Tool처럼 구조적으로 달라진 호출은 별도 전략으로 허용합니다. 동일한 deterministic recovery key가 다시 관찰되면 코드는 count-only terminal stop을 만들지 않고 LLM completion review로 돌려 `followup`, `blocked` 또는 evidence-bound `paths_exhausted`를 선택하게 합니다.
- 실패한 Yeonjang post-check의 recovery projection은 Tool 이름, method, post-check kind/reason code와 해시된 target ref만 포함합니다. raw target, local path, Tool output과 payload는 recovery prompt와 일반 로그로 전달하지 않습니다.
- direct delivery 완료와 일반 completion 완료에 공통으로 쓰이는 success/status 업데이트도 `finalization.ts`의 `markRunCompleted`로 공통화해, `start.ts`는 완료 결과 선택과 event label 결정에 더 집중하는 방향으로 더 좁혀졌습니다.
- `stop / awaiting_user` terminal 상태 적용도 `terminal-application.ts`로 분리해, direct delivery stop, completion stop, completion awaiting_user, loop directive awaiting_user가 같은 helper를 타도록 정리했습니다.
- Telegram 채널의 chunk 텍스트 누적과 파일/tool status 전달은 `channels/telegram/chunk-delivery.ts`로 이동하기 시작했고, `runs`는 그 결과 receipt만 적용하는 쪽으로 더 밀어내고 있습니다.
- 후속 실행 프롬프트와 예약 실행 프롬프트는 intake가 만든 `structured_request`를 기준으로 `[target]`, `[to]`, `[context]`, `[complete-condition]`, `[normalized-english]` 블록을 포함해 내려보냅니다.
- `startRootRun()`도 이제 `intentEnvelope`를 1급 입력으로 받아, follow-up run과 delayed run이 같은 intent 계약을 그대로 이어받을 수 있게 정리하고 있습니다.
- 예약 후속 실행 프롬프트의 `[to]`는 가능하면 Telegram chat/thread 같은 실제 전달 대상을 그대로 써서, `current channel` 같은 모호한 목적지 문구를 줄입니다.
- `안녕이라고 해줘`처럼 채널 표기가 없는 예약 발화도 literal text 전달 요청으로 해석해서, `[target]`은 문구 자체, `[to]`는 실제 전달 대상, `[complete-condition]`은 해당 문구의 1회 전달로 구체화합니다.
- 특히 예약 발화 분류는 `말해줘/알려줘/보내줘`뿐 아니라 `해줘/해 주세요`까지 포함해야 합니다. 이 분류가 실패하면 delayed run 등록 시 `directDelivery=false`가 되어 예약 실행이 불필요하게 AI 경로로 들어갑니다.
- 일정 생성 시 direct delivery 여부와 예약 전달 대상은 `followup_run_payload.literal_text`와 `followup_run_payload.destination`을 우선 사용해서, 등록 시점과 실행 시점 모두 같은 구조화 정보로 direct completion을 판단합니다.
- 예약 등록/취소와 delegated follow-up prompt/receipt 조립은 이제 `action-execution.ts`에서 테스트 가능한 helper로 다루고, `start.ts`는 그 결과를 받아 루프에 반영하는 쪽으로 더 얇아졌습니다.
- intake 단계의 일정 action이 전부 실패하면 그 실패 receipt를 바로 `completed`로 닫지 않고, 메인 루프 안에서 `retry_intake` directive로 다시 intake 재분석을 시도합니다.
- 이때 재질의 횟수 한도 때문에 멈추지 않고, 같은 실패키 반복 여부와 새 안전 대안 존재 여부로만 자동 재시도를 판단합니다.
- schedule recovery용 intake 재분석은 현재 루프의 `currentMessage`를 사용하되, 후속 실행과 예약 등록에 남는 `originalRequest`는 계속 원래 사용자 요청을 유지합니다.
- 실패 유형 분류, route change 판정, AI/worker/command recovery prompt 조립, 중간 절단 복구 판정은 `recovery.ts`로 분리해 `start.ts`에서 떼어내기 시작했습니다.
- 이 분리 덕분에 `start.ts`는 메인 루프 상태 전환과 receipt 반영에 더 집중하고, recovery key/프롬프트/동일 실패 회피 규칙은 별도 테스트 대상으로 유지합니다.
- direct artifact 전달 실패도 `recovery.ts`의 delivery recovery candidate로 분리해, 메신저 결과물 전달 재시도 요약/사유/remaining items를 메인 루프가 직접 만들지 않도록 정리하고 있습니다.
- 최종 텍스트 전달 실패도 `recovery.ts`에서 채널/실패 단계별 설명으로 정리해, Telegram/WebUI/CLI의 delivery failure event를 같은 기준으로 남기는 방향으로 정리하고 있습니다.
- recovery candidate는 이제 `alternatives`를 포함해 `다른 도구 / 다른 연장 / 다른 채널 / 다른 일정 / 같은 채널 재전송` 후보를 구조화합니다. 메인 루프는 이 구조를 event와 recovery prompt에 그대로 반영합니다.
- recovery retry는 `interpretation / execution / delivery / external`별 사용량을 기록하되, 고정 횟수 한도로 일반 복구를 중단하지 않습니다. 반복 실패키, 새 대안 없음, 승인/개인정보/위험 작업 필요 여부가 중단 기준입니다.
- 메인 루프의 완료/승인/직접 전달/절단 복구 판단은 이제 `request-semantics.ts`의 원문 해석보다 intake가 넘긴 `execution_semantics`와 `structured_request`를 우선 사용합니다.
- request-group 재연결과 활성 실행 취소 같은 진입 해석은 `runs/entry-semantics.ts`에서 처리하고, `start.ts`는 그 결과만 사용합니다.
- 일부 파일 검증 대상 추론은 아직 원 요청 문자열을 참고하지만, `Task Intake Bridge` 문구를 다시 파싱하는 방식은 제거했습니다.
- 예약된 직접 메신저 전달도 더 이상 지연 타이머에서 채널로 바로 보내지 않고, 예약 run을 만든 뒤 메인 루프 안의 completion directive로 처리합니다.
- 최종 완료 의미는 `start.ts` 메인 루프가 결정하고, `store.ts`는 그 상태를 저장하고 방송합니다.
- 메신저 파일 전달 완료는 `FILE_SEND:` 같은 출력 문자열이 아니라, 채널 계층이 실제 전송을 마친 뒤 넘겨주는 구조화된 receipt를 기준으로 판단합니다.
- 전달 receipt 처리와 파일 전달 요약, 청크 전달 에러 흡수는 이제 `delivery.ts`로 분리해 `start.ts`의 전달 책임을 줄이기 시작했습니다.
- assistant 텍스트 응답 송신도 `delivery.ts`의 `emitAssistantTextDelivery()`로 옮기기 시작했습니다. `start.ts`는 완료/대기/중단 상태 전환에 더 집중하고, 실제 assistant 메시지 저장·stream event·chunk 송신은 전달 계층이 맡습니다.
- 이 helper는 실행 성공과 전달 성공을 같은 의미로 뭉개지 않도록, 텍스트 chunk 실패와 done chunk 실패를 별도 outcome으로 분리합니다. 그래서 `실행은 성공했지만 응답 전달이 실패한 경우`도 이벤트와 테스트에서 따로 드러납니다.
- Telegram 채널이 최종 텍스트를 실제로 전송하면 `textDeliveries` receipt를 반환하도록 정리하기 시작했습니다. 이제 파일 전달만이 아니라 텍스트 전달도 delivery 계층에서 구조화된 성공 신호로 다룹니다.
- direct artifact delivery와 일반 실행 결과 전달의 경계도 `delivery.ts`의 `resolveDeliveryOutcome()`로 분리해, 전달 성공 여부가 completion 판단에 독립적으로 반영되도록 정리하고 있습니다.
- 그리고 direct artifact delivery가 성공한 시점에는 같은 execution attempt 안의 후속 chunk 소비를 멈추므로, 전달 성공 뒤 불필요한 추가 검토나 동일 오류 재출력을 줄이는 방향으로 연결됩니다.
- completion review 이후의 `완료 / 후속 처리 / 빈 결과 복구 / ask_user / 중간 절단 복구` 분기도 `completion-flow.ts`에서 결정하기 시작해, `start.ts`는 decision 적용과 상태 전환에 더 집중하는 방향으로 정리하고 있습니다.
- completion decision을 실제 retry/stop/awaiting_user/complete로 적용하는 후처리도 `completion-application.ts`로 분리해, `start.ts`는 budget 소비와 상태 반영만 남기는 방향으로 더 좁혀졌습니다.
- 완료/대기/중단 상태 전환과 assistant 응답 송신 경계도 `finalization.ts`로 분리하기 시작해, `start.ts`는 finalization orchestration과 메인 루프 제어에 더 집중하는 방향으로 정리하고 있습니다.
- `finalization.ts`는 전달 helper 의존성을 주입받도록 정리되어, 상태 전환과 assistant 송신을 실제 DB/eventBus 없이도 테스트할 수 있는 경계를 가집니다.
- `journaling.ts`는 실행 결과 메모리 기록 경계입니다. `instruction/success/failure` 요약 생성과 focused error 추출, journal insert 예외 흡수를 `start.ts` 밖에서 공통화합니다.
- `analysis-subrun.ts`는 결과 검증용 보조 run orchestration 경계입니다. 하위 run 생성, parent event 기록, `interrupted` 정리를 `start.ts` 밖에서 테스트 가능한 helper로 유지합니다.
- `external-recovery.ts`는 외부 실행 복구 경계입니다. AI/worker runtime 오류 뒤 reroute 여부, duplicate-stop, worker fallback, recovery prompt 조립을 `start.ts` 밖으로 공통화합니다.
- `routing.ts`와 `external-recovery.ts`는 더 이상 기본 provider/model 문자열만 보고 AI 경로를 암묵 활성화하지 않습니다. 실제로 설정된 backend가 있을 때만 AI route나 fallback을 선택하고, 연결된 AI가 없으면 명시적 설정 오류로 멈춥니다.
- Anthropic 계열 연결도 별도 worker가 아니라 설정 기반 `provider:anthropic` backend로만 라우팅합니다. 현재 실행 경로는 설정창에 연결된 AI backend만 사용하고, 외부 worker CLI는 라우팅 후보에 포함하지 않습니다.
- `external-recovery-application.ts`는 external recovery plan 적용 경계입니다. duplicate-stop terminal 적용, recovery key 기록, route event 반영, next state/next message 전환을 `start.ts` 밖으로 공통화합니다.
- `external-recovery-pass.ts`는 AI/worker runtime 외부 복구의 `plan -> apply -> next state` 패스를 묶는 경계입니다. `start.ts`는 외부 복구 종류별로 거의 같은 블록을 두 번 들고 있지 않고 helper 결과만 반영합니다.
- `external-recovery-sequence.ts`는 `ai -> worker_runtime` 외부 복구 순회 경계입니다. `start.ts`는 더 이상 recovery 종류 배열을 직접 순회하며 stop/retry를 수동으로 접지 않고, 전체 시퀀스 결과만 반영합니다.
- `recovery-entry-pass.ts`는 chunk loop 직후 복구 진입 경계입니다. execution/AI 복구 한도 중단, external recovery sequence, failed/aborted 종료를 한 패스로 묶어 `start.ts`가 직접 큰 분기 블록을 들고 있지 않도록 정리합니다.
- 이 복구 진입 경계는 이제 `recovery-queue.ts`를 통해 같은 `runId` 안에서 직렬화됩니다. 따라서 recovery 시퀀스는 execution loop와 분리된 explicit recovery queue를 타는 방향으로 정리 중입니다.
- `external-retry-application.ts`는 external recovery 재시도 적용 경계입니다. AI/worker runtime 복구 실패 기록, external budget 사용, retry/stop 상태 전환을 `start.ts` 밖으로 공통화합니다.
- `filesystem-recovery.ts`는 파일 작업 복구 경계입니다. 실제 파일 변경이 없는 경우와 검증 실패 경우를 `initial_retry/retry/stop/verified` decision으로 구조화해, `start.ts`가 직접 문자열과 분기를 오래 들고 있지 않게 정리합니다.
- `filesystem-postpass.ts`는 파일 변경/검증 post-pass orchestration 경계입니다. missing mutation decision, verification subrun 호출, verification decision 적용을 하나의 helper 결과로 묶어 `start.ts`가 큰 두 블록을 직접 들고 있지 않게 정리합니다.
- `delivery-postpass.ts`는 전달 후처리 경계입니다. preview 보정, 직접 결과 전달 완료, direct artifact delivery 복구/중단 결정을 메인 루프 밖 helper로 공통화합니다.
- `delivery-pass.ts`는 전달 후처리 계산 경계입니다. delivery outcome, preview 보정, direct delivery application을 한 번에 계산해 `start.ts`가 전달 후처리 계산을 흩어 들고 있지 않도록 정리합니다.
- `delivery-application.ts`는 direct artifact 전달 decision의 실제 적용 경계입니다. `start.ts`는 성공/중단/재시도 상태 반영만 하고, 전달 복구의 title/detail/step summary는 helper가 구조화합니다.
- `delivery.ts`의 `deliverTrackedChunk()`는 실행 루프가 `deliverChunk + applyChunkDeliveryReceipt`를 직접 묶지 않도록, chunk 전달과 receipt 적용을 delivery 계층에서 한 번에 처리합니다.
- `root-loop-launch.ts`는 이제 `originalUserRequest`를 별도 중간 값으로 다시 노출하지 않고, `rootLoopParams.originalRequest`와 verification/intake bridge wrapper 안에서만 유지합니다.
- one-time delayed run은 이제 원 `requestGroupId`를 다시 사용하지 않고 새 root task instance로 시작합니다. 대신 예약 등록을 만든 run/request-group은 `originRunId`, `originRequestGroupId`로 lineage를 보존하고, 이 값은 delayed arm/fire 로그와 새 run의 초기 이벤트에 함께 반영됩니다.
- recurring schedule 등록 receipt도 이제 `scheduleId`, `targetSessionId`, `originRunId`, `originRequestGroupId`를 함께 가져가, 반복 스케줄 엔티티와 등록 태스크 lineage를 문자열 대신 구조화 결과로 연결합니다.
- 반복 스케줄의 실제 firing은 `scheduler` 쪽 typed lifecycle event에서 `scheduleRunId`, `targetSessionId`, `originRunId`, `originRequestGroupId`까지 함께 내보내고, intake bridge는 등록/취소 시점에 `schedule.created`, `schedule.cancelled` event를 추가로 내보냅니다. 따라서 `runs` 밖 모니터링에서도 등록 이벤트와 실행 이벤트를 `scheduleId` 축으로 연결하면서, 실패가 원 등록 run을 직접 덮어쓰지 않도록 분리할 수 있습니다.
- queue 구조 측면에서는 `runs/intake-queue.ts`가 `sessionId` 단위 explicit intake queue를, `runs/execution-queue.ts`가 `requestGroupId` 단위 explicit execution queue를, `runs/recovery-queue.ts`가 `runId` 단위 explicit recovery queue를, `scheduler/queueing.ts`가 `scheduleId` 단위 explicit schedule queue를 맡기 시작했습니다. `runs/run-queueing.ts`는 delayed session queue만 맡아 목적이 다른 직렬화 경계를 분리하는 방향으로 이어지고 있습니다.
- intake/execution/recovery queue는 대기, 실행 시작, 해제 시점에 `*_queue_waiting`, `*_queue_running`, `*_queue_released` run event를 남깁니다. queue tracing 실패는 실제 실행 흐름을 막지 않습니다.
- `start.ts`는 `prepareStartLaunch` 이후 `preflight_ms`를 run event로 남깁니다. Agent 실행 중에는 `prompt_ms`, `memory_total_ms`, `first_chunk_ms`가 기록되어 느린 구간을 timeline에서 확인할 수 있습니다.
- `preflight.ts`는 execution queue 진입 전의 빠른 실패 경계입니다. AI 연결 없음, 기본 모델 없음, Telegram/Slack 런타임 중지는 큐에 넣지 않고 실패 메시지를 채널에 직접 전달합니다. Yeonjang 필요 여부는 검증된 execution semantics가 없으면 `unknown`으로 유지하고, 명시적으로 Tool이 비활성화됐거나 검증된 non-Yeonjang semantics일 때만 `not_required`, 검증된 Yeonjang-bound semantics일 때만 `required`로 확정합니다.
- Yeonjang 실행 가능성은 UI/설정 화면에서 MQTT broker의 cached extension snapshot을 먼저 보여주고, 실제 도구 실행 직전에는 `canYeonjangHandleMethod()`가 `node.capabilities`를 다시 조회해 최종 판정합니다.
- direct Telegram schedule delivery는 이제 `scheduler/delivery-queue.ts`가 `targetChannel + targetSessionId` 기준으로 직렬화합니다. 즉 run delivery helper와 scheduler delivery queue가 서로 다른 목적 경계를 맡는 방향으로 정리 중입니다.
- 도구가 실제로 실행된 태스크는 가능하면 `preview` 문구보다 구조화된 액션 결과와 delivery receipt를 완료 근거로 우선 사용합니다.
- `completion-state.ts`는 completion을 `interpretationStatus`, `executionStatus`, `deliveryStatus`, `recoveryStatus`로 나눠 계산한 뒤, 이를 `request / execution / delivery / completion` checklist 상태로 다시 묶습니다. `completionSatisfied`는 이제 이 checklist의 필수 항목이 모두 완료되었는지로 판정합니다. 따라서 direct artifact delivery가 아직 안 끝났거나 follow-up/truncated recovery가 남았는데 review가 `complete`를 반환해도, `completion-flow.ts`는 checklist 기준으로 남은 항목을 먼저 보고 다시 복구 쪽을 우선 탑니다.
- `review-gate.ts`는 successful Tool evidence가 없는 direct artifact delivery가 이미 성공했고 receipt 기준 completion 4축 상태가 settled인 경우에만 completion review 호출을 생략합니다. successful Tool evidence가 있으면 LLM completion review가 실행 결과와 사용자 목표 충족 여부를 검증합니다.
- 카메라 캡처는 응답 acknowledgement가 아니라 저장된 이미지의 0보다 큰 크기와 허용된 image MIME post-check를 통과해야 성공 evidence가 됩니다. 실제 저장 경로는 artifact metadata 경계에만 두고, Tool·LLM·channel chunk에는 run/request-group에 결속된 opaque `artifact:<id>` ref와 MIME·크기만 전달합니다.
- capture 성공과 direct artifact delivery 결과는 completion review에 별도 operational evidence로 들어갑니다. delivery 실패는 `unsatisfied`로 유지해 LLM이 실제 완료 범위를 보고하게 하고, artifact 전송과 검토된 최종 텍스트 전송은 서로 다른 전달 단계와 중복 억제 키를 사용합니다.
- camera composition의 성공 baseline도 기존 `reviewTaskCompletion`, canonical completion descriptor와 root `completeRunWithAssistantMessage`를 우회하지 않습니다. verified capture와 current-chat delivery receipt가 LLM review의 bounded operational evidence가 되고, `ALL_CRITERIA_VERIFIED` 뒤 reviewed final-response receipt가 있는 root final text만 전달됩니다. 동일 finalization 재진입은 message-ledger commit으로 억제되어 capture, artifact delivery, LLM review와 final text를 반복하지 않습니다.
- camera artifact가 이미 검증된 뒤 delivery 승인이 거부·만료·취소되면 provider와 delivery receipt는 모두 0개로 유지됩니다. Telegram transport가 실패하면 provider 시도는 1개지만 committed delivery receipt와 final-success delivery는 0개입니다. 두 경우 모두 artifact metadata를 보존하고 동일 artifact/destination operation의 재호출은 기존 tool/message ledger dedupe가 provider 전에 막습니다.
- camera side-effect runtime은 Tool adapter가 허용한 bounded typed failure reason,
  terminal stage와 retry safety만 canonical result에 보존합니다. Yeonjang이
  `terminalStage=rejected`로 반환한 binding/authorization/params/method/resource
  거부는 effect receipt나 post-check를 만들지 않고 `RECORD_REJECTION`을 거쳐
  `EFFECT_REJECTED`로 닫습니다. 동일 operation 재개는 기존 rejection을 반환해
  승인과 remote capture를 반복하지 않습니다. effect 시작 뒤 command timeout처럼
  실행 여부를 확정할 수 없는 결과만 `MANUAL_INTERVENTION`으로 남고 LLM goal-success
  validation 후보로 승격하지 않습니다. raw command/target/path/error text는 operation
  receipt나 LLM evidence에 기록하지 않으며 binary/artifact post-check 실패도 delivery
  admission으로 넘어가지 않습니다.
- camera command request는 side-effect runtime이 소유한 immutable operation ID와 target
  fingerprint를 Yeonjang metadata까지 그대로 전달합니다. MQTT response observer는
  publish보다 먼저 설치되어 빠른 응답 손실을 막고, response 부재·helper watchdog·
  caller cancellation을 각각 bounded typed reason으로 보존합니다. caller cancellation은
  exact command/cancel-token/target-session에 결속된 원격 cancel command를 발행하고,
  Yeonjang은 실행 registry에서 일치한 helper process group만 종료합니다. execution
  reason은 artifact post-check와 delivery reason을 대신하지 않습니다.
- canonical camera operation을 실제로 실행할 때만 그 aggregate의 opaque operation ID와
  target fingerprint를 ToolContext의 읽기 전용 실행 스냅샷으로 Yeonjang command에
  전달합니다. MQTT/Rust의 versioned attempt는 이 결속과 command terminal stage를
  진단 evidence로 보존하지만 canonical work나 approval registry를 직접 쓰지 않으며,
  승인 소비·OS 권한·effect receipt·artifact 검증을 대체하지 않습니다.
- `allow_run`/`allow_once` decision authority는 DB `approval_registry` 하나입니다. decision은 registry metadata에 typed value로 보존되고 exact run/request-group/tool/authorization hash/agent scope의 compare-and-set acquire만 허용됩니다. consumed `allow_run`만 같은 exact scope에서 restart 뒤 재사용할 수 있고 consumed `allow_once`, 다른 params/target/agent와 만료된 row는 재사용하지 않습니다. dispatcher의 params-hash Map/Set 복사본은 제거했으며 memory에는 현재 callback을 깨우는 ephemeral waiter만 남습니다. side-effect Tool이 typed operation projector를 제공하면 approval registry, policy receipt와 side-effect identity가 같은 prepared binding을 사용하고, projector가 없는 Tool은 기존 raw params hash를 유지합니다. target fingerprint나 canonical payload는 Tool execute params, approval guidance와 normal log에 추가되지 않습니다.
- side-effect 승인은 migration 72의 `operation_id`, `operation_binding_hash`,
  `continuation_schema_version`에 prepared operation을 영속 결속합니다. migration
  73은 canonical aggregate의 `AWAITING_APPROVAL` 상태와 `approval` receipt kind를
  같은 SQLite 계약으로 추가합니다. `APPROVAL_REQUESTED`는 `EXECUTING`에서만,
  `APPROVAL_CONSUMED`와 `APPROVAL_DENIED_OR_EXPIRED`는
  `AWAITING_APPROVAL`에서만 적용됩니다.
- `approval-decision-command.ts`가 approval ID와 run 결속을 먼저 검증하고,
  decision 기록·단일 소비·canonical approval transition·version-1 resume command
  생성을 한 Application command로 묶습니다. Telegram/WebUI의 versioned approval
  callback은 전달 계층에 보관된 resolve closure보다 이 command를 호출하며, 중복,
  stale, wrong-run decision은 실행 waiter를 깨우지 않습니다.
- 승인 command는 consumed registry row에서 params·target·path가 없는 version-1
  approved-operation resume command를 만들고, 그 operation ID와 binding hash가
  현재 prepared operation과 일치할 때만 live 실행을 깨웁니다. process-local
  Promise는 타이머 정리와 알림 수단일 뿐 decision이나 continuation 원본이
  아닙니다. approval ID가 없는 구형 channel event만 compatibility callback을
  유지합니다.
- migration 74의 durable continuation queue는 이 resume command의 opaque identity만
  approval ID unique row로 enqueue합니다. consumer는 owner/lease CAS로 하나만
  claim하며 process가 사라지면 lease expiry 뒤 같은 row를 다시 claim할 수 있습니다.
  queue는 실행 params나 target을 복제하지 않고 approval registry와 side-effect
  aggregate의 exact binding 검증 결과만 운반합니다.
- live dispatcher도 approval callback의 queue row를 별도 process owner/lease로
  claim한 뒤에만 side effect ledger를 시작합니다. 성공, typed failure 또는
  manual-intervention처럼 Tool invocation이 반환되면 continuation을 completed로
  settle합니다. 다른 owner가 유효한 lease를 보유하면 effect를 시작하지 않으며,
  process crash로 settle되지 않은 claim만 lease expiry 뒤 recovery 대상이 됩니다.
- waiter가 없는 recovery consumer는 `toolName`과 typed adapter registry로만
  continuation을 분배합니다. camera adapter는 현재 runtime이 열거한 candidate를
  다시 project해 durable operation ID와 binding hash가 모두 같은 하나만 실행하며,
  일치 후보가 없거나 adapter가 없으면 새 LLM·새 승인·추정 target으로 우회하지 않고
  typed blocked 결과와 failed queue 상태를 남깁니다.
- production startup consumer는 MQTT/channel/API 준비 뒤 이 adapter를 실행합니다.
  현재 run/config/artifact context와 approval registry의 bounded target fingerprint로
  기존 policy와 side-effect ledger를 재사용합니다. Tool 결과가 실패이면
  continuation을 성공으로 닫지 않으며, exact target을 재구성할 수 없는 경우 effect
  실행 횟수 0으로 failed settle합니다.
- restart consumer의 verified ToolResult는 continuation을 완료하기 전에 원 assistant
  tool-use와 operation ID/binding hash를 다시 대조합니다. 같은 live 실행 경로의
  bounded ToolResult projector로 local path와 raw camera payload를 제거한 메시지를
  결정적 ID로 한 번 기록하고, opaque side-effect/artifact ref가 있는 canonical
  attempt receipt를 소비해 원 aggregate를 `RESULT_REVIEW`로 전이합니다. 중간 crash는
  같은 message/receipt를 재검증하며 새 run, 새 촬영 또는 새 승인을 만들지 않습니다.
- channel runtime은 recovered attempt가 `RESULT_REVIEW`에 도달하면 원 run ID,
  session, request-group과 channel delivery handler를 그대로 사용해 root-loop를
  `handoff` context로 재진입시킵니다. recovered attempt는 다시 execute하거나 새
  canonical attempt를 쓰지 않고 기존 post-execution delivery 검토로 들어가며,
  미완료 artifact delivery는 기존 recovery admission이 `RECOVERY_ACCEPTED ->
  POLICY_ALLOWED -> EXECUTION_STARTED`를 기록한 뒤 LLM Tool 실행으로 이어집니다.
- direct artifact delivery의 dedupe identity는 run/channel/path뿐 아니라 exact
  channel target도 포함합니다. 다른 chat/thread의 receipt는 현재 target 성공으로
  재사용하지 않으며, target이 있는 새 경로는 target 없는 legacy continuity
  문자열을 완료 근거로 사용하지 않습니다.
- recovered approved delivery가 실제 provider receipt를 만든 경우 canonical
  recovered attempt는 그 `SuccessfulFileDelivery`를 함께 복원합니다. 따라서
  post-execution pass는 delivery를 다시 실행하지 않고 기존 LLM completion review로
  진행합니다. 업로드 실패 뒤 전달한 fallback link는 text delivery일 뿐 direct
  artifact 성공이나 artifact receipt로 기록하지 않습니다.
- `PreparedSideEffectOperation`은 resolved target fingerprint, effect fingerprint와 한 번 계산된 operation binding hash를 immutable 값으로 묶습니다. `prepareSideEffectOperation`은 SQLite port를 통해 새 reserve, 기존 reserve, active, verified, compensated, manual-intervention을 closed result로 구분합니다. dispatcher는 capability/duplicate guard 뒤 이 admission을 승인 요청보다 먼저 수행하며, callback 이후 같은 prepared operation과 exact execution params를 side-effect runtime에 전달합니다. selector와 timeout 같은 입력 표현은 effect identity에 넣지 않습니다.
- 같은 canonical operation이 이미 `EFFECT_REJECTED` 또는 `MANUAL_INTERVENTION`이면 재시도는 상태 머신의 terminal aggregate와 opaque prior receipt ref를 반환하고 승인이나 remote effect를 다시 실행하지 않습니다. 전자는 effect 전 typed rejection이고 후자는 effect 시작 뒤 결과 불명 상태입니다. 이 bounded evidence는 LLM review/additional-input 경계로 돌아가며, 코드는 timeout/retry 횟수나 자연어 문자열로 자동 재촬영을 선택하지 않습니다.
- `terminal-outcome-policy.ts`는 terminal 상태 의미를 한곳에 고정합니다. `completion-application-pass.ts`는 이 정책을 통해 receipt 기준 completion state가 만족될 때만 `completed`로 닫고, `failure-application.ts`는 abort만 `cancelled`로 분류하며, `terminal-application.ts`는 `awaiting_user/stop`만 각각 `awaiting_user/cancelled`로 매핑합니다.
- canonical finalization의 `awaiting_user` 결과는 allowed resolution kind와 1~8개의 non-empty unique missing field를 가진 typed `inputRequirement`가 있을 때만 `INPUT_REQUIRED` event와 `waitingKind=user_input`을 기록합니다. operation conflict, adapter failure, generic reason/remaining text는 사용자 입력 증거로 승격하지 않습니다. receipt에는 raw question/value 대신 resolution kind와 missing-field fingerprint만 남깁니다. 이 값은 legacy run projection까지 전달되어 일반 사용자 입력 대기와 `waitingKind=approval` 승인 대기를 구분하며, 누락된 대기 종류를 추측해 보정하지 않습니다.
- completion-review LLM contract도 `ask_user`에 `input_resolution_kind`와 `missing_fields`를 필수로 요구합니다. shared Domain parser가 LLM JSON을 검증하고 completion flow/application이 같은 typed value를 finalization까지 전달합니다. `ask_user`가 아닌 결과는 두 필드가 생략되거나 각각 빈 문자열·빈 배열인 정식 contract 표현을 허용하지만 non-empty 값은 거부하며, 자연어 reason이나 오류 문자열에서 missing field를 추출하지 않습니다. 구조 실패 진단은 raw model output 없이 bounded reason과 글자 수만 Field Debug log에 남깁니다.
- 사용자가 선호한 method가 전체 capability snapshot에 없으면 특정 target mismatch로 오인하지 않습니다. exclusive method만 입력 요구로 닫고, non-exclusive preference는 빈 model-visible Tool scope를 유지한 채 LLM이 대체 경로 또는 exhaustion을 판단하게 합니다. 실행 scope에 식별자가 남아 있어도 runtime Tool projection은 실제 등록된 이름과 다시 교차해 미등록 Tool을 노출하지 않습니다.
- 성공한 Tool이 0개여도 canonical attempt receipt가 있으면 그 opaque evidence ref를 completion review의 operational evidence로 전달합니다. 다만 admitted execution에 required Tool이 있으면 attempt 설명문만으로 `complete`를 수락하지 않고 성공 Tool evidence 존재를 구조적으로 요구합니다. LLM이 다른 허용 경로가 없다고 판정하면 evidence-bound `PATHS_EXHAUSTED`로 전이하며, 설명문을 실행 성공으로 승격하지 않습니다.
- blocked/exhausted terminal report는 canonical facts의 정확한 포함 여부를 finalization 경계에서 검사합니다. verified blocker는 `RESULT_BLOCKED -> BLOCKED`, current-scope candidate exclusion이 완전한 경우만 `PATHS_EXHAUSTED -> EXHAUSTED`로 기록합니다. 첫 LLM 응답이 사실 필드를 누락하면 누락 field 이름과 그 exact required fragment만 포함한 structured feedback으로 한 번 다시 렌더링하고, 두 번째도 실패하면 run을 명시적 finalization failure로 닫고 전달을 막습니다. 원문 prompt나 모델 출력의 문자열 의미 비교로 terminal 상태를 바꾸지 않습니다.
- canonical plan policy는 등록된 승인형 Tool의 risk를 `approval_required`로 보존하되
  plan 단계의 synthetic 승인으로 실행 scope를 막지 않습니다. exact target과
  `PreparedSideEffectOperation`이 없는 계획 단계 승인은 실제 effect 권한이 아니며,
  사용자 승인은 dispatcher가 prepared operation을 reserve한 뒤 요청합니다.
- `requiresPrivilegedToolExecution`인 등록 Tool이 실패하거나 승인 안내문만 반환해도
  completion review는 이를 synthetic approval과 continuation LLM prompt로 승격하지
  않습니다. 같은 Tool의 실제 승인은 dispatcher의 DB registry-bound waiter에서
  동일 invocation을 재개합니다. synthetic approval은 dispatcher가 소유하지 않는
  legacy non-Tool worker 경계에만 남아 있으며 Tool capability admission이나 policy
  receipt의 권한 원본으로 사용되지 않습니다.
- completion review가 실패해도 권한 안내 문구만으로는 완료 근거로 보지 않고, 승인 요청이나 다른 복구 경로를 우선 탑니다.
- 승인 거부 사유가 `사용자 거부`인지 `시스템 타임아웃`인지 구분해서 취소 요약을 남기며, 타임아웃을 사용자 취소로 기록하지 않습니다.
- canonical approval의 거부·만료 전이는 receipt에 `approval_denied_or_expired` blocked terminal cause를 함께 기록합니다. terminal evidence reader는 이 persisted cause만 읽어 승인 실패를 복원하며, UI 문구나 process-local waiter 상태에서 원인을 재구성하지 않습니다.
- `completed`, `failed`, `cancelled`, `interrupted` 상태의 request-group은 새 요청에서 재사용하지 않고 새 태스크로 시작합니다.
- 다만 Telegram reply-to로 특정 태스크를 명시한 경우는 예외로, 종료된 request-group이어도 같은 태스크에 다시 붙여 이어갑니다.
- 참조형 문구라도 재사용 가능한 활성 후보가 없으면 clarification으로 보내지 않고 바로 새 태스크로 시작합니다.
- 파일 검증 보조 run은 최종 완료/실패를 확정하지 않고, 분석 결과만 부모 run에 전달한 뒤 `interrupted`로 정리합니다.
- Telegram에서 만들어진 반복 스케줄은 생성 시점의 `sessionId`를 함께 저장해, 이후 실행 결과를 같은 Telegram 대화로 다시 돌려보낼 수 있도록 합니다.
- 예약/알림 취소 문장은 일반 active run 취소와 섞이지 않도록 분리하고, schedule action 경로에서는 실제 스케줄 비활성화와 system scheduler 엔트리 제거까지 같이 처리합니다.
- 단순한 메신저 전달 예약(`"..." 라고 말해줘`)은 가능하면 채널 종류와 무관하게 AI 실행 없이 같은 채널로 직접 완료를 우선 시도하고, 직접 전달 정보를 만들 수 없을 때만 일반 예약 실행으로 폴백합니다.
- AI/worker/execution 복구 프롬프트는 현재 실패 프롬프트를 다시 감싸지 않고 `originalUserRequest`만 기준으로 재구성해, 복구가 반복될수록 프롬프트가 자기 자신을 누적해서 비대해지는 현상을 줄입니다.
- 작업이 멈추거나, 너무 빨리 끝나거나, 복구 신호가 이상하면 우선 이 폴더부터 보는 것이 맞습니다.
