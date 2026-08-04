//! Pure, bounded post-check for camera and screen image artifacts.
//!
//! A helper/process exit is not completion evidence. These functions validate
//! the exact expected image kind and derive immutable metadata from the bytes
//! that later delivery must preserve.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MAX_CAPTURE_ARTIFACT_BYTES: usize = 64 * 1024 * 1024;
const MAX_CAPTURE_DIMENSION: u32 = 65_535;
const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureArtifactKind {
    CameraJpeg,
    ScreenPng,
}

impl CaptureArtifactKind {
    pub(crate) fn file_name(self) -> &'static str {
        match self {
            Self::CameraJpeg => "capture.jpg",
            Self::ScreenPng => "capture.png",
        }
    }

    pub(crate) fn scope(self) -> &'static [u8] {
        match self {
            Self::CameraJpeg => b"camera",
            Self::ScreenPng => b"screen",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureImageFormat {
    Jpeg,
    Png,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureArtifactMetadata {
    kind: CaptureArtifactKind,
    format: CaptureImageFormat,
    width: u32,
    height: u32,
    size_bytes: u64,
    sha256_digest: String,
}

impl CaptureArtifactMetadata {
    pub fn kind(&self) -> CaptureArtifactKind {
        self.kind
    }

    pub fn format(&self) -> CaptureImageFormat {
        self.format
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn size_bytes(&self) -> u64 {
        self.size_bytes
    }

    pub fn sha256_digest(&self) -> &str {
        &self.sha256_digest
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapturePostCheckError {
    Empty,
    TooLarge,
    WrongFormat,
    Truncated,
    InvalidDimensions,
}

pub fn post_check_capture_bytes(
    kind: CaptureArtifactKind,
    bytes: &[u8],
) -> Result<CaptureArtifactMetadata, CapturePostCheckError> {
    if bytes.is_empty() {
        return Err(CapturePostCheckError::Empty);
    }
    if bytes.len() > MAX_CAPTURE_ARTIFACT_BYTES {
        return Err(CapturePostCheckError::TooLarge);
    }
    let (format, width, height) = match kind {
        CaptureArtifactKind::CameraJpeg => {
            let (width, height) = jpeg_dimensions(bytes)?;
            (CaptureImageFormat::Jpeg, width, height)
        }
        CaptureArtifactKind::ScreenPng => {
            let (width, height) = png_dimensions(bytes)?;
            (CaptureImageFormat::Png, width, height)
        }
    };
    validate_dimensions(width, height)?;
    let mut digest = Sha256::new();
    digest.update(bytes);
    Ok(CaptureArtifactMetadata {
        kind,
        format,
        width,
        height,
        size_bytes: bytes.len() as u64,
        sha256_digest: format!("sha256:{:x}", digest.finalize()),
    })
}

fn png_dimensions(bytes: &[u8]) -> Result<(u32, u32), CapturePostCheckError> {
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err(CapturePostCheckError::WrongFormat);
    }
    let mut cursor = PNG_SIGNATURE.len();
    let mut dimensions = None;
    let mut saw_end = false;
    while cursor < bytes.len() {
        if bytes.len() - cursor < 12 {
            return Err(CapturePostCheckError::Truncated);
        }
        let length = u32::from_be_bytes(
            bytes[cursor..cursor + 4]
                .try_into()
                .expect("four-byte chunk length"),
        ) as usize;
        let chunk_type = &bytes[cursor + 4..cursor + 8];
        let data_start = cursor + 8;
        let data_end = data_start
            .checked_add(length)
            .ok_or(CapturePostCheckError::TooLarge)?;
        let chunk_end = data_end
            .checked_add(4)
            .ok_or(CapturePostCheckError::TooLarge)?;
        if chunk_end > bytes.len() {
            return Err(CapturePostCheckError::Truncated);
        }
        if dimensions.is_none() {
            if cursor != PNG_SIGNATURE.len() || chunk_type != b"IHDR" || length != 13 {
                return Err(CapturePostCheckError::WrongFormat);
            }
            let width = u32::from_be_bytes(
                bytes[data_start..data_start + 4]
                    .try_into()
                    .expect("IHDR width"),
            );
            let height = u32::from_be_bytes(
                bytes[data_start + 4..data_start + 8]
                    .try_into()
                    .expect("IHDR height"),
            );
            dimensions = Some((width, height));
        }
        cursor = chunk_end;
        if chunk_type == b"IEND" {
            if length != 0 || cursor != bytes.len() {
                return Err(CapturePostCheckError::WrongFormat);
            }
            saw_end = true;
            break;
        }
    }
    if !saw_end {
        return Err(CapturePostCheckError::Truncated);
    }
    dimensions.ok_or(CapturePostCheckError::InvalidDimensions)
}

fn jpeg_dimensions(bytes: &[u8]) -> Result<(u32, u32), CapturePostCheckError> {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return Err(CapturePostCheckError::WrongFormat);
    }
    let mut cursor = 2;
    let mut dimensions = None;
    let mut saw_end = false;
    while cursor < bytes.len() {
        if bytes[cursor] != 0xff {
            return Err(CapturePostCheckError::Truncated);
        }
        while cursor < bytes.len() && bytes[cursor] == 0xff {
            cursor += 1;
        }
        let marker = *bytes.get(cursor).ok_or(CapturePostCheckError::Truncated)?;
        cursor += 1;
        if marker == 0xd9 {
            saw_end = true;
            break;
        }
        if marker == 0xd8 || marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            continue;
        }
        if marker == 0xda {
            saw_end = bytes[cursor..]
                .windows(2)
                .any(|window| window == [0xff, 0xd9]);
            break;
        }
        let length_bytes = bytes
            .get(cursor..cursor + 2)
            .ok_or(CapturePostCheckError::Truncated)?;
        let length = u16::from_be_bytes(
            length_bytes
                .try_into()
                .expect("two-byte JPEG segment length"),
        ) as usize;
        if length < 2 {
            return Err(CapturePostCheckError::WrongFormat);
        }
        let segment_end = cursor
            .checked_add(length)
            .ok_or(CapturePostCheckError::TooLarge)?;
        if segment_end > bytes.len() {
            return Err(CapturePostCheckError::Truncated);
        }
        if is_start_of_frame(marker) {
            if length < 8 {
                return Err(CapturePostCheckError::Truncated);
            }
            let height = u16::from_be_bytes([bytes[cursor + 3], bytes[cursor + 4]]) as u32;
            let width = u16::from_be_bytes([bytes[cursor + 5], bytes[cursor + 6]]) as u32;
            dimensions = Some((width, height));
        }
        cursor = segment_end;
    }
    if !saw_end {
        return Err(CapturePostCheckError::Truncated);
    }
    dimensions.ok_or(CapturePostCheckError::InvalidDimensions)
}

fn is_start_of_frame(marker: u8) -> bool {
    matches!(
        marker,
        0xc0 | 0xc1 | 0xc2 | 0xc3 | 0xc5 | 0xc6 | 0xc7 | 0xc9 | 0xca | 0xcb | 0xcd | 0xce | 0xcf
    )
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), CapturePostCheckError> {
    if width == 0 || height == 0 || width > MAX_CAPTURE_DIMENSION || height > MAX_CAPTURE_DIMENSION
    {
        return Err(CapturePostCheckError::InvalidDimensions);
    }
    Ok(())
}
