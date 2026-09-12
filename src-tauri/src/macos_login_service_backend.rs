//! OS adapter. Permission inspection never enables or disables a launchd job.
use crate::macos_login_service::Backend;
use crate::macos_service_management::{self as native, ServiceStatus};
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub(crate) struct SystemBackend;

impl Backend for SystemBackend {
    fn status(&mut self) -> Result<ServiceStatus, String> {
        let status = native::status()?;
        if matches!(
            status,
            ServiceStatus::Enabled | ServiceStatus::NotRegistered
        ) && disabled_override("no.bliatun.filamentmanager.background")?
        {
            Ok(ServiceStatus::RequiresApproval)
        } else {
            Ok(status)
        }
    }

    fn legacy_allowed(&mut self, plist: &Path) -> Result<bool, String> {
        // Service Management approval and launchctl's persistent per-label
        // override are separate. Changing the label must not bypass either.
        Ok(native::legacy_status(plist)? == ServiceStatus::Enabled
            && !disabled_override("no.bliatun.filamentmanager")?)
    }

    fn register(&mut self) -> Result<ServiceStatus, String> {
        native::register()?;
        self.status()
    }

    fn unregister(&mut self) -> Result<(), String> {
        native::unregister()
    }

    fn registration_record(&mut self) -> Option<String> {
        native::registration_record()
    }

    fn store_registration_record(&mut self, record: Option<&str>) -> Result<(), String> {
        native::store_registration_record(record)
    }
}

fn inspection_error() -> String {
    "Could not determine the existing launch-at-login permission; its registration was preserved."
        .into()
}

fn parse_disabled_override(output: &str, expected_label: &str) -> Result<bool, String> {
    let lines = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if lines.first() != Some(&"disabled services = {") || lines.last() != Some(&"}") {
        return Err(inspection_error());
    }
    let mut found = None;
    for line in &lines[1..lines.len() - 1] {
        let (label, state) = line
            .strip_prefix('"')
            .and_then(|line| line.rsplit_once("\" => "))
            .ok_or_else(inspection_error)?;
        if label.is_empty() {
            return Err(inspection_error());
        }
        // Recent macOS prints words; older versions print the boolean value
        // of the disabled override. Unknown formats cannot authorize migration.
        let disabled = match state {
            "true" | "disabled" => true,
            "false" | "enabled" => false,
            _ => return Err(inspection_error()),
        };
        if label == expected_label && found.replace(disabled).is_some() {
            return Err(inspection_error());
        }
    }
    Ok(found.unwrap_or(false))
}

fn disabled_override(label: &str) -> Result<bool, String> {
    const LIMIT: u64 = 1024 * 1024;
    let domain = format!("gui/{}", unsafe { libc::geteuid() });
    let mut child = Command::new("/bin/launchctl")
        .args(["print-disabled", &domain])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| inspection_error())?;
    let stdout = child.stdout.take().ok_or_else(inspection_error)?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(LIMIT + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(10));
            }
            _ => {
                // Only our read-only launchctl subprocess is terminated.
                let _ = child.kill();
                let _ = child.wait();
                break Err(inspection_error());
            }
        }
    };
    let bytes = reader
        .join()
        .map_err(|_| inspection_error())?
        .map_err(|_| inspection_error())?;
    if !status?.success() || bytes.len() as u64 > LIMIT {
        return Err(inspection_error());
    }
    let output = std::str::from_utf8(&bytes).map_err(|_| inspection_error())?;
    parse_disabled_override(output, label)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(output: &str) -> Result<bool, String> {
        parse_disabled_override(output, "no.bliatun.filamentmanager")
    }

    #[test]
    fn respects_persistent_opt_out_in_both_launchctl_output_formats() {
        for state in ["true", "disabled", "false", "enabled"] {
            let text = format!(
                "\n\tdisabled services = {{\n\t\t\"unrelated.app\" => true\n\t\t\"no.bliatun.filamentmanager\" => {state}\n\t}}\n"
            );
            assert_eq!(parse(&text).unwrap(), matches!(state, "true" | "disabled"));
        }
        assert!(!parse("disabled services = {\n}").unwrap());
        assert!(
            !parse("disabled services = {\n\"no.bliatun.filamentmanager.other\" => true\n}")
                .unwrap()
        );
    }

    #[test]
    fn incomplete_ambiguous_or_unrecognized_permission_output_cannot_allow_migration() {
        for text in ["", "}", "disabled services = {", "unrecognized format",
            "disabled services = {\n\"no.bliatun.filamentmanager\" => unknown\n}",
            "disabled services = {\n\"no.bliatun.filamentmanager\" => false\n\"no.bliatun.filamentmanager\" => true\n}",
            "disabled services = {\nmalformed entry\n}"] {
            assert!(parse(text).is_err(), "accepted: {text}");
        }
    }
}
