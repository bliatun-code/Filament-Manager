import test from "node:test";
import assert from "node:assert/strict";
import {
  inventoryCatalogRowStyle,
  inventoryCreatePreviewPanelStyle,
  inventorySwatchActionButtonStyle,
  inventorySwatchBorderColor,
  inventorySwatchCardStyle,
  inventorySwatchInteractiveInsetStyle,
  inventorySwatchInsetStyle,
  inventorySwatchPanelStyle,
} from "./inventory_swatch_style";

function srgbChannel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbaContrastAgainstWhite(raw: string): number {
  const channels = raw.match(/[\d.]+/g)?.map(Number) ?? [];
  assert.equal(channels.length, 4);
  const [red, green, blue, alpha] = channels;
  const composited = [red, green, blue].map(
    (channel) => alpha * channel + (1 - alpha) * 255,
  );
  const luminance =
    0.2126 * srgbChannel(composited[0]) +
    0.7152 * srgbChannel(composited[1]) +
    0.0722 * srgbChannel(composited[2]);
  return 1.05 / (luminance + 0.05);
}

test("inventorySwatchBorderColor keeps neutral and edge contrast fallbacks", () => {
  assert.equal(inventorySwatchBorderColor(null, "light"), "rgba(71, 85, 105, 0.68)");
  assert.equal(
    inventorySwatchBorderColor(null, "dark"),
    "var(--app-theme-data-neutral-border)",
  );
  assert.equal(inventorySwatchBorderColor("#FFFFFF", "light"), "rgba(71, 85, 105, 0.68)");
  assert.equal(inventorySwatchBorderColor("#FFFFFF", "dark"), "rgba(255, 255, 255, 0.4)");
  assert.equal(inventorySwatchBorderColor("#000000", "light"), "rgba(71, 85, 105, 0.68)");
  assert.equal(
    inventorySwatchBorderColor("#000000", "dark"),
    "var(--app-theme-data-neutral-border)",
  );
  assert.equal(inventorySwatchBorderColor("#2563EB", "light"), "rgba(71, 85, 105, 0.68)");
  assert.equal(inventorySwatchBorderColor("#2563EB", "dark"), "rgba(37, 99, 235, 0.4)");
});

test("light inventory swatch outline reaches non-text contrast against white", () => {
  const border = inventorySwatchBorderColor("#FFFFFF", "light");

  assert.ok(rgbaContrastAgainstWhite(border) >= 3);
});

test("inventory swatch surfaces preserve theme-specific base surfaces", () => {
  const lightCard = inventorySwatchCardStyle("#2563EB", "light");
  const lightWhitePanel = inventorySwatchPanelStyle("#FFFFFF", "light");

  assert.equal(lightCard.backgroundColor, "var(--app-theme-data-card-base)");
  assert.equal(lightCard.borderColor, "rgba(37, 99, 235, 0.28)");
  assert.equal(lightWhitePanel.borderColor, "rgba(148, 163, 184, 0.34)");
  assert.equal(
    inventorySwatchPanelStyle("#2563EB", "dark").backgroundColor,
    "var(--app-theme-data-panel-base)",
  );
  assert.match(lightCard.backgroundImage, /rgba\(37, 99, 235, 0\.065\)/);
  assert.match(
    inventorySwatchPanelStyle("#2563EB", "dark").backgroundImage,
    /rgba\(37, 99, 235, 0\.1\)/,
  );
});

test("interactive swatch inset adds selected and recent emphasis", () => {
  const selected = inventorySwatchInteractiveInsetStyle("#2563EB", "light", "selected");
  const recentLight = inventorySwatchInteractiveInsetStyle("#2563EB", "light", "recent");
  const recent = inventorySwatchInteractiveInsetStyle("#2563EB", "dark", "recent");

  assert.equal(selected.borderColor, "rgba(2, 132, 199, 0.94)");
  assert.match(selected.boxShadow, /rgba\(14, 165, 233, 0\.24\)/);
  assert.equal(recentLight.borderColor, "rgba(4, 120, 87, 0.82)");
  assert.ok(rgbaContrastAgainstWhite(recentLight.borderColor) >= 3);
  assert.equal(recent.borderColor, "rgba(52, 211, 153, 0.42)");
});

test("inventory catalog rows add semantic blue selected and hover emphasis in light mode", () => {
  const idle = inventoryCatalogRowStyle("#2563EB", false, "light");
  const hovered = inventoryCatalogRowStyle("#2563EB", false, "light", true);
  const selected = inventoryCatalogRowStyle("#2563EB", true, "light");
  const selectedDark = inventoryCatalogRowStyle("#2563EB", true, "dark");

  assert.equal(idle.borderColor, "rgba(37, 99, 235, 0.28)");
  assert.equal(hovered.borderColor, "rgba(2, 132, 199, 0.86)");
  assert.ok(rgbaContrastAgainstWhite(hovered.borderColor) >= 3);
  assert.match(hovered.boxShadow, /0 0 0 1px rgba\(14, 165, 233, 0\.22\)/);
  assert.equal(selected.borderColor, "rgba(2, 132, 199, 0.94)");
  assert.match(selected.boxShadow, /rgba\(14, 165, 233, 0\.24\)/);
  assert.equal(selectedDark.borderColor, "rgba(226, 232, 240, 0.54)");
  assert.match(selectedDark.boxShadow, /rgba\(226, 232, 240, 0\.12\)/);
});

test("filament action colors remain semantic across light, dark and composite swatches", () => {
  for (const color of ["#FFFFFF", "#000000", "#FF8000", "multi(#FFFFFF,#000000)"]) {
    for (const theme of ["light", "dark"] as const) {
      const style = inventorySwatchActionButtonStyle(color, theme);
      assert.equal(style.color, "var(--app-theme-primary-action-text)");
      assert.equal(style.background, "var(--app-theme-primary-action-background)");
    }
  }
});

test("white tinted text surfaces preserve AA even at their brightest gradient stop", () => {
  const luminance = (channels: number[]) => channels.map(srgbChannel).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  // Worst-case white swatch on all dark, Bambu and Prusa base surfaces.
  const bases = [[10,17,31],[8,15,29],[13,21,39],[5,23,22],[4,20,20],[6,27,25],[30,21,19],[27,19,18],[35,24,21]];
  for (const surface of [inventorySwatchCardStyle, inventorySwatchPanelStyle, inventorySwatchInsetStyle]) {
    const image = surface("#FFFFFF", "dark").backgroundImage;
    const alphas = [...image.matchAll(/rgba\(255, 255, 255, ([\d.]+)\)/g)].map(match => Number(match[1]));
    assert.ok(alphas.length > 0);
    for (const base of bases) for (const alpha of alphas) {
      const background = base.map(c => 255 * alpha + c * (1 - alpha));
      assert.ok((luminance([148,163,184]) + 0.05) / (luminance(background) + 0.05) >= 4.5);
    }
  }
});

test("inventory create preview panel adds stronger create emphasis", () => {
  assert.equal(inventoryCreatePreviewPanelStyle(null, "light"), undefined);
  const preview = inventoryCreatePreviewPanelStyle("#2563EB", "dark");
  const lightPreview = inventoryCreatePreviewPanelStyle("#FFFFFF", "light");
  assert.equal(preview?.borderColor, "rgba(37, 99, 235, 0.42)");
  assert.match(preview?.boxShadow ?? "", /rgba\(2, 6, 23, 0\.32\)/);
  assert.equal(lightPreview?.borderColor, "rgba(71, 85, 105, 0.68)");
});
