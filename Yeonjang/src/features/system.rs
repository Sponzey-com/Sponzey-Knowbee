use anyhow::{Result, anyhow};
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::{Arc, atomic::AtomicBool};

use crate::automation::{
    ApplicationLaunchRequest, AutomationBackend, CommandExecutionRequest, SystemControlRequest,
};

pub const MAX_COMMAND_ARGS: usize = 128;
pub const MAX_COMMAND_TIMEOUT_SECS: u64 = 300;
pub const MAX_COMMAND_ENV_BYTES: usize = 64 * 1024;
const MAX_COMMAND_BYTES: usize = 16 * 1024;
const MAX_COMMAND_ARG_BYTES: usize = 8 * 1024;
const MAX_COMMAND_CWD_BYTES: usize = 4 * 1024;
const MAX_COMMAND_ENV_ENTRIES: usize = 128;
const MAX_COMMAND_ENV_KEY_BYTES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandPolicyError {
    InvalidCommand,
    ShellArgsConflict,
    ArgsTooLarge,
    InvalidCwd,
    EnvironmentTooLarge,
    InvalidTimeout,
}

impl CommandPolicyError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidCommand => "command_invalid",
            Self::ShellArgsConflict => "command_shell_args_conflict",
            Self::ArgsTooLarge => "command_args_too_large",
            Self::InvalidCwd => "command_cwd_invalid",
            Self::EnvironmentTooLarge => "command_environment_too_large",
            Self::InvalidTimeout => "command_timeout_invalid",
        }
    }

    pub fn public_message(self) -> &'static str {
        "Command execution parameters violate the bounded command policy."
    }
}

impl std::fmt::Display for CommandPolicyError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for CommandPolicyError {}

#[derive(Debug, Deserialize)]
pub struct ExecParams {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub shell: bool,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default, alias = "timeoutSec")]
    pub timeout_sec: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct ControlParams {
    pub action: String,
    #[serde(default)]
    pub target: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LaunchAppParams {
    pub application: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub detached: bool,
}

pub fn system_info_with_backend(backend: &dyn AutomationBackend) -> Result<Value> {
    Ok(serde_json::to_value(backend.system_info()?)?)
}

pub fn control(params: ControlParams, backend: &dyn AutomationBackend) -> Result<Value> {
    if params.action.trim().is_empty() {
        return Err(anyhow!("action must not be empty"));
    }

    let request = SystemControlRequest {
        action: params.action,
        target: params.target,
    };
    Ok(serde_json::to_value(backend.control_system(request)?)?)
}

pub fn exec(
    params: ExecParams,
    cancellation: Arc<AtomicBool>,
    backend: &dyn AutomationBackend,
) -> Result<Value> {
    let request = validate_exec_params(params, cancellation).map_err(anyhow::Error::new)?;
    Ok(serde_json::to_value(backend.execute_command(request)?)?)
}

pub fn validate_exec_params(
    params: ExecParams,
    cancellation: Arc<AtomicBool>,
) -> std::result::Result<CommandExecutionRequest, CommandPolicyError> {
    if invalid_bounded_text(&params.command, MAX_COMMAND_BYTES) {
        return Err(CommandPolicyError::InvalidCommand);
    }
    if params.shell && !params.args.is_empty() {
        return Err(CommandPolicyError::ShellArgsConflict);
    }
    if params.args.len() > MAX_COMMAND_ARGS
        || params
            .args
            .iter()
            .any(|arg| arg.len() > MAX_COMMAND_ARG_BYTES || arg.contains('\0'))
        || params.args.iter().map(String::len).sum::<usize>() > MAX_COMMAND_ENV_BYTES
    {
        return Err(CommandPolicyError::ArgsTooLarge);
    }
    if params
        .cwd
        .as_deref()
        .is_some_and(|cwd| invalid_bounded_text(cwd, MAX_COMMAND_CWD_BYTES))
    {
        return Err(CommandPolicyError::InvalidCwd);
    }
    if params.env.len() > MAX_COMMAND_ENV_ENTRIES
        || params.env.iter().any(|(key, value)| {
            invalid_bounded_text(key, MAX_COMMAND_ENV_KEY_BYTES) || value.contains('\0')
        })
        || params
            .env
            .iter()
            .map(|(key, value)| key.len() + value.len())
            .sum::<usize>()
            > MAX_COMMAND_ENV_BYTES
    {
        return Err(CommandPolicyError::EnvironmentTooLarge);
    }
    if params
        .timeout_sec
        .is_some_and(|timeout| timeout == 0 || timeout > MAX_COMMAND_TIMEOUT_SECS)
    {
        return Err(CommandPolicyError::InvalidTimeout);
    }
    Ok(CommandExecutionRequest {
        command: params.command,
        args: params.args,
        cwd: params.cwd,
        shell: params.shell,
        env: params.env,
        timeout_sec: params.timeout_sec,
        cancellation,
    })
}

fn invalid_bounded_text(value: &str, max_bytes: usize) -> bool {
    value.trim().is_empty() || value.len() > max_bytes || value.contains('\0')
}

pub fn launch_application(
    params: LaunchAppParams,
    backend: &dyn AutomationBackend,
) -> Result<Value> {
    let request = ApplicationLaunchRequest {
        application: params.application,
        args: params.args,
        cwd: params.cwd,
        detached: params.detached,
    };
    Ok(serde_json::to_value(backend.launch_application(request)?)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params() -> ExecParams {
        ExecParams {
            command: "/usr/bin/printf".to_string(),
            args: vec!["ok".to_string()],
            cwd: None,
            shell: false,
            env: BTreeMap::new(),
            timeout_sec: Some(5),
        }
    }

    #[test]
    fn command_policy_is_typed_and_bounds_every_caller_controlled_field() {
        let validate = |params| validate_exec_params(params, Arc::new(AtomicBool::new(false)));
        assert!(validate(params()).is_ok());

        let mut empty = params();
        empty.command.clear();
        assert!(matches!(
            validate(empty),
            Err(CommandPolicyError::InvalidCommand)
        ));

        let mut shell_args = params();
        shell_args.shell = true;
        assert!(matches!(
            validate(shell_args),
            Err(CommandPolicyError::ShellArgsConflict)
        ));

        let mut too_many_args = params();
        too_many_args.args = vec!["x".to_string(); MAX_COMMAND_ARGS + 1];
        assert!(matches!(
            validate(too_many_args),
            Err(CommandPolicyError::ArgsTooLarge)
        ));

        let mut invalid_timeout = params();
        invalid_timeout.timeout_sec = Some(MAX_COMMAND_TIMEOUT_SECS + 1);
        assert!(matches!(
            validate(invalid_timeout),
            Err(CommandPolicyError::InvalidTimeout)
        ));

        let mut oversized_env = params();
        oversized_env
            .env
            .insert("KEY".to_string(), "x".repeat(MAX_COMMAND_ENV_BYTES + 1));
        assert!(matches!(
            validate(oversized_env),
            Err(CommandPolicyError::EnvironmentTooLarge)
        ));
    }

    #[test]
    fn command_policy_does_not_guess_intent_from_command_text() {
        for command in [
            "printf 'base64 --decode'",
            "python3 -c 'print(\"eval(\")'",
            "printf '$(echo harmless | cat)'",
        ] {
            let mut candidate = params();
            candidate.command = command.to_string();
            candidate.args.clear();
            candidate.shell = true;
            assert!(
                validate_exec_params(candidate, Arc::new(AtomicBool::new(false))).is_ok(),
                "structured authorization, not substring matching, owns intent"
            );
        }
    }
}
