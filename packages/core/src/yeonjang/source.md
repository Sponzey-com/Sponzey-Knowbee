# source.md

## 목적과 경계

`yeonjang`은 Gateway Infrastructure 계층의 MQTT 외부 인터페이스입니다. 기존 registry와
canonical side-effect identity를 사용하며 Rust Yeonjang producer, 승인 판단, 사용자 완료
판정을 소유하지 않습니다.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `mqtt-client.ts` | v1 compatibility 또는 signed v2 requester transport 선택과 호출 생명주기 | MQTT 연결·발행·구독·취소; v2 관측 후 v1 fallback 금지; signed terminal의 pre-effect OS 실패를 camera/screen Tool 계약으로 투영하고, terminal waiter는 만료된 Field Debug에 category·latency만 남김 |
| `mqtt-v2-contract.ts` | v2 enrollment, topic, HMAC, status/capability, command wire 계약 | 외부 payload 검증·서명; 의미 판단 없음 |
| `mqtt-v2-permission.ts` | signed `capture.permission.get` query와 response admission | exact requester/instance/session/fingerprint/operation identity 및 HMAC을 검증하는 read-only permission projection; 촬영·selector·OS prompt 없음 |
| `mqtt-v2-target.ts` | 단일 online instance/session/fingerprint target 해석 | read-only registry projection 입력 |
| `mqtt-v2-response.ts` | exact signed terminal 검증 | MQTT PUBACK을 완료로 인정하지 않음; 새 artifact의 lifecycle revision `0`을 fetch 전 CAS 기준으로 허용 |
| `mqtt-v2-response-ack.ts` | application response ack와 ack-result 검증 | terminal identity·revision·digest 결속 |
| `mqtt-v2-artifact.ts` | YAC2 chunk 조립, fetch/ack/cancel 및 signed fetch-rejection admission 계약 | bounded memory, chunk·full digest 사후 검증; exact owner/request/operation/target/revision/HMAC에 결속된 rejection만 수용 |
| `mqtt-v2-cancel.ts` | active command cancellation 생성 | 원 operation/target/cancel token에 결속 |
| `mqtt-v2-registry-adapter.ts` | 검증된 v2 관측을 registry writer DTO로 변환 | persistence write는 기존 registry가 소유 |
| `topology.ts` | durable registry와 transient MQTT snapshot을 exact identity로 단일 fleet view에 병합 | instance/session/node 식별 순서로 중복 대상을 만들지 않음 |
| `command-attempt.ts` | v1 command-attempt evidence 검증 | transport/handler/helper failure를 typed projection으로 변환 |

큰 binary 결과는 검증된 artifact로 조립한 뒤 전달 경계로 넘깁니다. raw topic, payload,
path와 secret은 evidence나 Product Log에 포함하지 않습니다.

terminal dispatch/waiter와 artifact fetch/waiter의 Field Debug는 request identity의 짧은 SHA-256 hash,
closed boundary category, bounded candidate/chunk count, outcome과 latency만 기록합니다. artifact waiter는
`completed`, `timeout`, `cancelled`, `transport_failure`, `rejected`를 구분하고 raw MQTT
topic·payload·artifact·path를 기록하지 않으며, bootstrap deadline이 지나면 emit하지 않습니다.
같은 requester response route의 `yeonjang.artifact-fetch-result.v2`는 해당 fetch request와
artifact owner/transfer/revision 및 HMAC이 모두 일치할 때만 waiter를 즉시 종결합니다. Admitted
producer rejection은 이미 닫힌 fetch이므로 별도 artifact cancel을 만들지 않으며, invalid 또는
unrelated response는 성공이나 canonical failure로 승격하지 않습니다.

signed v2 terminal의 `stage`, `reason_code`, `effect_state`, `retry_safety`는 사용자 문구를
해석하지 않고 closed mapping으로 command-attempt 계약에 투영합니다. 특히 카메라의
`permission_not_determined + not_started + local_action_required`는
`camera_permission_not_determined + rejected + change_strategy`이며, 실행된 효과나 추가
Telegram 승인으로 오인하지 않습니다. 화면 캡처의 `permission_denied + not_started`는
`screen_permission_denied + rejected + change_strategy`로 투영합니다. 따라서 MQTT 연결,
사용자 승인, OS 권한, 실제 효과 실행을 서로 대체하지 않습니다.

artifact descriptor는 Rust producer의 versioned `schemaVersion` camelCase DTO이며,
`lifecycleRevision`은 non-negative durable CAS revision입니다. Yeonjang은 등록 직후 `0`을
발행하고, Gateway는 그 exact 값으로 첫 fetch를 보내 `0 → 1` 전이를 요청합니다. 따라서
`schemaVersion: 1`과 revision `0`은 malformed terminal이 아니며, 성공 terminal을 artifact
fetch 전에 버리거나 lifecycle revision을 재구성하지 않습니다.

v2 capability 광고에 없는 `camera.permission_status`는 기존 Yeonjang `control` 계약의
읽기 전용 permission query로만 구현합니다. camera capture의 LLM-selected recovery scope에는
동일한 exact target의 이 진단 Tool만 companion으로 넣을 수 있으며, capture parameter·approval
scope·다른 device Tool을 확장하지 않습니다.
