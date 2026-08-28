pub(crate) type MasterCatalogExistingRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    i64,
    String,
);

pub struct ManualMasterInput<'a> {
    pub material: &'a str,
    pub filament_name: &'a str,
    pub color_name: &'a str,
    pub hex_color: Option<&'a str>,
    pub product_url: Option<&'a str>,
    pub vendor: Option<&'a str>,
    pub default_weight: Option<i64>,
}

pub struct SourceCatalogEntryInput<'a> {
    pub material: &'a str,
    pub filament_name: &'a str,
    pub color_name: &'a str,
    pub hex_color: Option<&'a str>,
    pub product_url: &'a str,
    pub default_weight: i64,
}

pub struct MasterCatalogUpdateInput<'a> {
    pub master_id: &'a str,
    pub material: &'a str,
    pub filament_name: &'a str,
    pub color_name: &'a str,
    pub hex_color: Option<&'a str>,
    pub product_url: Option<&'a str>,
    pub vendor: Option<&'a str>,
    pub default_weight: Option<i64>,
}
