import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFilamentLabelQrDataUrl,
  buildFilamentLabelPngDataUrl,
  buildFilamentLabelTextLines,
} from "./filament_label_print";
import {
  DEFAULT_CUSTOM_FILAMENT_LABEL_DIMENSIONS,
  FILAMENT_LABEL_PROFILES,
  filamentLabelSize,
  filamentLabelSizeFilenameSuffix,
  filamentLabelPixelSize,
  filamentLabelProfile,
  minimumFilamentLabelWidthMm,
  resolveFilamentLabelSize,
  validateFilamentLabelDimensions,
} from "./filament_label_profiles";

test("filament label profiles include a full-height 24 mm P-Touch default", () => {
  assert.deepEqual(
    FILAMENT_LABEL_PROFILES.map(({ id, widthMm, heightMm }) => ({
      id,
      widthMm,
      heightMm,
    })),
    [
      { id: "ptouch-24", widthMm: 60, heightMm: 24 },
      { id: "compact", widthMm: 50, heightMm: 25 },
      { id: "standard", widthMm: 60, heightMm: 30 },
      { id: "expanded", widthMm: 75, heightMm: 40 },
    ],
  );
  assert.equal(filamentLabelProfile("ptouch-24").title, "P-Touch 24 mm");
  assert.deepEqual(filamentLabelPixelSize("ptouch-24"), {
    width: 709,
    height: 283,
  });
  assert.deepEqual(
    FILAMENT_LABEL_PROFILES.map(({ widthMm, heightMm }) =>
      validateFilamentLabelDimensions({ widthMm, heightMm }),
    ),
    FILAMENT_LABEL_PROFILES.map(({ widthMm, heightMm }) => ({
      valid: true,
      code: "valid",
      dimensions: { widthMm, heightMm },
    })),
  );
});

test("custom filament label dimensions enforce supported print and layout limits", () => {
  assert.deepEqual(validateFilamentLabelDimensions({ widthMm: 45, heightMm: 24 }), {
    valid: true,
    code: "valid",
    dimensions: { widthMm: 45, heightMm: 24 },
  });
  assert.deepEqual(validateFilamentLabelDimensions({ widthMm: 150, heightMm: 80 }), {
    valid: true,
    code: "valid",
    dimensions: { widthMm: 150, heightMm: 80 },
  });
  assert.equal(
    validateFilamentLabelDimensions({ widthMm: 44.5, heightMm: 24 }).code,
    "width-out-of-range",
  );
  assert.equal(
    validateFilamentLabelDimensions({ widthMm: 150.5, heightMm: 24 }).code,
    "width-out-of-range",
  );
  assert.equal(
    validateFilamentLabelDimensions({ widthMm: 45, heightMm: 23.5 }).code,
    "height-out-of-range",
  );
  assert.equal(
    validateFilamentLabelDimensions({ widthMm: 150, heightMm: 80.5 }).code,
    "height-out-of-range",
  );
  assert.equal(
    validateFilamentLabelDimensions({ widthMm: 45.25, heightMm: 24 }).code,
    "width-off-step",
  );
  assert.equal(
    validateFilamentLabelDimensions({ widthMm: 45, heightMm: 24.25 }).code,
    "height-off-step",
  );
  assert.deepEqual(validateFilamentLabelDimensions({ widthMm: 127.5, heightMm: 80 }), {
    valid: false,
    code: "width-too-small-for-height",
    minimumWidthMm: 128,
  });
  assert.equal(minimumFilamentLabelWidthMm(80), 128);
});

test("custom filament label sizes resolve to 300 DPI pixels and stable filenames", () => {
  assert.deepEqual(DEFAULT_CUSTOM_FILAMENT_LABEL_DIMENSIONS, {
    widthMm: 60,
    heightMm: 24,
  });
  assert.deepEqual(filamentLabelSize("custom", { widthMm: 70.5, heightMm: 30 }), {
    selectionId: "custom",
    widthMm: 70.5,
    heightMm: 30,
  });
  assert.deepEqual(resolveFilamentLabelSize("expanded"), {
    selectionId: "expanded",
    widthMm: 75,
    heightMm: 40,
  });
  assert.deepEqual(filamentLabelPixelSize({ widthMm: 45, heightMm: 24 }), {
    width: 531,
    height: 283,
  });
  assert.deepEqual(
    filamentLabelPixelSize({ selectionId: "custom", widthMm: 150, heightMm: 80 }),
    { width: 1772, height: 945 },
  );
  assert.equal(filamentLabelSizeFilenameSuffix("standard"), "standard");
  const customFilenameSuffix = filamentLabelSizeFilenameSuffix({
    widthMm: 70.5,
    heightMm: 30,
  });
  assert.equal(customFilenameSuffix, "custom-70p5x30mm");
  assert.match(customFilenameSuffix, /^[a-z0-9_-]+$/);
  assert.throws(
    () => filamentLabelPixelSize({ widthMm: 45, heightMm: 30 }),
    /width-too-small-for-height/,
  );
});

test("buildFilamentLabelQrDataUrl requests high-redundancy print options", async () => {
  let capturedPayload = "";
  let capturedOptions: Record<string, unknown> | null = null;
  const fakeEncoder = {
    async toDataURL(text: string, options?: Record<string, unknown>) {
      capturedPayload = text;
      capturedOptions = options ?? null;
      return "data:image/png;base64,qr";
    },
  };

  const dataUrl = await buildFilamentLabelQrDataUrl("v1:QR-22", fakeEncoder);

  assert.equal(dataUrl, "data:image/png;base64,qr");
  assert.equal(capturedPayload, "v1:QR-22");
  assert.equal(capturedOptions?.errorCorrectionLevel, "H");
  assert.equal(capturedOptions?.margin, 4);
  assert.equal(capturedOptions?.scale, 12);
  assert.equal(capturedOptions?.width, undefined);
  assert.deepEqual(capturedOptions?.color, {
    dark: "#000000",
    light: "#ffffff",
  });
});

