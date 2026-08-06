# scripts/lib source index

## 역할

- 여러 운영·패키징 진입점이 함께 사용하는 I/O 없는 release configuration을 둡니다.
- 실행 가능한 사용자 진입점은 두지 않으며, raw environment나 credential을 읽지 않습니다.

## 현재 파일

- `installer-platforms.mjs`: installer가 지원하는 다섯 native target, pinned Node runtime/ABI, Node archive 이름과 optional Yeonjang package identity의 단일 소스입니다.
- `installer-bundle-plan.mjs`: 검증된 Node/npm/Yeonjang file receipt를 package version과 exact target에 결속해 정렬된 platform bundle input plan을 만듭니다.
- `node-release-input.mjs`: 외부 trusted GPG verifier가 승인한 exact SHASUMS/signature bytes만 파싱하고, path-contained regular non-symlink Node archive를 열린 handle에서 streaming hash해 bundle plan receipt로 변환합니다.
- `installer-archive.mjs`: bundle input을 열린 handle에서 다시 hash하며 deterministic tar.gz/ZIP32로 쓰고, 완성된 임시 archive만 기존 출력을 덮어쓰지 않는 atomic link로 publish합니다. 다섯 artifact receipt는 canonical raw manifest v2 candidate로 변환합니다.
- `installer-bootstrap-render.mjs`: POSIX/PowerShell installer template에 다섯 target verifier digest만 release-time에 fail-closed로 고정합니다.
- `installer-options.mjs`: 두 bootstrap의 default/automation/offline/effect profile 의미와 duplicate/conflict gate의 I/O 없는 기준 계약입니다.
- `installer-bundle-layout.mjs`: materialized application과 exact private Node를 same-version/ABI로 검증하고 no-symlink runtime layout, symlink-resolving private-runtime launcher, Windows detached uninstall handoff와 inventory를 조립합니다.
- `installer-input-preparation.mjs`: 외부 GPG 검증을 통과한 Node archive receipts와 exact npm/Yeonjang tarball bytes를 한 candidate input set으로 묶고 다섯 target plan을 원자적으로 기록합니다.
- `installer-release-composition.mjs`: 다섯 bundle manifest를 v2 unsigned candidate로 만들고, verifier digest·bundle-bound native platform evidence·dry-run·rollback이 같은 candidate일 때만 두 bootstrap을 render합니다.
- `installer-native-files.mjs`: no-symlink stage를 순회하고 Mach-O/ELF/PE target header 및 opened-file SHA-256 identity를 검사합니다.
- `installer-native-evidence.mjs`: candidate·artifact·verifier가 일치하는 다섯 `unsigned_origin_unverified` native attestation과 Linux ABI 상한을 하나의 fail-closed platform gate로 합성합니다.
- `installer-native-cli.mjs`: native evidence CLI의 exact option과 bounded no-symlink JSON input 공통 경계를 제공합니다.
- `installer-clean-machine-evidence.mjs`: GitHub-hosted clean-machine matrix가 낸 다섯 actual receipt의 closed schema, one-shot interaction budget, user-goal post-check와 candidate/artifact 결속을 검증합니다.
- `installer-finalized-assets.mjs`: final publish set의 exact 14개 unsigned flat regular file 이름, size와 SHA-256을 수집하고 prerelease/stable 경계에서 byte drift를 차단합니다.
- `installer-release-readiness.mjs`: GitHub-hosted clean-machine Actions를 전제로 required protected environment의 `required_reviewers` 규칙과 exact prerelease를 closed readiness result로 판정하며 clean-machine 성공을 대체하지 않습니다.
- `installer-release-readiness-cli.mjs`: read-only GitHub query를 readiness policy의 입력으로 제한하고, query 예외나 누락 응답을 release-ready로 해석하지 않습니다.
- `installer-transaction-store.mjs`: 분리 state root의 exclusive lock owner와 canonical transaction snapshot을 소유합니다. live PID는 차단하고 confirmed-dead lock만 atomic rename으로 reclaim하며, closed snapshot의 same operation/contiguous revision만 fsync temp+atomic rename으로 저장합니다.

## 외부 release source

- Node v24.18.0 archive 이름과 SHA-256은 `https://nodejs.org/dist/v24.18.0/SHASUMS256.txt`의 exact 항목을 pin합니다. Node patch를 바꿀 때는 signed SHASUMS 검증 rehearsal과 다섯 target archive 존재를 먼저 확인합니다.

## 변경 규칙

- target을 추가·삭제하면 manifest contract, npm staging, native release workflow와 clean-machine matrix를 같은 변경에서 동기화합니다.
- Node patch/ABI 변경은 공식 archive 존재와 checksum source를 확인하고 모든 profile을 함께 갱신합니다.
- bundle plan은 file receipt를 직접 생성하지 않습니다. filesystem/download adapter가 exact size와 digest를 검증한 receipt만 전달해야 합니다.
- GPG public keyring은 manifest나 SHASUMS에서 가져오지 않습니다. release composition root가 별도로 검증·고정한 keyring verifier를 주입하며, key rotation은 release gate와 rehearsal을 거칩니다.
- streaming receipt 뒤 archive writer로 넘길 때는 같은 열린 handle을 이어받거나 다시 size/digest를 검증해야 합니다. receipt만으로 이후 path가 같은 bytes라고 가정하지 않습니다.
- archive writer는 receipt 후 path를 다시 열지만, 복사 중 exact size/digest를 검증하고 완성 전 출력은 random temporary name에만 둡니다. 실패·취소 시 temporary output을 삭제하며 final output이 이미 있으면 덮어쓰지 않습니다.
- executable release archive는 opaque payload writer가 아니라 `writeInstallerFilesystemBundle`을 사용해 조립된 layout 전체를 정렬·rehash하며 기록하고 declared entrypoint 존재/mode를 gate합니다.
- 현재 Windows bundle은 ZIP32이므로 단일 entry와 전체 offset이 4GiB를 넘는 구성은 fail closed 합니다. 향후 ZIP64 전환은 installer 양쪽 compatibility test가 필요합니다.
- Knowbee installer에는 private signing key, certificate, detached manifest signature 또는 signer identity를 두지 않습니다. Node supplier GPG keyring은 별도 release-input boundary에만 남깁니다.
- transaction lock에는 raw operation ID 대신 hash만 저장합니다. malformed owner나 process-liveness 판정 오류는 stale로 추정하지 않고 fail closed하며, release 시 자신이 소유한 exact owner file/empty lock directory만 제거합니다.

## 검증

- `pnpm exec vitest run --cache=false tests/task003-installer-platform-packaging.test.ts`
- `pnpm exec vitest run --cache=false tests/task004-installer-bundle-plan.test.ts`
- `pnpm exec vitest run --cache=false tests/task005-node-release-input.test.ts`
- `pnpm exec vitest run --cache=false tests/task006-installer-archive.test.ts`
- `pnpm exec vitest run --cache=false tests/task010-installer-transaction-store.test.ts`
- `pnpm exec vitest run --cache=false tests/task019-installer-input-preparation.test.ts tests/task019-installer-release-composition.test.ts`
