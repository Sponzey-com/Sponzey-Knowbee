use anyhow::{Result, anyhow};
use serde::Deserialize;
use serde_json::{Value, json};
use sysinfo::{Pid, System};

const DEFAULT_PROCESS_LIMIT: usize = 50;
const MAX_PROCESS_LIMIT: usize = 10_000;

#[derive(Debug, Clone, Deserialize)]
pub struct ProcessListParams {
    pub limit: Option<usize>,
    pub name_contains: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProcessInfoParams {
    pub pid: u32,
}

pub fn list_processes(params: ProcessListParams) -> Result<Value> {
    let limit = params
        .limit
        .unwrap_or(DEFAULT_PROCESS_LIMIT)
        .clamp(1, MAX_PROCESS_LIMIT);
    let filter = params
        .name_contains
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let system = process_system();
    let mut processes = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let entry = process_entry(pid.as_u32(), process);
            if let Some(filter) = &filter {
                let name = entry["name"].as_str().unwrap_or_default().to_lowercase();
                if !name.contains(filter) {
                    return None;
                }
            }
            Some(entry)
        })
        .collect::<Vec<_>>();

    processes.sort_by(|left, right| {
        let left_name = left["name"].as_str().unwrap_or_default();
        let right_name = right["name"].as_str().unwrap_or_default();
        left_name
            .cmp(right_name)
            .then_with(|| left["pid"].as_u64().cmp(&right["pid"].as_u64()))
    });
    let total_count = processes.len();
    processes.truncate(limit);

    Ok(json!({
        "processes": processes,
        "count": processes.len(),
        "totalCount": total_count,
        "truncated": total_count > limit,
        "limit": limit,
    }))
}

pub fn process_info(params: ProcessInfoParams) -> Result<Value> {
    let system = process_system();
    let pid = Pid::from_u32(params.pid);
    let process = system
        .process(pid)
        .ok_or_else(|| anyhow!("process not found: {}", params.pid))?;

    Ok(json!({
        "process": process_entry(params.pid, process),
    }))
}

fn process_system() -> System {
    System::new_all()
}

fn process_entry(pid: u32, process: &sysinfo::Process) -> Value {
    json!({
        "pid": pid,
        "name": process.name(),
        "status": format!("{:?}", process.status()),
        "memoryBytes": process.memory(),
        "virtualMemoryBytes": process.virtual_memory(),
        "cpuUsage": process.cpu_usage(),
        "startedAt": process.start_time(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process;

    #[test]
    fn process_list_includes_current_process_without_sensitive_fields() {
        let current_pid = process::id();

        let result = list_processes(ProcessListParams {
            limit: Some(MAX_PROCESS_LIMIT),
            name_contains: None,
        })
        .expect("process list");

        let processes = result["processes"].as_array().expect("process array");
        assert!(
            processes
                .iter()
                .any(|entry| entry["pid"].as_u64() == Some(current_pid as u64)),
            "current process should be visible in process.list"
        );
        let serialized = result.to_string();
        assert!(!serialized.contains("commandLine"));
        assert!(!serialized.contains("\"cwd\""));
        assert!(!serialized.contains("\"env\""));
    }

    #[test]
    fn process_info_returns_current_process() {
        let current_pid = process::id();

        let result = process_info(ProcessInfoParams { pid: current_pid }).expect("process info");

        assert_eq!(result["process"]["pid"], current_pid);
        assert!(result["process"]["name"].as_str().unwrap_or_default().len() > 0);
    }

    #[test]
    fn process_list_applies_limit() {
        let result = list_processes(ProcessListParams {
            limit: Some(1),
            name_contains: None,
        })
        .expect("process list");

        assert!(result["processes"].as_array().expect("process array").len() <= 1);
        assert_eq!(result["limit"], 1);
    }
}