test("label text puts vendor first and removes repeated Bambu material prefixes", () => {
  assert.deepEqual(
    buildFilamentLabelTextLines({
      vendor: "Bambu",
      material: "ABS",
      filamentName: "ABS",
      colorName: "ABS Tangerine Yellow (40402)",
      reference: "spool_1775592053186",
      qrDataUrl: "data:image/png;base64,qr",
    }),
    {
      vendor: "Bambu Lab",
      identityLines: ["Tangerine Yellow (40402)"],
      material: "ABS",
      reference: "#053186",
    },
  );
});

test("label text preserves a descriptive filament identity without duplicating its series", () => {
  assert.deepEqual(
    buildFilamentLabelTextLines({
      vendor: "eSUN",
      material: "PLA",
      filamentName: "ePLA-Matte",
      colorName: "ePLA-Matte · Morandi Purple",
      reference: "QR-22",
      qrDataUrl: "data:image/png;base64,qr",
    }),
    {
      vendor: "eSUN",
      identityLines: ["ePLA-Matte", "Morandi Purple"],
      material: "PLA",
      reference: "#QR-22",
    },
  );
});

test("label text keeps long Bambu and eSUN series on a separate identity line", () => {
  assert.deepEqual(
    buildFilamentLabelTextLines({
      vendor: "Bambu",
      material: "PLA",
      filamentName: "PLA Silk Multi-Color",
      colorName: "Dawn Radiance (13912)",
      reference: "spool_1780069566047",
      qrDataUrl: "data:image/png;base64,qr",
    }).identityLines,
    ["Silk Multi-Color", "Dawn Radiance (13912)"],
  );
  assert.deepEqual(
    buildFilamentLabelTextLines({
      vendor: "eSUN",
      material: "PLA",
      filamentName: "PLA-Twinkling (PLA-TK)",
      colorName: "Purple",
      reference: "spool_1775436489403",
      qrDataUrl: "data:image/png;base64,qr",
    }).identityLines,
    ["Twinkling (PLA-TK)", "Purple"],
  );
});

test("label text collapses identical generic filament and color names", () => {
  assert.deepEqual(
    buildFilamentLabelTextLines({
      vendor: "Generic",
      material: "PLA",
      filamentName: "Metal Silver",
      colorName: "Metal Silver",
      reference: "spool_1775560866203",
      qrDataUrl: "data:image/png;base64,qr",
    }).identityLines,
    ["Metal Silver"],
  );
});

test("PNG label rendering safely fits long accented product data", async () => {
  const drawnText: string[] = [];
  const context = {
    drawImage() {},
    fillRect() {},
    fillText(value: string) {
      drawnText.push(value);
    },
    font: "",
    fillStyle: "",
    imageSmoothingEnabled: true,
    measureText(value: string) {
      return { width: Array.from(value).length * 12 };
    },
    textBaseline: "alphabetic",
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => "data:image/png;base64,rendered",
  };

  const result = await buildFilamentLabelPngDataUrl(
    {
      vendor: "Éléments Génériques",
      material: "PLA-CF",
      filamentName: "Précision renforcée très longue série spéciale",
      colorName: "Brûlé d’été violet extrêmement détaillé (40402)",
      reference: "spool_1780069566047",
      qrDataUrl: "data:image/png;base64,qr",
    },
    "ptouch-24",
    {
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
      loadImage: async () => ({}) as CanvasImageSource,
    },
  );

  assert.equal(result, "data:image/png;base64,rendered");
  assert.equal(drawnText.length, 5);
  assert.ok(drawnText.every((line) => line.length > 0));
  assert.ok(drawnText.some((line) => /[Ééû]/.test(line)));
  assert.ok(drawnText.some((line) => line.endsWith("…")));
});

test("custom PNG rendering uses requested pixels and integer QR modules", async () => {
  const drawImageArguments: unknown[][] = [];
  const textBaselines: number[] = [];
  const context = {
    drawImage(...args: unknown[]) {
      drawImageArguments.push(args);
    },
    fillRect() {},
    fillText(_value: string, _x: number, baseline: number) {
      textBaselines.push(baseline);
    },
    font: "",
    fillStyle: "",
    imageSmoothingEnabled: true,
    measureText(value: string) {
      return { width: Array.from(value).length * 10 };
    },
    textBaseline: "alphabetic",
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => "data:image/png;base64,rendered",
  };
  const qrImage = { naturalWidth: 732, naturalHeight: 732 };

  await buildFilamentLabelPngDataUrl(
    {
      vendor: "Bambu",
      material: "PLA",
      filamentName: "PLA Basic",
      colorName: "Jade White",
      reference: "spool_1775592053186",
      qrDataUrl: "data:image/png;base64,qr",
    },
    { selectionId: "custom", widthMm: 150, heightMm: 80 },
    {
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
      loadImage: async () => qrImage as unknown as CanvasImageSource,
    },
  );

  assert.equal(canvas.width, 1772);
  assert.equal(canvas.height, 945);
  assert.deepEqual(drawImageArguments[0]?.slice(1), [15, 15, 915, 915]);
  assert.equal(context.imageSmoothingEnabled, false);
  assert.equal(textBaselines.length, 5);
  assert.ok(textBaselines.every((baseline) => baseline > 0 && baseline < canvas.height));
  assert.ok(textBaselines.every((baseline, index) => index === 0 || baseline > textBaselines[index - 1]!));
});
