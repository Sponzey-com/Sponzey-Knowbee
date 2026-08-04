//! Bounded artifact chunk values and a strict reference consumer assembler.
//!
//! Raw payload exists only in `ArtifactChunk`; its `Debug` implementation is
//! redacted. Lifecycle persistence, normal responses, and product logs carry
//! only the exact header identities and digests.

use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::artifact_lifecycle::{ArtifactBinding, ArtifactLifecycle, ArtifactLifecycleState};

const ARTIFACT_CHUNK_SCHEMA_VERSION: u16 = 1;
const MAX_CHUNK_PAYLOAD_BYTES: usize = 256 * 1024;
const MAX_CHUNK_COUNT: u32 = 65_536;
const MAX_IDENTITY_BYTES: usize = 256;
const ARTIFACT_CHUNK_FRAME_MAGIC: &[u8; 4] = b"YAC2";
const MAX_CHUNK_HEADER_BYTES: usize = 65_536;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ArtifactChunkConfig {
    payload_bytes: usize,
}

impl ArtifactChunkConfig {
    pub fn new(payload_bytes: usize) -> Result<Self, ArtifactChunkError> {
        if !(1..=MAX_CHUNK_PAYLOAD_BYTES).contains(&payload_bytes) {
            return Err(ArtifactChunkError::InvalidConfig);
        }
        Ok(Self { payload_bytes })
    }

