# source.md

## 역할

- `agent`는 실제 시스템 프롬프트를 구성하고 메인 AI 루프를 실행합니다.

## 주요 파일

- `index.ts`: `runAgent()` 구현, 시스템 프롬프트 로딩, 도구 라운드, 복구 신호 처리
- `intake.ts`: 본 실행 전 요청 분류와 intake 분석
- `intake-prompt.ts`: intake 프롬프트 구조와 정책
- `request-normalizer.ts`: 원문 요청을 intake 전에 영문 중심 실행 문장으로 정규화
- `completion-review.ts`: 작업이 실제로 끝났는지 판정
- `request-group-context.ts`: request-group 범위에 맞는 문맥만 추림
- `profile-context.ts`: 사용자 기본정보를 프롬프트 문맥에 주입

## 메모

- 이 폴더는 프롬프트 정책과 실제 실행을 잇는 경계입니다.
- 너무 빨리 완료되거나, 쓸데없이 묻거나, 잘못 라우팅되는 문제는 여기서 시작되는 경우가 많습니다.
- `runAgent()`의 `tool_end`는 출력 텍스트만이 아니라 구조화된 `details`도 함께 넘겨, 이후 `runs`와 채널 계층이 문자열 재해석 없이 액션 결과를 사용할 수 있어야 합니다.
- ingress 단계의 즉시 접수 응답은 `agent`가 아니라 `runs/ingress.ts`와 각 채널 진입점이 맡고, `agent/intake`는 그 뒤 자연어 해석과 구조화에 집중합니다.
- request-group 재사용 여부나 활성 실행 취소처럼 intake 전에 결정되는 진입 해석은 이제 `runs/entry-semantics.ts`로 옮겨, `agent/intake`는 자연어 해석과 구조화에 더 가깝게 유지합니다.
- intake heuristic은 이제 `/`로 시작하는 명령어에만 적용됩니다.
- 자연어 요청은 영문화/정규화 이후에도 heuristic으로 처리하지 않고, 가능하면 intake AI으로 보냅니다.
- 예약/알림 관리 문장은 한국어뿐 아니라 `schedule`, `reminder`, `notification`, `alarm` 같은 영어 표현도 같은 경로로 해석합니다.
- intake는 이제 원문 메시지를 바로 분류하지 않고, 먼저 `request-normalizer.ts`에서 영문 중심 실행 문장으로 정규화한 뒤 그 결과를 기준으로 heuristic과 AI 분석을 진행합니다.
- 영어 상대시간 예약도 slash command 안에 있을 때만 `in 5 seconds`, `5 sec later`, `10 mins later` 같은 축약 표현을 deterministic heuristic으로 처리합니다.
- intake 프롬프트는 이제 `execution.execution_semantics`를 포함해, 파일 변경 여부, 권한 작업 여부, 직접 결과 전달 여부, 승인 대상 도구를 구조화해서 넘기도록 확장되었습니다.
- intake 결과는 이제 `structured_request`를 포함하며, `source_language`, `normalized_english`, `[target]`, `[to]`, `[context]`, `[complete-condition]`에 해당하는 구조를 heuristic 경로와 AI 경로 모두에서 공통으로 만듭니다.
- 이 구조화 결과는 다시 `intent_envelope`로 고정되어, 후속 실행 쪽은 `intent_type`, `destination`, `schedule_spec`, `execution_semantics`, `delivery_mode`, `requires_approval`, `preferred_target`를 하나의 표준 계약으로 받습니다.
- `intent_envelope` 생성 전에는 `structured_request` 필수 필드를 한 번 더 검증하고, 비어 있으면 fallback 규칙으로 보정합니다. 보정이 일어난 경우 `notes`에 `intent-envelope-repaired:...`가 남고, 정상 검증이 끝나면 `intent-envelope-validated`가 기록됩니다.
- `to`와 delivery 관련 context는 가능하면 `current channel` 같은 모호한 값 대신 실제 채널/세션/Telegram chat/thread/extension id를 사용하도록 보강되었습니다.
- 예약 발화 요청은 메신저 언급이 없어도 `"..."이라고 해줘` 형태를 literal text 전달로 해석해, 구조화 요청문 목표와 목적지가 분리되도록 보강되었습니다.
- 이 literal delivery 분류는 `"안녕이라고 해줘"`처럼 `해줘/해 주세요` 형태까지 포함해야 하며, 이 패턴을 놓치면 지연 예약이 direct completion이 아니라 일반 AI 실행 경로로 빠집니다.
- 상대시간 예약이 literal delivery로 해석되면 `followup_run_payload`에 `literal_text`와 `destination`도 같이 넣어, 후속 실행이 task 문자열 재해석 없이 정확한 문구와 전달 대상을 그대로 사용할 수 있게 했습니다.
- AI 오류 사유 분류는 `403`, `forbidden`, `Cloudflare challenge` 같은 접근 차단 신호를 `context size`보다 먼저 잡아, 인증/접근 차단 오류를 컨텍스트 초과로 잘못 요약하지 않도록 보정했습니다.
- 단순 확인, 개수 확인, 상태 요약, 일반 보고 결과는 현재 채널의 일반 텍스트로 전달해야 하며, 임시 `.txt/.md/.json/.csv/.pdf` 문서를 만들어 `telegram_send_file`로 보내지 않도록 시스템 프롬프트에 규칙을 추가했습니다.
- 일반 대화 실행은 전체 prompt registry를 그대로 합치지 않고 `execution` profile의 공통 실행 정책만 조립합니다. completion review와 final response source는 각 전용 LLM 단계가 소유하며 일반 실행 prompt에 중복 삽입하지 않습니다. 전체 assembly는 관리·진단 경계에서 계속 사용할 수 있습니다.
- 정상 웹 실행 경로는 메인 LLM의 계획에 따라 discovery search를 최대 한 번 수행하고, 검색 근거가 충분하면 바로 답하거나 검증된 검색 결과 중 선택한 URL을 선택적으로 직접 fetch한 뒤 같은 메인 LLM이 답을 구성합니다. 하네스는 최초 필수 검색만 강제하며 검색 뒤 무도구 답변을 폐기해 fetch를 강제하지 않습니다. 웹 도구 payload의 schema와 출처 연결은 코드가 검증하고, 의미적 충분성과 다음 행동은 canonical completion review가 판정합니다.
- 정상 채널 경로에 source selection, chunk selection, compression, 별도 web review 같은 내부 LLM 단계를 추가하지 않습니다. 실패 증거가 있으면 기존 전략을 그대로 반복하지 않고 completion/recovery 경계에서 다른 허용 방법을 선택합니다.
- intake의 `preferred_methods`와 `exclusive_methods`는 사용자 수준의 방법 제약이며 내부 실행 단계의 완전한 목록이 아닙니다. 제약된 메서드가 하나의 명시적이고 활성화된 Skill binding에 속하면, harness는 의미 추론 없이 그 binding 안의 안전하고 사용 가능한 companion Tool을 같은 실행 범위로 투영합니다. 다른 Skill bundle로는 확장하지 않습니다.
- 웹 실행 trace는 개별 후보 실패를 보존하되, schema와 provenance가 검증된 검색 결과 또는 fetch 문서 근거가 확보되면 evidence verification을 완료 상태로 기록합니다. 일부 후보의 실패만으로 전체 사용자 목표를 실패로 투영하지 않습니다.
- 공개 문서 fetch는 응답을 4MB로 제한하고 모델에 투영하는 Markdown은 20,000자로 계속 제한합니다. 대형 금융 페이지를 기존 1MB 상한에서 즉시 거절해 여러 URL을 소모하던 지연을 줄이면서 네트워크·콘텐츠·출처 검증 경계는 유지합니다.
- 실행 LLM의 한 turn은 canonical next-action admission을 거쳐 Tool 0개(`response_only`) 또는 정확히 1개(`execute_tool`)만 허용합니다. 여러 Tool use가 들어오면 아무 Tool도 dispatch하지 않고 구조화 repair evidence를 같은 LLM에 돌려줍니다.
- 검증된 fetch가 완료되면 `WebExecutionState.validatedEvidence.status = "available"`을 다음 completion/recovery pass로 전달합니다. 이 상태는 사용자 목표 완료가 아니라 검증된 근거의 존재만 뜻합니다. completion review가 `response_only`를 선택한 follow-up은 다음 실행 Tool 정책을 `forbidden`으로 결속해 Tool definitions와 dispatch를 모두 비활성화하고 기존 근거로 최종 답변을 작성합니다. 빈 required-Tool 목록은 제한 없음과 Tool 금지를 구분하는 정책으로 사용하지 않습니다. 반대로 review가 changed-strategy Tool follow-up을 선택하면 정책은 `required`와 정확한 Tool 이름을 보존하며, 완료 상태여도 그 첫 required `web_fetch`는 허용하되 이후에는 다시 선택 사항으로 닫습니다.
- `response_only` follow-up의 canonical identity는 자연어 prompt, summary 또는 reason이 아니라 전체 completion evidence revision으로 구성합니다. 같은 evidence revision에서 한 번 승인된 response-only를 문구만 바꿔 다시 제안하면 review contract repair로 되돌리고, LLM이 complete, blocked, ask_user 또는 새 Tool/target 전이를 선택하게 합니다. 새 Tool 결과로 evidence revision이 바뀌면 response-only를 다시 선택할 수 있습니다.
- completion review의 이전 assistant 결과 context는 최근 3개, 각 1,200자로 제한합니다. 현재 run의 completion condition, provenance/freshness evidence ref와 structured review receipt는 이 history 제한과 별도로 유지합니다. review 출력은 4,096 tokens, repair에 재투영하는 이전 raw model text는 6,000자로 제한하며 이 제한만으로 사용자 목표 실패를 만들지 않습니다.
- completion review의 English prompt와 validator는 complete 결과의 모든 applicable criterion 및 expected condition이 exact allowlisted evidence ref를 인용한다는 같은 계약을 사용합니다. intake schema repair는 raw model 문구가 아니라 typed invalid contract class와 allowlisted validation issue로 식별합니다. 모델용 message schema에는 내부 `failed_receipt`를 노출하지 않고, parser도 invalid category/mode를 다른 의미로 보정하지 않습니다. repair LLM에 bounded issue를 한 번 전달한 뒤 다시 invalid이면 상위 진단에 `response_invalid`로 반환합니다.
- LLM intake가 `execution.needs_web=true`를 반환했고 사용자가 별도 method를 지정하지 않았다면 canonical policy는 `web_search`를 첫 실행 method로 평가합니다. intake bridge는 사용 가능한 모든 Tool을 필수 목록으로 복사하지 않고 policy가 승인한 첫 method만 required Tool로 전달하며, 활성 web Skill binding의 `web_fetch`만 companion Tool로 같은 run scope에 투영합니다.
- required Tool이 있는 실행은 신뢰 가능한 성공 Tool evidence가 하나도 없으면 completion review의 `complete`를 수락하지 않습니다. 이는 결과 의미를 코드가 대신 판정하는 규칙이 아니라, LLM이 선택한 실행 계약과 evidence envelope가 일치하는지 검사하는 harness 규칙입니다. 누락 시 bounded reason code로 한 번 repair하고 LLM이 follow-up, blocked, paths_exhausted 또는 추가 입력 상태를 다시 선택하게 합니다.
- completion review의 `blocked`와 `paths_exhausted`는 서로 다른 terminal 계약입니다. `blocked`는 allowlisted blocker evidence와 materially different alternative 평가 evidence를 요구하고, `paths_exhausted`는 evaluated alternative refs와 정확히 일치하는 current-scope candidate exclusion refs를 요구합니다. retry count, timeout 또는 한 번의 실패만으로 어느 상태도 만들지 않습니다.
- intake의 method 제약은 소문자로 시작하는 최대 128자의 stable capability identifier만 허용합니다. 자연어 설명이나 실행 지시는 method 배열이 아니라 goal/context/constraints에 둡니다. `target_instance`는 사용자가 최신 요청에서 정확한 대상을 지정한 경우에만 식별자를 기록하고, 그 외에는 `null`을 허용합니다. 이 계약 위반은 문자열 의미 보정 없이 bounded typed issue로 한 번 LLM repair합니다.
- 30초 first-response 값은 사용자 가시 진행 응답을 측정하는 예산이며 intake LLM 취소 시간이 아닙니다. intake provider 호출은 별도의 60초 안전 상한을 사용하므로 30초 지점에서 정상 진단을 강제 취소하지 않습니다.
- 모델 intake의 canonical category는 `direct_answer`, `task_intake`, `schedule_request`, `clarification` 네 가지뿐입니다. 안전·정책·capability 판단이 필요한 actionable 요청은 intake에서 reject나 `failed_receipt`로 끝내지 않고 `task_intake`로 downstream 진단에 넘깁니다. `failed_receipt`는 deterministic/provider failure 전달 경계에만 남습니다.
- execution decision의 `ask_user`와 `boundary_failure`를 같은 대기 상태로 합치지 않습니다. 실제 누락 입력이 있는 `ask_user`만 사용자 입력을 기다리고, `fail_with_reason`에서 온 boundary failure는 기존 근거와 reason을 LLM 실행·completion review에 넘겨 허용된 대안 또는 검증된 terminal report를 선택하게 합니다.
- 응답 지연은 exact run/request-group에 결속된 `task_intake`, `execution_decision`, `tool_transport`, `completion_review`, `final_response`, `delivery` stage로 투영합니다. 누락 stage와 가장 긴 두 stage는 bounded reason code와 opaque evidence ref만 노출하며 raw prompt, Tool payload, target과 모델 응답은 포함하지 않습니다.
- 일반 reply는 completion review 뒤 finalizer가 전달하므로, 검토 시점의 미전달 상태만으로 같은 답안을 다시 생성하지 않습니다. LLM이 구조화한 모든 비전달 criterion과 completion condition이 충족되고 delivery criterion만 남은 `response_only` 판정은 Application 경계에서 완료로 정규화하며, 직접 artifact 또는 명시적 외부 채널 전달은 이 규칙에서 제외합니다.
