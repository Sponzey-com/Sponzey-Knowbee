#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
YEONJANG_DIR="$ROOT_DIR/Yeonjang"
MANIFEST_PATH="$YEONJANG_DIR/Cargo.toml"
BINARY_NAME="knowbee-yeonjang"
APP_NAME="Yeonjang"
PROFILE="${YEONJANG_PROFILE:-release}"
TARGET_TRIPLE="${YEONJANG_TARGET_TRIPLE:-}"
MACOS_DEPLOYMENT_TARGET="13.5"
MACOS_INFO_PLIST="$YEONJANG_DIR/manifests/macos/Info.plist"
MACOS_ENTITLEMENTS="$YEONJANG_DIR/manifests/macos/Yeonjang.entitlements"
CAMERA_HELPER_SWIFT="$YEONJANG_DIR/helpers/macos/camera_capture_helper.swift"
CAMERA_HELPER_BINARY_NAME="yeonjang-camera-helper"
KNOWBEE_ICON_PNG="$ROOT_DIR/resource/knowbee-1-128.png"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "이 스크립트는 macOS 전용입니다."
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo 를 찾을 수 없습니다. Rust 도구체인을 먼저 설치하세요."
  exit 1
fi

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "Yeonjang Cargo.toml 을 찾을 수 없습니다: $MANIFEST_PATH"
  exit 1
fi

if [[ ! -f "$MACOS_INFO_PLIST" ]]; then
  echo "macOS Info.plist 를 찾을 수 없습니다: $MACOS_INFO_PLIST"
  exit 1
fi

if [[ ! -f "$CAMERA_HELPER_SWIFT" ]]; then
  echo "macOS 카메라 helper Swift 소스를 찾을 수 없습니다: $CAMERA_HELPER_SWIFT"
  exit 1
fi

if [[ ! -f "$KNOWBEE_ICON_PNG" ]]; then
  echo "Knowbee 아이콘 리소스를 찾을 수 없습니다: $KNOWBEE_ICON_PNG"
  exit 1
fi

BUILD_CMD=(cargo build --manifest-path "$MANIFEST_PATH")
if [[ "$PROFILE" == "release" ]]; then
  BUILD_CMD+=(--release)
fi
if [[ -n "$TARGET_TRIPLE" ]]; then
  BUILD_CMD+=(--target "$TARGET_TRIPLE")
fi

case "${TARGET_TRIPLE:-$(uname -m)}" in
  aarch64-apple-darwin|arm64)
    SWIFT_TARGET="arm64-apple-macosx$MACOS_DEPLOYMENT_TARGET"
    ;;
  x86_64-apple-darwin|x86_64)
    SWIFT_TARGET="x86_64-apple-macosx$MACOS_DEPLOYMENT_TARGET"
    ;;
  *)
    echo "지원하지 않는 macOS build architecture입니다."
    exit 1
    ;;
esac

echo "Yeonjang macOS 바이너리를 빌드합니다..."
(
  cd "$ROOT_DIR"
  MACOSX_DEPLOYMENT_TARGET="$MACOS_DEPLOYMENT_TARGET" "${BUILD_CMD[@]}"
)

if [[ -n "$TARGET_TRIPLE" ]]; then
  BINARY_PATH="$YEONJANG_DIR/target/$TARGET_TRIPLE/$PROFILE/$BINARY_NAME"
else
  BINARY_PATH="$YEONJANG_DIR/target/$PROFILE/$BINARY_NAME"
fi

if [[ ! -x "$BINARY_PATH" ]]; then
  echo "빌드는 끝났지만 실행 파일을 찾지 못했습니다: $BINARY_PATH"
  exit 1
fi

if [[ -n "$TARGET_TRIPLE" ]]; then
  APP_BUNDLE_PATH="$YEONJANG_DIR/target/$TARGET_TRIPLE/$PROFILE/$APP_NAME.app"
else
  APP_BUNDLE_PATH="$YEONJANG_DIR/target/$PROFILE/$APP_NAME.app"
fi

APP_CONTENTS="$APP_BUNDLE_PATH/Contents"
APP_MACOS_DIR="$APP_CONTENTS/MacOS"
APP_RESOURCES_DIR="$APP_CONTENTS/Resources"
APP_BINARY_PATH="$APP_MACOS_DIR/$APP_NAME"
CAMERA_HELPER_BINARY_PATH="$APP_MACOS_DIR/$CAMERA_HELPER_BINARY_NAME"

rm -rf "$APP_BUNDLE_PATH"
mkdir -p "$APP_MACOS_DIR" "$APP_RESOURCES_DIR"
cp "$MACOS_INFO_PLIST" "$APP_CONTENTS/Info.plist"
cp "$BINARY_PATH" "$APP_BINARY_PATH"
chmod +x "$APP_BINARY_PATH"
"$APP_BINARY_PATH" --write-icon "$APP_RESOURCES_DIR/YeonjangIcon.png"

echo "macOS 카메라 helper를 빌드합니다..."
MACOSX_DEPLOYMENT_TARGET="$MACOS_DEPLOYMENT_TARGET" \
  xcrun swiftc -O -target "$SWIFT_TARGET" -o "$CAMERA_HELPER_BINARY_PATH" "$CAMERA_HELPER_SWIFT"
chmod +x "$CAMERA_HELPER_BINARY_PATH"

echo "Yeonjang signing mode: unsigned (publisher identity is not cryptographically authenticated)"

echo "빌드 완료:"
echo "  Binary : $BINARY_PATH"
echo "  App    : $APP_BUNDLE_PATH"
echo "  Helper : $CAMERA_HELPER_BINARY_PATH"
