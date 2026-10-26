# Printer artwork background audit — 2026-10-26

Release preparation update: all eight original thumbnails with light frames now
have separate transparent derivatives, shared by desktop and Companion. The
original files below remain unchanged. Shared content bounds frame all 31
source variants consistently, and the generation check rejects missing alpha or
a light opaque frame in the selected presentation asset.

Processing prompts, output hashes and source/license references are recorded in
`ui/src/assets/printers/companion-derivatives.json`. These are AI-processed
illustrations based on official thumbnails, not untouched manufacturer photos.

Read-only analysis of the bundled PNG pixels. Original upstream files and licenses are unchanged. A light frame is detected when samples near all four corners (5% inset) are opaque, light and nearly neutral. Transparent pixels and approximate visible bounds are also inspected; these are review signals, not a substitute for viewing the image.

The table records the original-file audit that identified the eight required
derivatives. Prefer official transparent assets for future imports; otherwise
create and review a separate derivative with its source, license and processing
recorded. Generative processing may change small hardware details.

| Asset | Pixels | Transparent pixels | Opaque light frame | Approx. subject width / height |
|---|---:|---:|---|---:|
| bambu-a1-mini.png | 180 × 180 | 0 | Review needed | 51% / 68% |
| bambu-a1.png | 180 × 180 | 712 | Review needed | 62% / 76% |
| bambu-a2l.png | 344 × 344 | 87328 | No | 89% / 96% |
| bambu-h2c.png | 354 × 354 | 78061 | No | 62% / 64% |
| bambu-h2d-pro.png | 180 × 180 | 20768 | No | 61% / 63% |
| bambu-h2d.png | 180 × 180 | 0 | Review needed | 61% / 63% |
| bambu-h2s.png | 180 × 180 | 20592 | No | 61% / 64% |
| bambu-p1p.png | 180 × 180 | 0 | Review needed | 66% / 66% |
| bambu-p1s.png | 180 × 180 | 359 | Review needed | 63% / 63% |
| bambu-p2s.png | 354 × 354 | 73675 | No | 66% / 68% |
| bambu-x1-carbon.png | 181 × 180 | 180 | Review needed | 64% / 64% |
| bambu-x1e.png | 180 × 180 | 0 | Review needed | 64% / 63% |
| bambu-x1.png | 180 × 180 | 0 | Review needed | 65% / 64% |
| bambu-x2d.png | 354 × 354 | 74400 | No | 66% / 68% |
| prusa-coreone.png | 180 × 256 | 10959 | No | 99% / 82% |
| prusa-coreonemmu3.png | 180 × 256 | 14176 | No | 95% / 87% |
| prusa-coreonel.png | 190 × 256 | 8538 | No | 99% / 88% |
| prusa-mk4s.png | 180 × 256 | 19363 | No | 100% / 100% |
| prusa-mk4smmu3.png | 180 × 256 | 23919 | No | 100% / 98% |
| prusa-mk4.png | 180 × 256 | 23519 | No | 98% / 100% |
| prusa-mk4ismmu3.png | 180 × 256 | 23746 | No | 99% / 100% |
| prusa-mk39is.png | 180 × 256 | 19645 | No | 99% / 100% |
| prusa-mk3.9mmu3.png | 180 × 256 | 23746 | No | 99% / 100% |
| prusa-mk35.png | 180 × 256 | 20342 | No | 100% / 99% |
| prusa-mk3.5mmu3.png | 180 × 255 | 25236 | No | 99% / 93% |
| prusa-mini.png | 180 × 256 | 34244 | No | 96% / 79% |
| prusa-mk3s.png | 180 × 256 | 20922 | No | 98% / 98% |
| prusa-mk3smmu3.png | 180 × 256 | 27086 | No | 93% / 91% |
| prusa-xl.png | 180 × 256 | 22723 | No | 98% / 87% |
| prusa-xl2.png | 180 × 256 | 22235 | No | 96% / 93% |
| prusa-xl5.png | 180 × 256 | 20196 | No | 99% / 93% |
| bambu-p1s-companion-cutout.png | 1254 × 1254 | 616335 | No | 81% / 79% |
