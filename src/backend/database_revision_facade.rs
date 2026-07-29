use super::database_core::FilamentDatabase;
use super::database_result::InventoryResult;
use super::database_revision::{read_library_domain_revisions, LibraryDomainRevisions};

impl FilamentDatabase {
    pub fn library_domain_revisions(&self) -> InventoryResult<LibraryDomainRevisions> {
        read_library_domain_revisions(self.connection())
    }
}
