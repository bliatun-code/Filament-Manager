use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use filament_manager_core::backend::shared_contracts::{
    validate_shared_contract_manifest, ContractFieldType, SHARED_CONTRACT_MANIFEST,
};

const TYPESCRIPT_OUTPUT: &str = "ui/src/lib/shared_contracts.generated.ts";
const COMPANION_OUTPUT: &str = "src-tauri/companion_browser/shared_contracts.generated.js";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Mode {
    Write,
    Check,
}

fn main() {
    if let Err(error) = run(env::args().skip(1)) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run(args: impl Iterator<Item = String>) -> Result<(), String> {
    run_at_root(args, Path::new(env!("CARGO_MANIFEST_DIR")))
}

fn run_at_root(args: impl Iterator<Item = String>, repository_root: &Path) -> Result<(), String> {
    let mode = parse_mode(args)?;
    validate_shared_contract_manifest()?;
    let outputs = generated_outputs(repository_root);

    match mode {
        Mode::Write => write_outputs(&outputs),
        Mode::Check => check_outputs(&outputs),
    }
}

fn parse_mode(args: impl Iterator<Item = String>) -> Result<Mode, String> {
    let args = args.collect::<Vec<_>>();
    match args.as_slice() {
        [] => Ok(Mode::Write),
        [argument] if argument == "--check" => Ok(Mode::Check),
        _ => Err("usage: generate-shared-contracts [--check]".to_string()),
    }
}

fn generated_outputs(repository_root: &Path) -> Vec<(PathBuf, String)> {
    vec![
        (
            repository_root.join(TYPESCRIPT_OUTPUT),
            render_typescript_contracts(),
        ),
        (
            repository_root.join(COMPANION_OUTPUT),
            render_companion_contracts(),
        ),
    ]
}

fn render_typescript_contracts() -> String {
    let mut output = generated_header("//");
    for contract in SHARED_CONTRACT_MANIFEST.enums {
        let constant_name = plural_constant_name(contract.name);
        output.push_str(&format!(
            "export const {constant_name} = {} as const;\n",
            json_string_array(contract.serialized_values)
        ));
        output.push_str(&format!(
            "export type {} = (typeof {constant_name})[number];\n\n",
            contract.name
        ));
        output.push_str(&format!(
            "export function isCanonical{}(value: unknown): value is {} {{\n  return typeof value === \"string\" && ({constant_name} as readonly string[]).includes(value);\n}}\n\n",
            contract.name, contract.name
        ));
    }

    output.push_str(
        "function isContractObject(value: unknown): value is Record<string, unknown> {\n  return value !== null && typeof value === \"object\" && !Array.isArray(value);\n}\n\n",
    );
    for contract in SHARED_CONTRACT_MANIFEST.dtos {
        output.push_str(&format!("export type {} = {{\n", contract.name));
        for field in contract.fields {
            output.push_str(&format!(
                "  {}: {};\n",
                field.name,
                typescript_field_type(field.field_type)
            ));
        }
        output.push_str("};\n\n");
        output.push_str(&format!(
            "export function is{}(value: unknown): value is {} {{\n  return (\n    isContractObject(value)",
            contract.name, contract.name
        ));
        for field in contract.fields {
            output.push_str(&format!(
                " &&\n    {}",
                typescript_field_validation(field.name, field.field_type)
            ));
        }
        output.push_str("\n  );\n}\n\n");
    }
    finish_generated_output(output)
}

fn render_companion_contracts() -> String {
    let mut output = generated_header("//");
    for contract in SHARED_CONTRACT_MANIFEST.enums {
        let constant_name = plural_constant_name(contract.name);
        let set_name = format!("{constant_name}_SET");
        output.push_str(&format!(
            "export const {constant_name} = Object.freeze({});\n",
            json_string_array(contract.serialized_values)
        ));
        output.push_str(&format!("const {set_name} = new Set({constant_name});\n"));
        output.push_str(&format!(
            "export function isCanonical{}(value) {{\n  return {set_name}.has(value);\n}}\n\n",
            contract.name
        ));
    }

    output.push_str(
        "function isContractObject(value) {\n  return value !== null && typeof value === \"object\" && !Array.isArray(value);\n}\n\n",
    );
    for contract in SHARED_CONTRACT_MANIFEST.dtos {
        output.push_str(&format!(
            "export function is{}(value) {{\n  return (\n    isContractObject(value)",
            contract.name
        ));
        for field in contract.fields {
            output.push_str(&format!(
                " &&\n    {}",
                companion_field_validation(field.name, field.field_type)
            ));
        }
        output.push_str("\n  );\n}\n\n");
    }
    finish_generated_output(output)
}

fn finish_generated_output(mut output: String) -> String {
    output.truncate(output.trim_end().len());
    output.push('\n');
    output
}

fn generated_header(comment: &str) -> String {
    format!(
        "{comment} @generated by `npm run generate:shared-contracts`; do not edit.\n{comment} Source: src/backend/shared_contracts.rs\n\n"
    )
}

fn plural_constant_name(type_name: &str) -> String {
    let mut result = String::new();
    for (index, character) in type_name.chars().enumerate() {
        if character.is_uppercase() && index != 0 {
            result.push('_');
        }
        result.extend(character.to_uppercase());
    }
    if result.ends_with("_STATUS") {
        result.push_str("ES");
    } else {
        result.push('S');
    }
    result
}

fn json_string_array(values: &[&str]) -> String {
    serde_json::to_string(values).expect("static contract values must serialize")
}

fn typescript_field_type(field_type: ContractFieldType) -> String {
    match field_type {
        ContractFieldType::String => "string".to_string(),
        ContractFieldType::Integer => "number".to_string(),
        ContractFieldType::Array(item_type) => format!("{item_type}[]"),
    }
}

fn companion_field_validation(name: &str, field_type: ContractFieldType) -> String {
    match field_type {
        ContractFieldType::String => format!("typeof value.{name} === \"string\""),
        ContractFieldType::Integer => format!("Number.isSafeInteger(value.{name})"),
        ContractFieldType::Array(item_type) => format!(
            "Array.isArray(value.{name}) && value.{name}.every((item) => is{item_type}(item))"
        ),
    }
}

fn typescript_field_validation(name: &str, field_type: ContractFieldType) -> String {
    match field_type {
        ContractFieldType::String => format!("typeof value.{name} === \"string\""),
        ContractFieldType::Integer => {
            format!("typeof value.{name} === \"number\" && Number.isSafeInteger(value.{name})")
        }
        ContractFieldType::Array(item_type) => format!(
            "Array.isArray(value.{name}) && value.{name}.every((item) => is{item_type}(item))"
        ),
    }
}

fn write_outputs(outputs: &[(PathBuf, String)]) -> Result<(), String> {
    for (path, content) in outputs {
        let parent = path
            .parent()
            .ok_or_else(|| format!("generated output has no parent: {}", path.display()))?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
        fs::write(path, content)
            .map_err(|error| format!("failed to write {}: {error}", path.display()))?;
        println!("generated {}", path.display());
    }
    Ok(())
}

fn check_outputs(outputs: &[(PathBuf, String)]) -> Result<(), String> {
    let mut failures = Vec::new();
    for (path, expected) in outputs {
        match fs::read_to_string(path) {
            Ok(actual) if actual == *expected => {}
            Ok(_) => failures.push(format!("stale generated contract: {}", path.display())),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                failures.push(format!("missing generated contract: {}", path.display()));
            }
            Err(error) => failures.push(format!("failed to read {}: {error}", path.display())),
        }
    }

    if failures.is_empty() {
        println!("shared contract artifacts are current");
        Ok(())
    } else {
        Err(format!(
            "{}\nrun `npm run generate:shared-contracts` and commit the results",
            failures.join("\n")
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::{check_outputs, parse_mode, run_at_root, write_outputs, Mode, TYPESCRIPT_OUTPUT};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_directory(test_name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must follow Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "filament-manager-shared-contracts-{test_name}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("temporary directory must be created");
        path
    }

    #[test]
    fn parses_only_the_supported_modes() {
        assert_eq!(
            parse_mode(Vec::<String>::new().into_iter()).unwrap(),
            Mode::Write
        );
        assert_eq!(
            parse_mode(vec!["--check".to_string()].into_iter()).unwrap(),
            Mode::Check
        );
        assert!(parse_mode(vec!["--write".to_string()].into_iter()).is_err());
    }

    #[test]
    fn check_rejects_missing_and_stale_outputs() {
        let root = temporary_directory("stale");
        let output_path = root.join("nested/generated.ts");
        let outputs = vec![(output_path.clone(), "expected\n".to_string())];

        let missing_error = check_outputs(&outputs).expect_err("missing output must fail");
        assert!(missing_error.contains("missing generated contract"));

        write_outputs(&outputs).expect("write must create output and parent");
        check_outputs(&outputs).expect("fresh output must pass");

        fs::write(&output_path, "stale\n").expect("fixture must become stale");
        let stale_error = check_outputs(&outputs).expect_err("stale output must fail");
        assert!(stale_error.contains("stale generated contract"));

        fs::remove_dir_all(root).expect("temporary directory must be removed");
    }

    #[test]
    fn check_mode_rejects_missing_and_stale_generated_artifacts() {
        let root = temporary_directory("check-mode");

        let missing_error = run_at_root(vec!["--check".to_string()].into_iter(), &root)
            .expect_err("--check must reject missing artifacts");
        assert!(missing_error.contains("missing generated contract"));

        run_at_root(Vec::<String>::new().into_iter(), &root)
            .expect("write mode must create both generated artifacts");
        run_at_root(vec!["--check".to_string()].into_iter(), &root)
            .expect("--check must accept current artifacts");

        let typescript_path = root.join(TYPESCRIPT_OUTPUT);
        fs::write(&typescript_path, "stale\n").expect("fixture must become stale");
        let stale_error = run_at_root(vec!["--check".to_string()].into_iter(), &root)
            .expect_err("--check must reject stale artifacts");
        assert!(stale_error.contains("stale generated contract"));

        fs::remove_dir_all(root).expect("temporary directory must be removed");
    }
}
