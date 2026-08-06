# source.md

## 역할

- `scripts`는 개발, 로컬 실행, 패키징 보조 스크립트를 담습니다.

## 현재 중심 스크립트

- Knowbee 로컬 실행/정지 스크립트
- macOS용 Yeonjang 빌드/시작/종료 스크립트
- Linux용 Yeonjang 빌드/시작/종료 스크립트
- Linux용 Yeonjang headless managed 시작/종료 스크립트
- Windows용 Yeonjang 빌드/시작/종료 배치 스크립트
- 패키징과 릴리스 실행 스크립트
- installer platform/Node/Yeonjang 공통 packaging identity는 `lib/installer-platforms.mjs`에 두며 상세 경계는 `lib/source.md`를 따른다.
- `prepare-installer-inputs.mjs`는 pinned Node keyring/GPG 검증과 package receipt를 묶고, `build-installer-bundle.mjs`는 native runner의 private Node/application을 executable archive로 만듭니다.
- `compose-installer-release.mjs`의 `prepare`는 unsigned manifest v2만 쓰며 `finalize`는 candidate-bound native/dry-run/rollback evidence가 모두 통과한 경우에만 publishable bootstrap을 씁니다. `collect-installer-release-assets.mjs`는 workflow artifact를 다시 hash하며 `rewrite-installer-application-package.mjs`는 candidate-local tarball만 install input으로 허용합니다.
- `inspect-installer-native.mjs`는 unsigned manifest로 native verifier가 추출한 macOS/Windows exact stage의 header target과 verifier digest를 검사합니다. `inspect-installer-linux-native.mjs`는 같은 binding에 Linux ABI floor를 추가합니다.
- `compose-installer-native-evidence.mjs`는 다섯 native attestation을 `unsigned_origin_unverified`, candidate, bundle SHA-256, verifier SHA-256에 다시 결속해 원자적으로 `platform-evidence.json`을 씁니다.
- `build-yeonjang-macos.sh`는 공개 installer 하한과 동일하게 Rust/Swift/app bundle의 macOS deployment target을 13.5로 고정합니다.
- `compose-installer-clean-machine-evidence.mjs`는 독립 native runner가 만든 exact 다섯 closed-schema receipt만 candidate/native artifact에 결속해 dry-run과 rollback matrix evidence로 집계합니다. 각 receipt는 `unsigned_origin_unverified`와 OS 경고의 실제 관찰·확인을 기록해야 합니다.
- `collect-installer-finalized-assets.mjs`는 finalizer의 exact 14개 unsigned 공개 자산을 size/SHA-256 inventory로 고정하고 stable promotion 전에 다시 검증합니다.
- `check-installer-release-readiness.mjs`는 GitHub-hosted clean-machine Actions를 전제로 protected environment의 `required_reviewers` 규칙과 exact prerelease를 read-only로 확인해 release 시작 전 missing boundary를 typed result로 출력합니다.

## 자체 검증 스크립트

- 감사, 수집, smoke, rehearsal, verify처럼 프로젝트가 자체 검증에 사용하는 스크립트는 `scripts/self/`에 둡니다.
- 자체 검증 스크립트 전용 모듈은 `scripts/self/lib/`에 둡니다.
- 사용자와 운영자가 직접 사용하는 시작, 중지, 빌드, 상태, 패키징 진입점은 `scripts/` 루트에 둡니다.

## 메모

- 이 스크립트들은 운영 편의 도구이지 제품의 핵심 런타임 자체는 아닙니다.
- 시작 방식이 바뀌면 실제 패키지 진입점과 스크립트가 서로 어긋나지 않게 맞춰야 합니다.
- Gateway 시작은 nohup과 명시적 launchctl opt-in 모두에서 같은 startup-captured 로그 목적과
  Field Debug 만료 시각을 전달해야 합니다. 유효한 Field Debug 만료 시각만 지정되고 목적이
  비어 있으면 시작 스크립트가 해당 finite lease 동안에만 `debug` 목적을 명시해 진단을 숨기지 않습니다.
- Knowbee와 Yeonjang 모두 재시작 흐름은 별도 restart 스크립트보다 `start-* --restart` 진입점으로 모읍니다.
- 로컬 Gateway/WebUI 제어는 bash 스크립트를 기준으로 하고, Windows 네이티브 배치는 현재 Yeonjang runtime 관리에 집중합니다.
- Yeonjang GUI 시작 스크립트는 `desktop_interactive`를 tray-first lifecycle로 안내해야 하며, startup hidden / close-to-tray / explicit quit 원칙을 함께 표시합니다.
- Linux 스크립트는 desktop GUI 경로와 `headless_managed` 경로를 분리해서 안내해야 합니다.
- Windows 배치 스크립트는 `cargo`가 설치된 guest/실기 환경에서 바로 실행하는 용도입니다.
- Yeonjang 시작 스크립트의 PID 파일은 운영자가 `--restart`할 때만 쓰는 투영 정보입니다. 일반 시작은 기록된 PID를 종료·교체하거나 로그를 지우지 않고, binary의 고정 OS-runtime lease가 중복 실행 결과를 결정하도록 둡니다. `--restart`와 macOS의 명시적 번들 교체만 기록된 PID를 대상으로 종료할 수 있으며, PID 파일이 없다는 이유로 프로세스를 탐색·종료하지 않습니다. macOS GUI launcher는 `open` 뒤의 process scan 대신 서명된 bundle executable을 직접 시작해 정확한 child PID를 기록합니다.
