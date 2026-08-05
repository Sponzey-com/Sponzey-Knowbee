use serde::Deserialize;
use serde_json::Value;

use crate::protocol::{Request, RequestMetadata};

pub const CANONICAL_PROTOCOL_VERSION: u16 = 1;
pub const MAX_CANONICAL_REQUEST_BYTES: usize = 512 * 1024;
pub const MAX_CANONICAL_PARAMS_BYTES: usize = 64 * 1024;
const MAX_REQUEST_ID_BYTES: usize = 256;
const MAX_METHOD_BYTES: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestSchemaError {
    RequestTooLarge,
    Malformed,
    UnsupportedVersion,
    InvalidRequestId,
    InvalidMethod,
    ParamsTooLarge,
}

#[derive(Debug, Clone)]
pub struct CanonicalRequest {
    protocol_version: u16,
    request: Request,
}

impl CanonicalRequest {
    pub fn protocol_version(&self) -> u16 {
        self.protocol_version
    }

    pub fn request(&self) -> &Request {
        &self.request
    }

    pub fn into_request(self) -> Request {
        self.request
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CanonicalRequestWire {
    protocol_version: u16,
    id: String,
    method: String,
    #[serde(default)]
    params: Value,
    #[serde(default)]
    metadata: RequestMetadata,
}

pub fn parse_canonical_request(input: &[u8]) -> Result<CanonicalRequest, RequestSchemaError> {
    if input.len() > MAX_CANONICAL_REQUEST_BYTES {
        return Err(RequestSchemaError::RequestTooLarge);
    }
    let wire = serde_json::from_slice::<CanonicalRequestWire>(input)
        .map_err(|_| RequestSchemaError::Malformed)?;
    if wire.protocol_version != CANONICAL_PROTOCOL_VERSION {
        return Err(RequestSchemaError::UnsupportedVersion);
    }
    if !bounded_nonempty(&wire.id, MAX_REQUEST_ID_BYTES) {
        return Err(RequestSchemaError::InvalidRequestId);
    }
    if !bounded_nonempty(&wire.method, MAX_METHOD_BYTES) {
        return Err(RequestSchemaError::InvalidMethod);
    }
    let params_size =
        serde_json::to_vec(&wire.params).map_err(|_| RequestSchemaError::Malformed)?;
    if params_size.len() > MAX_CANONICAL_PARAMS_BYTES {
        return Err(RequestSchemaError::ParamsTooLarge);
    }
    Ok(CanonicalRequest {
        protocol_version: wire.protocol_version,
        request: Request {
            id: Some(wire.id),
            method: wire.method,
            params: wire.params,
            metadata: wire.metadata,
        },
    })
}

fn bounded_nonempty(value: &str, max_bytes: usize) -> bool {
    let value = value.trim();
    !value.is_empty() && value.len() <= max_bytes
}