    pub fn chunk_count(self, total_size: u64) -> Result<u32, ArtifactChunkError> {
        let total_size =
            usize::try_from(total_size).map_err(|_| ArtifactChunkError::TooManyChunks)?;
        let count = total_size.div_ceil(self.payload_bytes);
        let count = u32::try_from(count).map_err(|_| ArtifactChunkError::TooManyChunks)?;
        if count == 0 || count > MAX_CHUNK_COUNT {
            return Err(ArtifactChunkError::TooManyChunks);
        }
        Ok(count)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactChunkHeader {
    schema_version: u16,
    transfer_id: String,
    artifact_ref: String,
    owner_requester_id: String,
    owner_request_id: String,
    index: u32,
    count: u32,
    offset: u64,
    chunk_size: u32,
    total_size: u64,
    payload_digest: String,
    full_digest: String,
    expires_at_ms: i64,
}

impl ArtifactChunkHeader {
    pub fn transfer_id(&self) -> &str {
        &self.transfer_id
    }

    pub fn artifact_ref(&self) -> &str {
        &self.artifact_ref
    }

    pub fn owner_requester_id(&self) -> &str {
        &self.owner_requester_id
    }

    pub fn owner_request_id(&self) -> &str {
        &self.owner_request_id
    }

    pub fn index(&self) -> u32 {
        self.index
    }

    pub fn count(&self) -> u32 {
        self.count
    }

    pub fn offset(&self) -> u64 {
        self.offset
    }

    pub fn chunk_size(&self) -> u32 {
        self.chunk_size
    }

    pub fn total_size(&self) -> u64 {
        self.total_size
    }

    pub fn payload_digest(&self) -> &str {
        &self.payload_digest
    }

    pub fn full_digest(&self) -> &str {
        &self.full_digest
    }

    pub fn expires_at_ms(&self) -> i64 {
        self.expires_at_ms
    }

    fn validate(&self) -> Result<(), ArtifactChunkError> {
        let end = self
            .offset
            .checked_add(u64::from(self.chunk_size))
            .ok_or(ArtifactChunkError::InvalidHeader)?;
        if self.schema_version != ARTIFACT_CHUNK_SCHEMA_VERSION
            || !is_identity(&self.transfer_id)
            || !is_artifact_ref(&self.artifact_ref)
            || !is_identity(&self.owner_requester_id)
            || !is_identity(&self.owner_request_id)
            || self.count == 0
            || self.count > MAX_CHUNK_COUNT
            || self.index >= self.count
            || self.chunk_size == 0
            || self.chunk_size as usize > MAX_CHUNK_PAYLOAD_BYTES
            || self.total_size == 0
            || end > self.total_size
            || (self.index == 0 && self.offset != 0)
            || !is_sha256_digest(&self.payload_digest)
            || !is_sha256_digest(&self.full_digest)
            || self.expires_at_ms <= 0
        {
            return Err(ArtifactChunkError::InvalidHeader);
        }
        Ok(())
    }
}

#[derive(Clone, PartialEq, Eq)]
pub struct ArtifactChunk {
    header: ArtifactChunkHeader,
    payload: Vec<u8>,
}

impl ArtifactChunk {
    pub fn from_untrusted(
        header: ArtifactChunkHeader,
        payload: Vec<u8>,
    ) -> Result<Self, ArtifactChunkError> {
        header.validate()?;
        if payload.len() != header.chunk_size as usize {
            return Err(ArtifactChunkError::InvalidPayloadSize);
        }
        if digest(&payload) != header.payload_digest {
            return Err(ArtifactChunkError::PayloadDigestMismatch);
        }
        Ok(Self { header, payload })
    }

    pub fn header(&self) -> &ArtifactChunkHeader {
        &self.header
    }

    pub fn payload(&self) -> &[u8] {
        &self.payload
    }

    pub fn into_parts(self) -> (ArtifactChunkHeader, Vec<u8>) {
        (self.header, self.payload)
    }
}

impl fmt::Debug for ArtifactChunk {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ArtifactChunk")
            .field("header", &self.header)
            .field("payload", &"[REDACTED]")
            .finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactChunkError {
    InvalidConfig,
    InvalidLifecycle,
    InvalidFrame,
    InvalidHeader,
    InvalidPayloadSize,
    PayloadDigestMismatch,
    FullDigestMismatch,
    WrongBinding,
    WrongTransfer,
    DuplicateMismatch,
    MissingChunks,
    Overlap,
    Expired,
    TooManyChunks,
}

/// Encodes `YAC2 | header-length-u32 | strict JSON header | raw bytes`.
///
/// Raw bytes are never base64 encoded into a normal response or copied into
/// the persisted header.
pub fn encode_artifact_chunk_frame(chunk: &ArtifactChunk) -> Result<Vec<u8>, ArtifactChunkError> {
    chunk.header.validate()?;
    if chunk.payload.len() != chunk.header.chunk_size as usize
        || chunk.payload.len() > MAX_CHUNK_PAYLOAD_BYTES
    {
        return Err(ArtifactChunkError::InvalidPayloadSize);
    }
    let header =
        serde_json::to_vec(&chunk.header).map_err(|_| ArtifactChunkError::InvalidHeader)?;
    if header.is_empty() || header.len() > MAX_CHUNK_HEADER_BYTES {
        return Err(ArtifactChunkError::InvalidHeader);
    }
    let header_length =
        u32::try_from(header.len()).map_err(|_| ArtifactChunkError::InvalidHeader)?;
    let capacity = ARTIFACT_CHUNK_FRAME_MAGIC
        .len()
        .checked_add(4)
        .and_then(|length| length.checked_add(header.len()))
        .and_then(|length| length.checked_add(chunk.payload.len()))
        .ok_or(ArtifactChunkError::InvalidFrame)?;
    let mut frame = Vec::with_capacity(capacity);
    frame.extend_from_slice(ARTIFACT_CHUNK_FRAME_MAGIC);
    frame.extend_from_slice(&header_length.to_be_bytes());
    frame.extend_from_slice(&header);
    frame.extend_from_slice(&chunk.payload);
    Ok(frame)
}

/// Parses an untrusted MQTT payload and rechecks all size and digest
/// invariants before exposing the chunk to the reference assembler.
pub fn decode_artifact_chunk_frame(frame: &[u8]) -> Result<ArtifactChunk, ArtifactChunkError> {
    if frame.len() < 9 || frame.get(..4) != Some(ARTIFACT_CHUNK_FRAME_MAGIC.as_slice()) {
        return Err(ArtifactChunkError::InvalidFrame);
    }
    let length_bytes: [u8; 4] = frame
        .get(4..8)
        .and_then(|value| value.try_into().ok())
        .ok_or(ArtifactChunkError::InvalidFrame)?;
    let header_length = u32::from_be_bytes(length_bytes) as usize;
    if header_length == 0 || header_length > MAX_CHUNK_HEADER_BYTES {
        return Err(ArtifactChunkError::InvalidFrame);
    }
    let payload_offset = 8_usize
        .checked_add(header_length)
        .ok_or(ArtifactChunkError::InvalidFrame)?;
    let header_bytes = frame
        .get(8..payload_offset)
        .ok_or(ArtifactChunkError::InvalidFrame)?;
    let payload = frame
        .get(payload_offset..)
        .ok_or(ArtifactChunkError::InvalidFrame)?;
    if payload.is_empty() || payload.len() > MAX_CHUNK_PAYLOAD_BYTES {
        return Err(ArtifactChunkError::InvalidFrame);
    }
    let header = serde_json::from_slice::<ArtifactChunkHeader>(header_bytes)
        .map_err(|_| ArtifactChunkError::InvalidHeader)?;
    ArtifactChunk::from_untrusted(header, payload.to_vec())
}

pub fn build_artifact_chunks(
    lifecycle: &ArtifactLifecycle,
    bytes: &[u8],
    now_ms: i64,
    config: ArtifactChunkConfig,
) -> Result<Vec<ArtifactChunk>, ArtifactChunkError> {
    let ArtifactLifecycleState::Fetching {
        transfer_id,
        chunk_count,
        ..
    } = lifecycle.state()
    else {
        return Err(ArtifactChunkError::InvalidLifecycle);
    };
    let binding = lifecycle.binding();
    if now_ms <= 0 || now_ms >= binding.expires_at_ms() {
        return Err(ArtifactChunkError::Expired);
    }
    if bytes.len() as u64 != binding.total_size() {
        return Err(ArtifactChunkError::FullDigestMismatch);
    }
    if digest(bytes) != binding.full_digest() {
        return Err(ArtifactChunkError::FullDigestMismatch);
    }
    let count = config.chunk_count(bytes.len() as u64)?;
    if count != *chunk_count {
        return Err(ArtifactChunkError::InvalidLifecycle);
    }

    bytes
        .chunks(config.payload_bytes)
        .enumerate()
        .map(|(index, payload)| {
            let index = u32::try_from(index).map_err(|_| ArtifactChunkError::TooManyChunks)?;
            let offset = u64::from(index)
                .checked_mul(config.payload_bytes as u64)
                .ok_or(ArtifactChunkError::InvalidHeader)?;
            ArtifactChunk::from_untrusted(
                ArtifactChunkHeader {
                    schema_version: ARTIFACT_CHUNK_SCHEMA_VERSION,
                    transfer_id: transfer_id.clone(),
                    artifact_ref: binding.artifact_ref().to_string(),
                    owner_requester_id: binding.owner_requester_id().to_string(),
                    owner_request_id: binding.owner_request_id().to_string(),
                    index,
                    count,
                    offset,
                    chunk_size: u32::try_from(payload.len())
                        .map_err(|_| ArtifactChunkError::InvalidPayloadSize)?,
                    total_size: binding.total_size(),
                    payload_digest: digest(payload),
                    full_digest: binding.full_digest().to_string(),
                    expires_at_ms: binding.expires_at_ms(),
                },
                payload.to_vec(),
            )
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactChunkReceive {
    Accepted { received: u32 },
    Duplicate { received: u32 },
    Complete { bytes: Vec<u8> },
    Rejected { reason: ArtifactChunkError },
}

pub struct ArtifactChunkAssembler {
    binding: ArtifactBinding,
    transfer_id: String,
    count: u32,
    chunks: BTreeMap<u32, ArtifactChunk>,
}

impl ArtifactChunkAssembler {
    pub fn new(
        binding: ArtifactBinding,
        transfer_id: impl Into<String>,
        count: u32,
    ) -> Result<Self, ArtifactChunkError> {
        let transfer_id = transfer_id.into();
        if !is_identity(&transfer_id) || count == 0 || count > MAX_CHUNK_COUNT {
            return Err(ArtifactChunkError::InvalidHeader);
        }
        Ok(Self {
            binding,
            transfer_id,
            count,
            chunks: BTreeMap::new(),
        })
    }

    pub fn accept(&mut self, chunk: ArtifactChunk, now_ms: i64) -> ArtifactChunkReceive {
        let header = chunk.header();
        if now_ms <= 0 || now_ms >= self.binding.expires_at_ms() {
            return ArtifactChunkReceive::Rejected {
                reason: ArtifactChunkError::Expired,
            };
        }
        if header.transfer_id != self.transfer_id {
            return ArtifactChunkReceive::Rejected {
                reason: ArtifactChunkError::WrongTransfer,
            };
        }
        if header.artifact_ref != self.binding.artifact_ref()
            || header.owner_requester_id != self.binding.owner_requester_id()
            || header.owner_request_id != self.binding.owner_request_id()
            || header.full_digest != self.binding.full_digest()
            || header.total_size != self.binding.total_size()
            || header.expires_at_ms != self.binding.expires_at_ms()
            || header.count != self.count
        {
            return ArtifactChunkReceive::Rejected {
                reason: ArtifactChunkError::WrongBinding,
            };
        }
        if let Some(existing) = self.chunks.get(&header.index) {
            return if existing == &chunk {
                ArtifactChunkReceive::Duplicate {
                    received: self.chunks.len() as u32,
                }
            } else {
                ArtifactChunkReceive::Rejected {
                    reason: ArtifactChunkError::DuplicateMismatch,
                }
            };
        }
        self.chunks.insert(header.index, chunk);
        if self.chunks.len() as u32 != self.count {
            return ArtifactChunkReceive::Accepted {
                received: self.chunks.len() as u32,
            };
        }
        match self.reassemble() {
            Ok(bytes) => ArtifactChunkReceive::Complete { bytes },
            Err(reason) => ArtifactChunkReceive::Rejected { reason },
        }
    }

    pub fn finish(&self, now_ms: i64) -> Result<Vec<u8>, ArtifactChunkError> {
        if now_ms <= 0 || now_ms >= self.binding.expires_at_ms() {
            return Err(ArtifactChunkError::Expired);
        }
        if self.chunks.len() as u32 != self.count {
            return Err(ArtifactChunkError::MissingChunks);
        }
        self.reassemble()
    }

    fn reassemble(&self) -> Result<Vec<u8>, ArtifactChunkError> {
        let capacity = usize::try_from(self.binding.total_size())
            .map_err(|_| ArtifactChunkError::InvalidHeader)?;
        let mut bytes = Vec::with_capacity(capacity);
        let mut expected_offset = 0_u64;
        for index in 0..self.count {
            let chunk = self
                .chunks
                .get(&index)
                .ok_or(ArtifactChunkError::MissingChunks)?;
            if chunk.header.offset != expected_offset {
                return Err(ArtifactChunkError::Overlap);
            }
            bytes.extend_from_slice(&chunk.payload);
            expected_offset = expected_offset
                .checked_add(u64::from(chunk.header.chunk_size))
                .ok_or(ArtifactChunkError::Overlap)?;
        }
        if expected_offset != self.binding.total_size()
            || digest(&bytes) != self.binding.full_digest()
        {
            return Err(ArtifactChunkError::FullDigestMismatch);
        }
        Ok(bytes)
    }
}

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn is_identity(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= MAX_IDENTITY_BYTES
}

fn is_artifact_ref(value: &str) -> bool {
    value.strip_prefix("capture:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn is_sha256_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}
