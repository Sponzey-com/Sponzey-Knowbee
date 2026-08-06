# release source index

## 역할

- 릴리스 패키지, 설치·복구 evidence, 공개 릴리스 gate의 순수 계약을 소유합니다.
- 네트워크, 파일시스템, 프로세스와 OS 조회는 이 경계 밖 adapter가 수행하고, 이 디렉터리는 검증된 스냅샷과 외부 payload를 닫힌 결과로 변환합니다.

## 현재 설치기 계약

- `installer-contract.ts`: legacy signed v1과 unsigned v2 manifest의 closed parser, macOS/Linux/Windows native host profile별 artifact 선택 규칙을 소유합니다. unsigned caller는 v2만 사용해 v1을 묵시적으로 수용하지 않습니다.
- `installer-integrity.ts`: unsigned v2 raw manifest의 closed schema와 candidate SHA-256 identity를 검증하되, 그 hash가 publisher identity를 증명하지 않음을 `unsigned_origin_unverified`로 투영합니다. artifact의 exact size와 SHA-256은 activation 전에 검증합니다.
- `installer-health.ts`: unauthenticated local health가 raw state path 대신 release version과 SHA-256 state-directory fingerprint만 투영하게 합니다.
- `installer-transaction.ts`: exact operation/target/revision/event ID에 결속된 one-shot install lifecycle의 단일 reducer, durable snapshot parser와 restart recovery action을 소유합니다. service/health 성공 evidence와 명시적 no-service/no-start policy evidence를 구분하며, activation 이후 실패·취소는 rollback 완료 전 terminal이 될 수 없습니다.
- `installer-preflight.ts`: bootstrap이 한 번 캡처한 supported target/path/prerequisite/disk/interaction snapshot으로 Unix XDG·Windows LocalAppData layout과 command=1/confirmation<=1/follow-up=0 action budget을 만듭니다.
- `npm-install-receipt.ts`: canonical npm package 집합의 clean-install evidence를 생성하고 검증합니다.
- `package.ts`: 기존 release package manifest와 readiness 자료를 구성합니다.

## 변경 규칙

- manifest, receipt, artifact schema 변경은 양방향 호환성, rollback과 release gate를 함께 정의하고 테스트합니다.
- installer manifest의 target과 Node ABI는 `scripts/lib/installer-platforms.mjs`의 실제 packaging inventory와 5-target 회귀 테스트로 정렬합니다.
- 외부 `unknown` 값은 versioned closed schema로 파싱하며 raw payload, secret, process environment를 receipt나 로그에 포함하지 않습니다.
- OS 탐지, 서명 검증, 다운로드, 압축 해제, 서비스 등록은 목적별 adapter에 두고 이 경계에 숨은 I/O를 추가하지 않습니다.
- TypeScript만 수정하고 colocated `.js`, `.d.ts`, `.map`은 `pnpm run core:sync-src-artifacts`로 생성합니다.

## 검증

- 설치 manifest/host contract: `pnpm exec vitest run --cache=false tests/task001-installer-manifest-contract.test.ts`
- 설치 legacy/signature 및 unsigned artifact integrity: `pnpm exec vitest run --cache=false tests/task002-installer-integrity.test.ts tests/task024-unsigned-installer-manifest.test.ts`
- 설치 transaction/restart recovery: `pnpm exec vitest run --cache=false tests/task008-installer-transaction.test.ts`
- 설치 OS layout/one-action preflight: `pnpm exec vitest run --cache=false tests/task009-installer-preflight.test.ts`
- core typecheck: `pnpm --filter @knowbee/core typecheck`
- generated consistency: `pnpm run test:architecture:generated`
