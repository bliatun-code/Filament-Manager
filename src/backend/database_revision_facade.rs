use super::database_core::FilamentDatabase;
use super::database_result::InventoryResult;
use super::database_revision::{
    bump_library_domain_revision, read_library_domain_revisions, LibraryDomainRevisions,
};

impl FilamentDatabase {
    pub fn library_domain_revisions(&self) -> InventoryResult<LibraryDomainRevisions> {
        read_library_domain_revisions(self.connection())
    }

    pub(crate) fn bump_library_domain_revision(&self, domain: &str) -> InventoryResult<()> {
        bump_library_domain_revision(self.connection(), domain)
    }
}
