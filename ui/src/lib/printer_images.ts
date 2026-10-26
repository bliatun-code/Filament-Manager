import BambuA1MiniImage from "../assets/printers/bambu-a1-mini.png";
import BambuA1Image from "../assets/printers/bambu-a1.png";
import BambuA2LImage from "../assets/printers/bambu-a2l.png";
import BambuH2CImage from "../assets/printers/bambu-h2c.png";
import BambuH2DProImage from "../assets/printers/bambu-h2d-pro.png";
import BambuH2DImage from "../assets/printers/bambu-h2d.png";
import BambuH2SImage from "../assets/printers/bambu-h2s.png";
import BambuP1PImage from "../assets/printers/bambu-p1p.png";
import BambuP1SImage from "../assets/printers/bambu-p1s.png";
import BambuP2SImage from "../assets/printers/bambu-p2s.png";
import BambuX1CarbonImage from "../assets/printers/bambu-x1-carbon.png";
import BambuX1Image from "../assets/printers/bambu-x1.png";
import BambuX1EImage from "../assets/printers/bambu-x1e.png";
import BambuX2DImage from "../assets/printers/bambu-x2d.png";
import PrusaCoreoneImage from "../assets/printers/prusa-coreone.png";
import PrusaCoreonelImage from "../assets/printers/prusa-coreonel.png";
import PrusaCoreonemmu3Image from "../assets/printers/prusa-coreonemmu3.png";
import PrusaMiniImage from "../assets/printers/prusa-mini.png";
import PrusaMk35Mmu3Image from "../assets/printers/prusa-mk3.5mmu3.png";
import PrusaMk39Mmu3Image from "../assets/printers/prusa-mk3.9mmu3.png";
import PrusaMk35Image from "../assets/printers/prusa-mk35.png";
import PrusaMk39IsImage from "../assets/printers/prusa-mk39is.png";
import PrusaMk3SImage from "../assets/printers/prusa-mk3s.png";
import PrusaMk3Smmu3Image from "../assets/printers/prusa-mk3smmu3.png";
import PrusaMk4Image from "../assets/printers/prusa-mk4.png";
import PrusaMk4Ismmu3Image from "../assets/printers/prusa-mk4ismmu3.png";
import PrusaMk4SImage from "../assets/printers/prusa-mk4s.png";
import PrusaMk4Smmu3Image from "../assets/printers/prusa-mk4smmu3.png";
import PrusaXlImage from "../assets/printers/prusa-xl.png";
import PrusaXl2Image from "../assets/printers/prusa-xl2.png";
import PrusaXl5Image from "../assets/printers/prusa-xl5.png";
import imageCatalog from "./printer_image_catalog.json";
import imagePresentation from "./printer_image_presentation.json";
import BambuA1MiniCutout from "../assets/printers/bambu-a1-mini-cutout.png";
import BambuA1Cutout from "../assets/printers/bambu-a1-cutout.png";
import BambuH2DCutout from "../assets/printers/bambu-h2d-cutout.png";
import BambuP1PCutout from "../assets/printers/bambu-p1p-cutout.png";
import BambuP1SCutout from "../assets/printers/bambu-p1s-companion-cutout.png";
import BambuX1CarbonCutout from "../assets/printers/bambu-x1-carbon-cutout.png";
import BambuX1Cutout from "../assets/printers/bambu-x1-cutout.png";
import BambuX1ECutout from "../assets/printers/bambu-x1e-cutout.png";

const imageFiles: Record<string, string> = {
  "bambu-a1-mini-cutout.png": BambuA1MiniCutout,
  "bambu-a1-cutout.png": BambuA1Cutout,
  "bambu-h2d-cutout.png": BambuH2DCutout,
  "bambu-p1p-cutout.png": BambuP1PCutout,
  "bambu-p1s-companion-cutout.png": BambuP1SCutout,
  "bambu-x1-carbon-cutout.png": BambuX1CarbonCutout,
  "bambu-x1-cutout.png": BambuX1Cutout,
  "bambu-x1e-cutout.png": BambuX1ECutout,
  "bambu-a1-mini.png": BambuA1MiniImage,
  "bambu-a1.png": BambuA1Image,
  "bambu-a2l.png": BambuA2LImage,
  "bambu-h2c.png": BambuH2CImage,
  "bambu-h2d-pro.png": BambuH2DProImage,
  "bambu-h2d.png": BambuH2DImage,
  "bambu-h2s.png": BambuH2SImage,
  "bambu-p1p.png": BambuP1PImage,
  "bambu-p1s.png": BambuP1SImage,
  "bambu-p2s.png": BambuP2SImage,
  "bambu-x1-carbon.png": BambuX1CarbonImage,
  "bambu-x1.png": BambuX1Image,
  "bambu-x1e.png": BambuX1EImage,
  "bambu-x2d.png": BambuX2DImage,
  "prusa-coreone.png": PrusaCoreoneImage,
  "prusa-coreonel.png": PrusaCoreonelImage,
  "prusa-coreonemmu3.png": PrusaCoreonemmu3Image,
  "prusa-mini.png": PrusaMiniImage,
  "prusa-mk3.5mmu3.png": PrusaMk35Mmu3Image,
  "prusa-mk3.9mmu3.png": PrusaMk39Mmu3Image,
  "prusa-mk35.png": PrusaMk35Image,
  "prusa-mk39is.png": PrusaMk39IsImage,
  "prusa-mk3s.png": PrusaMk3SImage,
  "prusa-mk3smmu3.png": PrusaMk3Smmu3Image,
  "prusa-mk4.png": PrusaMk4Image,
  "prusa-mk4ismmu3.png": PrusaMk4Ismmu3Image,
  "prusa-mk4s.png": PrusaMk4SImage,
  "prusa-mk4smmu3.png": PrusaMk4Smmu3Image,
  "prusa-xl.png": PrusaXlImage,
  "prusa-xl2.png": PrusaXl2Image,
  "prusa-xl5.png": PrusaXl5Image,
};

export function printerImageFilename(model: string, hasMultiMaterial: boolean): string | null {
  const key = Object.keys(imageCatalog).find((name) => name.toLowerCase() === model.trim().toLowerCase());
  if (!key) return null;
  const entry = imageCatalog[key as keyof typeof imageCatalog];
  return hasMultiMaterial && "multi" in entry ? entry.multi : entry.single;
}

export function printerImageUrl(model: string, hasMultiMaterial: boolean): string | null {
  const filename = printerImageFilename(model, hasMultiMaterial);
  const presentation = filename ? imagePresentation[filename as keyof typeof imagePresentation] : null;
  return filename ? imageFiles[presentation?.file ?? filename] ?? null : null;
}

export function printerImageBounds(model: string, hasMultiMaterial: boolean) {
  const filename=printerImageFilename(model,hasMultiMaterial);
  return filename ? imagePresentation[filename as keyof typeof imagePresentation] ?? null : null;
}
