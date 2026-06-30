import test from "node:test";
import assert from "node:assert/strict";
import {
  inventoryCatalogRowStyle,
  inventoryCreatePreviewPanelStyle,
  inventorySwatchActionButtonStyle,
  inventorySwatchBorderColor,
  inventorySwatchCardStyle,
  inventorySwatchInteractiveInsetStyle,
  inventorySwatchPanelStyle,
} from "./inventory_swatch_style";

test("inventorySwatchBorderColor keeps neutral and edge contrast fallbacks", () => {
  assert.equal(inventorySwatchBorderColor(null, "light"), "rgba(203, 213, 225, 0.28)");
  assert.equal(inventorySwatchBorderColor(null, "dark"), "rgba(203, 213, 225, 0.4)");
  assert.equal(inventorySwatchBorderColor("#FFFFFF", "light"), "rgba(148, 163, 184, 0.34)");
  assert.equal(inventorySwatchBorderColor("#FFFFFF", "dark"), "rgba(255, 255, 255, 0.4)");
  assert.equal(inventorySwatchBorderColor("#000000", "light"), "rgba(71, 85, 105, 0.34)");
  assert.equal(inventorySwatchBorderColor("#000000", "dark"), "rgba(148, 163, 184, 0.34)");
});

test("inventory swatch surfaces preserve theme-specific base surfaces", () => {
  assert.equal(
    inventorySwatchCardStyle("#2563EB", "light").backgroundColor,
    "rgba(252, 254, 255, 0.95)",
  );
  assert.equal(
    inventorySwatchPanelStyle("#2563EB", "dark").backgroundColor,
    "rgb(8, 15, 29)",
  );
});

test("interactive swatch inset adds selected and recent emphasis", () => {
  const selected = inventorySwatchInteractiveInsetStyle("#2563EB", "light", "selected");
  const recent = inventorySwatchInteractiveInsetStyle("#2563EB", "dark", "recent");

  assert.match(selected.boxShadow, /rgba\(15, 23, 42, 0\.08\)/);
  assert.equal(recent.borderColor, "rgba(52, 211, 153, 0.42)");
});

test("inventory catalog rows add neutral selected emphasis", () => {
  const idle = inventoryCatalogRowStyle("#2563EB", false, "light");
  const hovered = inventoryCatalogRowStyle("#2563EB", false, "light", true);
  const selected = inventoryCatalogRowStyle("#2563EB", true, "dark");

  assert.equal(idle.borderColor, "rgba(37, 99, 235, 0.28)");
  assert.equal(hovered.borderColor, "rgba(255, 255, 255, 0.98)");
  assert.match(hovered.boxShadow, /0 0 0 1px rgba\(255, 255, 255, 0\.96\)/);
  assert.equal(selected.borderColor, "rgba(226, 232, 240, 0.54)");
  assert.match(selected.boxShadow, /rgba\(226, 232, 240, 0\.12\)/);
});

test("inventory swatch action buttons derive contrast from the swatch", () => {
  assert.equal(inventorySwatchActionButtonStyle("#F8FAFC", "light").color, "#0F172A");
  assert.equal(inventorySwatchActionButtonStyle("#0F172A", "dark").color, "#FFFFFF");
});

test("inventory create preview panel adds stronger create emphasis", () => {
  assert.equal(inventoryCreatePreviewPanelStyle(null, "light"), undefined);
  const preview = inventoryCreatePreviewPanelStyle("#2563EB", "dark");
  assert.equal(preview?.borderColor, "rgba(37, 99, 235, 0.42)");
  assert.match(preview?.boxShadow ?? "", /rgba\(2, 6, 23, 0\.32\)/);
});
