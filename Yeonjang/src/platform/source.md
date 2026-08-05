# source.md

## 역할

- `platform`은 OS별 자동화 backend를 제공합니다.

## 주요 파일

- `macos.rs`: 화면/카메라/입력 자동화와 system control이 구현된 주 경로
- `windows.rs`: 명령 실행, 앱 실행, 카메라 list/capture, 화면 캡처, 마우스/키보드, 로컬 system control 구현
- `linux.rs`: 외부 도구 기반의 앱 실행, 카메라, 화면 캡처, 마우스/키보드, 로컬 system control 구현
- `shared.rs`: OS backend 사이에서 공통으로 쓰는 보조 함수
- `mod.rs`: backend 선택. 테스트 빌드에서는 Windows의 순수 helper/DTO 계약도 현재
  host에서 컴파일해 target 전용 소스의 부식을 조기에 검출

## 메모

- capability 사용 가능 여부는 OS 지원 여부와 현재 권한 설정에 함께 의존합니다.
- 새 장치/시스템 기능은 추상화 정의 뒤에 보통 이 폴더 구현이 따라와야 합니다.
- macOS 카메라 캡처는 이제 임시 Swift 스크립트가 아니라 앱 번들 안의 고정 helper executable 경로를 사용합니다.
- macOS 카메라 권한 상태 조회는 같은 bundled helper의 read-only `--permission-status` 경로를 사용하고 AVFoundation 권한 요청이나 사진 촬영을 시작하지 않습니다.
- macOS 카메라 촬영 helper의 `AVCaptureDevice.requestAccess`는 common Application 경로가
  exact camera operation에 결속된 permission-requestable preflight receipt를 검증하고
  execute를 호출한 뒤에만 도달합니다. Helper는 OS 동의 UI와 촬영만 수행하며 Knowbee
  승인, 재시도 또는 workflow 상태를 판단하지 않습니다.
- direct MQTT v2 permission read는 composition 시 backend availability를 한 번
  snapshot한 공통 observer를 사용합니다. Query 시 camera의 기존 read-only status와
  screen의 non-prompting preflight만 관측하며, unavailable native observation은
  허용으로 만들지 않고 `not_observed`로 닫습니다. Observer는 capture helper 실행,
  OS consent request와 policy write를 소유하지 않습니다.
- macOS 카메라 helper는 request의 operation budget을 전체 권한·촬영 deadline으로 사용합니다. Rust watchdog은 operation budget에 2초 cleanup grace를 파생하며 제한시간에는 프로세스 그룹 전체를 종료하고 회수합니다.
- macOS 화면 helper는 capture 중 `CGPreflightScreenCaptureAccess`만 호출하며
  `CGRequestScreenCaptureAccess`로 OS prompt를 열지 않습니다. 권한이 이미 부여되지
  않았으면 stable exit 10으로 즉시 끝납니다.
- Rust macOS adapter는 화면 helper의 permission, launch, non-zero exit와 protocol
  failure를 typed `ScreenCaptureProcessError`로 반환합니다. stderr/stdout 내용이나
  경로 문자열로 원인을 분류하거나 public failure에 전달하지 않습니다.
- macOS `system.control`은 로컬 lock, sleep, logout, restart, shutdown을 처리합니다.
- Windows 카메라 캡처도 이제 `Yeonjang --camera-capture-helper` 고정 경로를
  사용합니다. 명시적 device id는 WinRT `MediaCapture`, device id 생략은 Windows
  camera UI fallback이라는 서로 다른 계약이며 host-side unit test가 이를 고정합니다.
  Helper process는 bound camera budget과 cancellation을 적용하는 공통 scoped owner가
  stdout/stderr를 제한해 drain하고 종료·timeout·cancel 시 process tree를 회수합니다.
- Windows native helper에는 Rust canonical path의 `\\?\` local/UNC prefix를 제거한
  Win32-compatible output path만 전달합니다. 변환 뒤 259 UTF-16 unit을 넘는 camera와
  screen output은 helper를 시작하기 전에 closed typed failure로 반환합니다. 이
  정규화는 OS adapter boundary에만 있으며 Application artifact identity를 다시 만들지
  않습니다.
- Windows `camera.list`는 WinRT video capture device id를 우선 노출해서 `camera.capture(device_id=...)`와 같은 id 축을 씁니다.
- Windows `system.control`은 로컬 lock, sleep, hibernate, sign-out, restart, shutdown을 처리합니다.
- Linux backend는 OS API 직접 바인딩이 아니라 설치된 도구를 이용하는 경로입니다.
  camera/screen 실행 가능성은 adapter composition 때 한 번 관측한 불변 capture
  runtime snapshot으로 판정하며 작업 도중 환경을 다시 해석하지 않습니다.
- Linux `camera.list`는 `v4l2-ctl`과 `/dev/video*`를 사용하고, `camera.capture`는
  `ffmpeg` 또는 `fswebcam`을 사용합니다. camera capability는 도구와 실제
  `/dev/video*` 관측이 모두 있어야 ready입니다. Capture process는 Windows와 같은
  bounded owner를 사용해 timeout/cancellation을 적용하며 native output을 public
  failure로 전달하지 않습니다.
- Linux `screen.capture`는 Wayland에서 `grim`/`gnome-screenshot`, X11에서
  `gnome-screenshot`/`scrot`/ImageMagick `import` 중 세션과 호환되는 도구만
  선택합니다. 알 수 없는 세션이나 세션 비호환 도구만 있으면 광고하지 않습니다.
  display index 선택은 아직 미지원이며 effect 전에 typed invalid request로 닫힙니다.
- Linux 마우스/키보드 입력은 `xdotool`에 의존합니다.
- Linux `system.control`은 `loginctl`, `systemctl`, `xdg-screensaver`, `gnome-session-quit`, `shutdown` 중 사용 가능한 도구로 로컬 lock, sleep, hibernate, logout, restart, shutdown을 처리합니다.
