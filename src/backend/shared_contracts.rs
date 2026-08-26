use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ContractFieldType {
    String,
    Integer,
    Array(&'static str),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ContractField {
    pub name: &'static str,
    pub field_type: ContractFieldType,
}

#[derive(Clone, Copy)]
pub struct EnumContract {
    pub name: &'static str,
    pub serialized_values: &'static [&'static str],
    serialize_values: fn() -> Result<Vec<String>, String>,
}

#[derive(Clone, Copy)]
pub struct DtoContract {
    pub name: &'static str,
    pub fields: &'static [ContractField],
    serialize_sample: fn() -> Result<Value, String>,
}

#[derive(Clone, Copy)]
pub struct SharedContractManifest {
    pub enums: &'static [EnumContract],
    pub dtos: &'static [DtoContract],
}

macro_rules! define_contract_enum {
    (
        pub enum $name:ident {
            $(
                $variant:ident => $serialized:literal
            ),+ $(,)?
        }
    ) => {
        #[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
        pub enum $name {
            $(
                #[serde(rename = $serialized)]
                $variant,
            )+
        }

        impl $name {
            pub const ALL: &'static [Self] = &[
                $(Self::$variant,)+
            ];

            pub const SERIALIZED_VALUES: &'static [&'static str] = &[
                $($serialized,)+
            ];

            pub const CONTRACT: EnumContract = EnumContract {
                name: stringify!($name),
                serialized_values: Self::SERIALIZED_VALUES,
                serialize_values: Self::serialize_contract_values,
            };

            pub const fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $serialized,)+
                }
            }

            fn serialize_contract_values() -> Result<Vec<String>, String> {
                Self::ALL
                    .iter()
                    .map(|value| {
                        serde_json::to_value(value)
                            .map_err(|error| error.to_string())?
                            .as_str()
                            .map(str::to_owned)
                            .ok_or_else(|| {
                                format!(
                                    "{} must serialize to a JSON string",
                                    stringify!($name)
                                )
                            })
                    })
                    .collect()
            }
        }
    };
}

macro_rules! contract_rust_type {
    (string) => {
        String
    };
    (integer) => {
        i64
    };
    (array($inner:ident)) => {
        Vec<$inner>
    };
}

macro_rules! contract_field_type {
    (string) => {
        ContractFieldType::String
    };
    (integer) => {
        ContractFieldType::Integer
    };
    (array($inner:ident)) => {
        ContractFieldType::Array(stringify!($inner))
    };
}

macro_rules! contract_sample_value {
    (string) => {
        "contract-sample".to_string()
    };
    (integer) => {
        1_i64
    };
    (array($inner:ident)) => {
        vec![$inner::contract_sample()]
    };
}

