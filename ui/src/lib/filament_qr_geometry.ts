type QrModuleGrid = { size: number; isReserved(row: number, column: number): number | boolean };
export type FilamentQrLogoPlate = { x: number; y: number; size: number };

export function findFilamentQrLogoPlate(grid: QrModuleGrid): FilamentQrLogoPlate | null {
  const boundedSize = Math.min(11, Math.floor(grid.size * 0.21));
  for (let size = boundedSize % 2 === 0 ? boundedSize - 1 : boundedSize;
       size >= 5; size -= 2) {
    const x = (grid.size - size) / 2;
    const y = x;
    if (!Number.isInteger(x)) continue;
    let clear = true;
    for (let row = y - 1; clear && row <= y + size; row++) {
      for (let column = x - 1; column <= x + size; column++) {
        if (grid.isReserved(row, column)) { clear = false; break; }
      }
    }
    if (clear) return { x, y, size };
  }
  return null;
}
