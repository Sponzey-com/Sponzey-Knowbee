# source.md

## 역할

- Telegram 연동은 채팅과 thread 메시지를 Knowbee의 session과 request group으로 매핑합니다.

## 주요 파일

- `bot.ts`: 수신 메시지 처리, session 결정, reply 기반 태스크 연결, run 시작
- `chunk-delivery.ts`: Telegram chunk 텍스트 누적, tool status, 파일 전달, 최종 텍스트 전달 receipt 처리
- `message-delivery.ts`: Telegram 텍스트/receipt/file 전송 primitive
- `responder.ts`: target(chat/thread) 바인딩과 primitive 호출
- `approval-handler.ts`: 승인 처리와 활성 채팅 바인딩
- `file-handler.ts`: Telegram 파일 다운로드 파이프라인
- `session.ts`: session key와 session ID 매핑

## 메모

- 이 폴더는 “답장(reply)이 같은 태스크를 이어간다”는 동작을 책임집니다.
- Telegram은 이제 메시지를 받으면 공통 ingress receipt를 먼저 보내고, 실제 intake/실행은 그 뒤 `run`으로 계속 진행합니다.
- Telegram 메시지 핸들러는 더 이상 run 완료까지 await 하지 않고, ingress 시작 후 채널 점유를 빨리 끝낸 뒤 후속 청크와 완료 정리는 비동기로 이어갑니다.
- reply-to로 들어온 메시지는 답장 대상 태스크가 이미 완료/실패/취소 상태여도, 새 일반 태스크로 만들지 않고 같은 `request_group`에 다시 붙여 이어갑니다.
- Telegram 전송 성공이 실제 완료로 이어지려면 `runs` 쪽 완료 판정과도 맞물려야 합니다.
- 반복 스케줄이나 지연 실행처럼 실시간 채팅 컨텍스트가 없는 경우에도, 세션 ID만 알면 다시 같은 Telegram 대화로 텍스트를 보낼 수 있어야 합니다.
- Telegram bot의 long polling 시작은 완료 Promise가 길게 유지될 수 있으므로, 런타임 활성 등록은 polling 완료를 기다리지 않고 먼저 이뤄져야 scheduler가 `telegram channel is not running`으로 오판하지 않습니다.
- 승인 요청 메시지는 전송 실패로 곧바로 `deny`가 되지 않도록, Telegram 쪽에서는 Markdown 의존을 최소화한 안전한 plain text 전송 경로를 유지하는 것이 맞습니다.
- Telegram 승인 타임아웃은 사용자 거부와 구분해서 `approval.resolved.reason = "timeout"`으로 전달해야 하며, UI와 run 요약도 그 차이를 그대로 보여주는 것이 맞습니다.
- 파일 전달 완료는 도구 출력 문자열을 다시 파싱해서 추론하지 않고, Telegram 채널이 실제 `sendFile()`을 끝낸 뒤 반환하는 구조화된 전달 receipt를 기준으로 `runs` 쪽이 판단해야 합니다.
- Telegram chunk 처리도 `bot.ts` 본문에서 바로 하지 않고 `chunk-delivery.ts` helper를 통해 텍스트/파일/tool status를 구조화된 delivery receipt로 올리는 쪽으로 분리하고 있습니다.
- Telegram 최종 텍스트, receipt, file 전송 primitive도 `message-delivery.ts`로 분리해, `responder.ts`가 텍스트 분할과 파일 전송 세부 구현까지 직접 들고 있지 않도록 정리하고 있습니다.
- 파일 전달과 최종 텍스트 전달 순서도 chunk helper 테스트로 고정해, artifact가 먼저 나가고 텍스트가 뒤따르는 delivery 순서를 보장하는 방향으로 정리하고 있습니다.
- versioned 승인 요청은 Telegram message identity와 승인 가능한 사용자 ID의
  SHA-256 fingerprint를 approval registry에 결속합니다. Gateway restart로
  `pending` Map이 사라져도 callback의 exact chat/thread/message/actor binding이
  requested row와 일치하면 durable approval command를 호출합니다. raw Telegram
  user ID는 approval row에 저장하지 않으며, wrong actor/message와 legacy unbound
  row는 자동 승인하지 않습니다.
- Telegram artifact upload의 성공은 `sendFile` provider receipt가 있을 때만
  `artifactDeliveries`와 durable artifact receipt로 기록합니다. 업로드 실패 뒤
  같은 대화에 보낸 다운로드 링크는 `textDeliveries` fallback으로만 남아 direct
  photo delivery 성공을 대체하지 않습니다.
- restart delivery handler도 session의 durable `source_id`에서 동일 chat/thread를
  복원합니다. 승인 continuation의 target fingerprint와 이 session binding이
  일치하지 않으면 provider 호출 전에 중단합니다.
