//! Closed, side-effect-free grammar for the packaged Yeonjang entrypoint.
//!
//! The composition root consumes this value before it loads settings, secrets,
//! runtime hosts, or platform adapters.  A caller therefore cannot select a
//! runtime path by adding a higher-priority helper or utility flag.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartupMode {
    Gui,
    Managed {
        use_tls: bool,
        config_root: Option<String>,
        broker_secret_stdin: bool,
        stage_timing_jsonl: bool,
    },
    Stdio {
        authenticated: bool,
    },
    ReleaseIdentity,
    WriteIcon {
        output_path: String,
    },
    CameraCaptureHelper {
        args: Vec<String>,
    },
    RejectLegacyLocalExec,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StartupModeError;

impl StartupMode {
    /// Parses only documented, mutually-exclusive top-level modes.
    ///
    /// Camera helper arguments remain opaque to this parser, but that helper
    /// invocation must be the first and only top-level mode selector.
    pub fn parse(args: &[String]) -> Result<Self, StartupModeError> {
        if args
            .iter()
            .any(|arg| arg == "--exec" || arg == "--exec-bin")
        {
            return Ok(Self::RejectLegacyLocalExec);
        }

        if let Some((first, remainder)) = args.split_first()
            && first == "--camera-capture-helper"
            && !remainder.iter().any(|arg| is_top_level_mode(arg))
        {
            return Ok(Self::CameraCaptureHelper {
                args: remainder.to_vec(),
            });
        }

        if args.len() == 1 && args[0] == "--release-identity" {
            return Ok(Self::ReleaseIdentity);
        }

        if let [flag, output_path] = args
            && flag == "--write-icon"
        {
            return Ok(Self::WriteIcon {
                output_path: output_path.clone(),
            });
        }

        let primary_modes: Vec<&str> = args
            .iter()
            .filter_map(|arg| is_primary_mode(arg).then_some(arg.as_str()))
            .collect();
        match primary_modes.as_slice() {
            [] if args.is_empty() => Ok(Self::Gui),
            ["--gui"] if args.len() == 1 => Ok(Self::Gui),
            ["--stdio"] if args.len() == 1 => Ok(Self::Stdio {
                authenticated: false,
            }),
            ["--stdio-authenticated"] if args.len() == 1 => Ok(Self::Stdio {
                authenticated: true,
            }),
            ["--managed"] => parse_managed(args, false),
            ["--headless-managed"] => parse_managed(args, false),
            ["--managed-tls"] => parse_managed(args, true),
            _ => Err(StartupModeError),
        }
    }

    /// Returns whether this exact top-level mode can own effect-capable
    /// runtime resources and therefore must pass the fixed OS lease gate.
    pub const fn claims_runtime(&self) -> bool {
        matches!(self, Self::Gui | Self::Managed { .. } | Self::Stdio { .. })
    }
}

fn parse_managed(args: &[String], use_tls: bool) -> Result<StartupMode, StartupModeError> {
    let mut config_root = None;
    let mut broker_secret_stdin = false;
    let mut stage_timing_jsonl = false;
    let mut index = 0;

    while let Some(arg) = args.get(index) {
        match arg.as_str() {
            "--managed" | "--headless-managed" | "--managed-tls" => index += 1,
            "--config-root" => {
                let Some(value) = args.get(index + 1) else {
                    return Err(StartupModeError);
                };
                if config_root.replace(value.clone()).is_some() {
                    return Err(StartupModeError);
                }
                index += 2;
            }
            "--broker-secret-stdin" if !broker_secret_stdin => {
                broker_secret_stdin = true;
                index += 1;
            }
            "--stage-timing-jsonl" if !stage_timing_jsonl => {
                stage_timing_jsonl = true;
                index += 1;
            }
            _ => return Err(StartupModeError),
        }
    }

    Ok(StartupMode::Managed {
        use_tls,
        config_root,
        broker_secret_stdin,
        stage_timing_jsonl,
    })
}

fn is_primary_mode(arg: &str) -> bool {
    matches!(
        arg,
        "--gui"
            | "--managed"
            | "--headless-managed"
            | "--managed-tls"
            | "--stdio"
            | "--stdio-authenticated"
    )
}

fn is_top_level_mode(arg: &str) -> bool {
    is_primary_mode(arg)
        || matches!(
            arg,
            "--release-identity" | "--write-icon" | "--camera-capture-helper"
        )
}

#[cfg(test)]
mod tests {
    use super::StartupMode;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn accepts_exact_runtime_and_non_claimant_modes() {
        assert_eq!(StartupMode::parse(&args(&[])), Ok(StartupMode::Gui));
        assert_eq!(
            StartupMode::parse(&args(&["--managed", "--config-root", "/tmp/runtime"])),
            Ok(StartupMode::Managed {
                use_tls: false,
                config_root: Some("/tmp/runtime".to_owned()),
                broker_secret_stdin: false,
                stage_timing_jsonl: false,
            })
        );
        assert_eq!(
            StartupMode::parse(&args(&["--camera-capture-helper", "--permission-status"])),
            Ok(StartupMode::CameraCaptureHelper {
                args: args(&["--permission-status"]),
            })
        );
    }

    #[test]
    fn rejects_ambiguous_top_level_modes() {
        for values in [
            ["--release-identity", "--managed"].as_slice(),
            ["--stdio", "--managed"].as_slice(),
            ["--camera-capture-helper", "--managed"].as_slice(),
            ["--managed", "--managed-tls"].as_slice(),
        ] {
            assert!(StartupMode::parse(&args(values)).is_err(), "{values:?}");
        }
    }

    #[test]
    fn classifies_every_effect_capable_mode_as_a_runtime_claimant() {
        for values in [
            [].as_slice(),
            ["--gui"].as_slice(),
            ["--managed"].as_slice(),
            ["--headless-managed"].as_slice(),
            ["--managed-tls"].as_slice(),
            ["--stdio"].as_slice(),
            ["--stdio-authenticated"].as_slice(),
        ] {
            assert!(
                StartupMode::parse(&args(values))
                    .expect("claimant mode")
                    .claims_runtime(),
                "{values:?}"
            );
        }

        for values in [
            ["--release-identity"].as_slice(),
            ["--write-icon", "/tmp/icon.png"].as_slice(),
            ["--camera-capture-helper", "--permission-status"].as_slice(),
        ] {
            assert!(
                !StartupMode::parse(&args(values))
                    .expect("non-claimant mode")
                    .claims_runtime(),
                "{values:?}"
            );
        }
    }
}
