#![recursion_limit = "256"]

pub mod artifact_cleanup;
pub mod artifact_lifecycle;
pub mod artifact_registration;
pub mod artifact_repository;
pub mod artifact_runtime_composition;
pub mod artifact_sink;
pub mod artifact_transfer;
pub mod artifact_transfer_use_case;
pub mod atomic_local_storage;
pub mod authorization;
pub mod authorization_bootstrap;
pub mod automation;
pub mod blocking_resource_admission;
mod browser_focus_nonce;
pub mod cancellation;
pub mod capability_permission;
pub mod capture_artifact_postcheck;
pub mod capture_permission_read;
pub mod completed_idempotency;
pub mod contract_only_platform;
pub mod credential_store;
pub mod durable_cancellation;
pub mod durable_completed_store;
pub mod durable_response_archive;
pub mod durable_retention;
pub mod execute_capability;
mod features;
mod gui;
mod icon;
pub mod instance_process_lease;
pub mod legacy_capture_permission_observer;
pub mod legacy_capture_platform;
pub mod legacy_platform_failure;
mod lifecycle;
pub mod local_policy_setup;
pub mod managed_composition;
pub mod managed_request;
pub mod managed_shutdown;
pub mod method_descriptor;
mod mqtt;
pub mod mqtt_admission;
mod mqtt_connection_lifecycle;
pub mod mqtt_transport;
pub mod mqtt_v2_artifact_adapter;
pub mod mqtt_v2_artifact_cleanup;
pub mod mqtt_v2_capabilities_adapter;
pub mod mqtt_v2_capability_projection;
pub mod mqtt_v2_command_pump;
pub mod mqtt_v2_connection;
pub mod mqtt_v2_control_adapter;
pub mod mqtt_v2_control_router;
pub mod mqtt_v2_crypto;
pub mod mqtt_v2_direct_handler;
pub mod mqtt_v2_permission_query_adapter;
pub mod mqtt_v2_policy_admin_adapter;
pub mod mqtt_v2_production_bootstrap;
pub mod mqtt_v2_receipt_query_adapter;
pub mod mqtt_v2_response_ack_adapter;
pub mod mqtt_v2_response_adapter;
pub mod mqtt_v2_runtime_composition;
pub mod mqtt_v2_status_adapter;
pub mod mqtt_v2_topics;
mod node;
pub mod params_schema;
mod path_policy;
pub mod permission_policy;
pub mod permission_policy_bootstrap;
pub mod permission_policy_migration;
mod platform;
pub mod platform_execution;
pub mod platform_operation;
pub mod platform_port;
pub mod policy_admin;
pub mod policy_repository;
pub mod protocol;
pub mod protocol_v2;
pub mod protocol_v2_admission;
pub mod protocol_v2_artifact;
pub mod protocol_v2_artifact_cancel_response;
pub mod protocol_v2_artifact_fetch_response;
pub mod protocol_v2_cancel_response;
pub mod protocol_v2_capabilities;
pub mod protocol_v2_command_rejection;
pub mod protocol_v2_control;
pub mod protocol_v2_control_admission;
pub mod protocol_v2_operation;
pub mod protocol_v2_permission_query;
pub mod protocol_v2_permission_response;
pub mod protocol_v2_policy_admin;
pub mod protocol_v2_policy_admin_result;
pub mod protocol_v2_receipt_query;
pub mod protocol_v2_receipt_query_admission;
pub mod protocol_v2_receipt_response;
pub mod protocol_v2_rejection;
pub mod protocol_v2_response_ack;
pub mod protocol_v2_response_ack_admission;
pub mod protocol_v2_response_ack_result;
pub mod protocol_v2_status;
pub mod protocol_v2_terminal;
pub mod release_identity;
pub mod request_dispatcher;
pub mod request_lifecycle;
pub mod request_schema;
pub mod resource_admission;
pub mod runtime;
pub mod runtime_host;
pub mod settings;
pub mod side_effect_admission;
pub mod stage_timing;
pub mod stage_timing_jsonl;
pub mod stdio;
pub mod system_screen_permission;
pub mod terminal_receipt;
pub mod tokio_resource_admission;
pub mod v2_cancel_use_case;
pub mod v2_delivery_receipt;
pub mod v2_receipt_query_use_case;
pub mod v2_response_ack_use_case;
pub mod v2_terminal_repository;

use std::path::Path;
use std::sync::Arc;

use anyhow::Result;
use automation::AutomationBackend;

pub use lifecycle::{managed_runtime_state, new_shared_lifecycle_state};
pub use mqtt::RuntimeEvent;
pub use node::handle_request_with_settings_and_backend;

pub fn run_gui() -> Result<()> {
    gui::run_gui()
}

pub fn write_bundle_icon_png(path: &Path) -> Result<()> {
    icon::write_bundle_icon_png(path)
}

pub fn system_automation_backend() -> Arc<dyn AutomationBackend> {
    Arc::new(platform::current_backend())
}

#[cfg(target_os = "windows")]
pub fn run_platform_camera_capture_helper(args: Vec<String>) -> Result<()> {
    platform::run_platform_camera_capture_helper(args)
}
