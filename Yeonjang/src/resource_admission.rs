use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::method_descriptor::{MethodResource, method_descriptor};
use crate::platform_operation::{BoundPlatformOperation, CapabilityCommand};
use crate::protocol::Request;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ExecutionResourceKey {
    resource: MethodResource,
    discriminator: String,
}

impl ExecutionResourceKey {
    pub fn for_request(request: &Request) -> Option<Self> {
        let descriptor = method_descriptor(&request.method)?;
        if !descriptor.requires_side_effect_binding() {
            return None;
        }
        let discriminator = match descriptor.resource {
            MethodResource::Camera => {
                bounded_param(&request.params, "device_id").unwrap_or_else(|| "default".to_string())
            }
            MethodResource::Screen => request
                .params
                .get("display")
                .and_then(Value::as_u64)
                .map(|display| display.to_string())
                .unwrap_or_else(|| "default".to_string()),
            _ => request
                .metadata
                .target_fingerprint
                .as_deref()
                .and_then(bounded_identity)
                .unwrap_or_else(|| "default".to_string()),
        };
        Some(Self {
            resource: descriptor.resource,
            discriminator,
        })
    }

    /// Derives an opaque resource key only from the canonical bound operation.
    pub fn for_operation(operation: &BoundPlatformOperation) -> Self {
        let (resource, selector_kind, selector) = match operation.command() {
            CapabilityCommand::CameraCapture {
                device_id: Some(device_id),
                ..
            } => (MethodResource::Camera, "explicit_device", device_id.clone()),
            CapabilityCommand::CameraCapture {
                device_id: None, ..
            } => (MethodResource::Camera, "default_device", String::new()),
            CapabilityCommand::ScreenCapture {
                display: Some(display),
            } => (
                MethodResource::Screen,
                "explicit_display",
                display.to_string(),
            ),
            CapabilityCommand::ScreenCapture { display: None } => {
                (MethodResource::Screen, "default_display", String::new())
            }
        };
        let mut hasher = Sha256::new();
        append_hash_field(&mut hasher, "yeonjang-execution-resource-v2");
        append_hash_field(&mut hasher, operation.target_instance_id());
        append_hash_field(&mut hasher, operation.target_session_id());
        append_hash_field(&mut hasher, operation.target_fingerprint());
        append_hash_field(&mut hasher, resource.as_str());
        append_hash_field(&mut hasher, selector_kind);
        append_hash_field(&mut hasher, &selector);
        Self {
            resource,
            discriminator: format!("sha256:{:x}", hasher.finalize()),
        }
    }
}

fn append_hash_field(hasher: &mut Sha256, value: &str) {
    hasher.update(value.len().to_be_bytes());
    hasher.update(value.as_bytes());
}

fn bounded_param(params: &Value, field: &str) -> Option<String> {
    params
        .get(field)
        .and_then(Value::as_str)
        .and_then(bounded_identity)
}

fn bounded_identity(value: &str) -> Option<String> {
    let normalized = value.trim();
    (!normalized.is_empty() && normalized.len() <= 256).then(|| normalized.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::protocol::RequestMetadata;

    #[test]
    fn resource_key_is_descriptor_derived_and_device_specific() {
        let camera = Request {
            id: Some("camera".to_string()),
            method: "camera.capture".to_string(),
            params: json!({ "device_id": "camera-1" }),
            metadata: RequestMetadata::default(),
        };
        let same_camera = Request {
            id: Some("same-camera".to_string()),
            ..camera.clone()
        };
        let other_camera = Request {
            id: Some("other-camera".to_string()),
            params: json!({ "device_id": "camera-2" }),
            ..camera.clone()
        };
        let read_only = Request {
            id: Some("read-only".to_string()),
            method: "system.info".to_string(),
            params: json!({}),
            metadata: RequestMetadata::default(),
        };

        assert_eq!(
            ExecutionResourceKey::for_request(&camera),
            ExecutionResourceKey::for_request(&same_camera)
        );
        assert_ne!(
            ExecutionResourceKey::for_request(&camera),
            ExecutionResourceKey::for_request(&other_camera)
        );
        assert_eq!(ExecutionResourceKey::for_request(&read_only), None);
    }

    #[test]
    fn desktop_control_methods_share_one_exact_target_resource() {
        let target = RequestMetadata {
            target_fingerprint: Some(
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    .to_string(),
            ),
            ..Default::default()
        };
        let mouse = Request {
            id: Some("mouse".to_string()),
            method: "mouse.click".to_string(),
            params: json!({}),
            metadata: target.clone(),
        };
        let keyboard = Request {
            id: Some("keyboard".to_string()),
            method: "keyboard.type".to_string(),
            params: json!({}),
            metadata: target.clone(),
        };
        let focus = Request {
            id: Some("focus".to_string()),
            method: "browser.focus".to_string(),
            params: json!({}),
            metadata: target,
        };
        let other_target = Request {
            id: Some("other-target".to_string()),
            metadata: RequestMetadata {
                target_fingerprint: Some(
                    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                        .to_string(),
                ),
                ..Default::default()
            },
            ..mouse.clone()
        };

        assert_eq!(
            ExecutionResourceKey::for_request(&mouse),
            ExecutionResourceKey::for_request(&keyboard)
        );
        assert_eq!(
            ExecutionResourceKey::for_request(&mouse),
            ExecutionResourceKey::for_request(&focus)
        );
        assert_ne!(
            ExecutionResourceKey::for_request(&mouse),
            ExecutionResourceKey::for_request(&other_target)
        );
    }
}