macro_rules! define_contract_struct {
    (
        pub struct $name:ident {
            $(
                $(#[$field_attribute:meta])*
                $field:ident: $kind:ident $(($inner:ident))?
            ),+ $(,)?
        }
    ) => {
        #[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
        pub struct $name {
            $(
                $(#[$field_attribute])*
                pub $field: contract_rust_type!($kind $(($inner))?),
            )+
        }

        impl $name {
            pub const CONTRACT: DtoContract = DtoContract {
                name: stringify!($name),
                fields: &[
                    $(
                        ContractField {
                            name: stringify!($field),
                            field_type: contract_field_type!($kind $(($inner))?),
                        },
                    )+
                ],
                serialize_sample: Self::serialize_contract_sample,
            };

            fn contract_sample() -> Self {
                Self {
                    $($field: contract_sample_value!($kind $(($inner))?),)+
                }
            }

            fn serialize_contract_sample() -> Result<Value, String> {
                serde_json::to_value(Self::contract_sample()).map_err(|error| error.to_string())
            }
        }
    };
}

define_contract_enum! {
    pub enum OwnershipType {
        Owned => "OWNED",
        BorrowedIn => "BORROWED_IN",
    }
}

define_contract_enum! {
    pub enum SpoolStatus {
        InStock => "IN_STOCK",
        Assigned => "ASSIGNED",
        Borrowed => "BORROWED",
        Empty => "EMPTY",
        Lost => "LOST",
        Missing => "MISSING",
        Deleted => "DELETED",
    }
}

define_contract_enum! {
    pub enum LoanDirection {
        Outbound => "OUTBOUND",
        Inbound => "INBOUND",
    }
}

define_contract_enum! {
    pub enum LoanStatus {
        Active => "ACTIVE",
        Returned => "RETURNED",
        Lost => "LOST",
        Cancelled => "CANCELLED",
    }
}

define_contract_struct! {
    pub struct LowStockMaterialOverride {
        #[serde(default)]
        material_key: string,
        material: string,
        threshold_g: integer,
    }
}

define_contract_struct! {
    pub struct LowStockPolicy {
        default_threshold_g: integer,
        #[serde(default)]
        material_overrides: array(LowStockMaterialOverride),
    }
}

const ENUM_CONTRACTS: &[EnumContract] = &[
    SpoolStatus::CONTRACT,
    OwnershipType::CONTRACT,
    LoanDirection::CONTRACT,
    LoanStatus::CONTRACT,
];

const DTO_CONTRACTS: &[DtoContract] =
    &[LowStockMaterialOverride::CONTRACT, LowStockPolicy::CONTRACT];

pub const SHARED_CONTRACT_MANIFEST: SharedContractManifest = SharedContractManifest {
    enums: ENUM_CONTRACTS,
    dtos: DTO_CONTRACTS,
};

pub fn validate_shared_contract_manifest() -> Result<(), String> {
    for contract in SHARED_CONTRACT_MANIFEST.enums {
        let serialized_values = (contract.serialize_values)()?;
        let expected_values = contract
            .serialized_values
            .iter()
            .map(|value| (*value).to_string())
            .collect::<Vec<_>>();
        if serialized_values != expected_values {
            return Err(format!(
                "{} serde values {:?} do not match contract values {:?}",
                contract.name, serialized_values, expected_values
            ));
        }
    }

    for contract in SHARED_CONTRACT_MANIFEST.dtos {
        validate_dto_sample(contract, &(contract.serialize_sample)()?)?;
    }

    Ok(())
}

fn validate_dto_sample(contract: &DtoContract, sample: &Value) -> Result<(), String> {
    let object = sample
        .as_object()
        .ok_or_else(|| format!("{} must serialize to a JSON object", contract.name))?;
    if object.len() != contract.fields.len() {
        return Err(format!(
            "{} serde fields do not match its generated contract fields",
            contract.name
        ));
    }

    for field in contract.fields {
        let value = object.get(field.name).ok_or_else(|| {
            format!(
                "{} serde output is missing contract field {}",
                contract.name, field.name
            )
        })?;
        let valid = match field.field_type {
            ContractFieldType::String => value.is_string(),
            ContractFieldType::Integer => value.as_i64().is_some(),
            ContractFieldType::Array(item_type) => value.as_array().is_some_and(|items| {
                SHARED_CONTRACT_MANIFEST
                    .dtos
                    .iter()
                    .find(|candidate| candidate.name == item_type)
                    .is_some_and(|item_contract| {
                        items
                            .iter()
                            .all(|item| validate_dto_sample(item_contract, item).is_ok())
                    })
            }),
        };
        if !valid {
            return Err(format!(
                "{}.{} serde type does not match its generated contract type",
                contract.name, field.name
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        validate_shared_contract_manifest, LoanDirection, LoanStatus, OwnershipType, SpoolStatus,
        SHARED_CONTRACT_MANIFEST,
    };

    #[test]
    fn serde_tokens_and_dto_shapes_match_the_shared_contract_manifest() {
        validate_shared_contract_manifest().expect("shared contract manifest must be valid");

        assert_eq!(
            SHARED_CONTRACT_MANIFEST.enums[0].serialized_values,
            SpoolStatus::SERIALIZED_VALUES
        );
        assert_eq!(
            serde_json::to_string(&OwnershipType::Owned).unwrap(),
            "\"OWNED\""
        );
        assert_eq!(
            serde_json::to_string(&LoanDirection::Inbound).unwrap(),
            "\"INBOUND\""
        );
        assert_eq!(
            serde_json::to_string(&LoanStatus::Cancelled).unwrap(),
            "\"CANCELLED\""
        );
    }
}
