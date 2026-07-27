use anyhow::Result;
use serde_json::{Value, json};
use sysinfo::Networks;

pub fn status() -> Result<Value> {
    let networks = Networks::new_with_refreshed_list();
    let mut interfaces = networks
        .iter()
        .map(|(name, data)| {
            json!({
                "name": name,
                "receivedBytes": data.received(),
                "transmittedBytes": data.transmitted(),
                "totalReceivedBytes": data.total_received(),
                "totalTransmittedBytes": data.total_transmitted(),
            })
        })
        .collect::<Vec<_>>();
    interfaces.sort_by(|left, right| {
        left["name"]
            .as_str()
            .unwrap_or_default()
            .cmp(right["name"].as_str().unwrap_or_default())
    });

    Ok(json!({
        "interfaces": interfaces,
        "interfaceCount": interfaces.len(),
        "externalProbe": false,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_status_returns_local_interface_counters_only() {
        let result = status().expect("network status");
        let serialized = result.to_string();

        assert!(result["interfaces"].is_array());
        assert!(result["interfaceCount"].is_number());
        assert_eq!(result["externalProbe"], false);
        assert!(!serialized.contains("ipAddress"));
        assert!(!serialized.contains("macAddress"));
        assert!(!serialized.contains("gateway"));
        assert!(!serialized.contains("dns"));
    }
}
