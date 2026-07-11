#[derive(Debug)]
pub enum InventoryError {
    Db(String),
    InvalidOperation { code: &'static str, message: String },
    NotFound,
}

pub type InventoryResult<T> = Result<T, InventoryError>;

impl From<rusqlite::Error> for InventoryError {
    fn from(error: rusqlite::Error) -> Self {
        InventoryError::Db(error.to_string())
    }
}

impl std::fmt::Display for InventoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InventoryError::Db(message) => write!(f, "Database error: {message}"),
            InventoryError::InvalidOperation { message, .. } => write!(f, "{message}"),
            InventoryError::NotFound => write!(f, "Record not found"),
        }
    }
}

impl std::error::Error for InventoryError {}

pub(crate) fn require_rows(affected: usize) -> InventoryResult<()> {
    if affected == 0 {
        Err(InventoryError::NotFound)
    } else {
        Ok(())
    }
}
