type QrModuleGrid = { size: number; isReserved(row: number, column: number): number | boolean };
export type FilamentQrLogoPlate = { x: number; y: number; size: number };

export function findFilamentQrLogoPlate(grid: QrModuleGrid): FilamentQrLogoPlate | null {
  const boundedSize = Math.min(11, Math.floor(grid.size * 0.21));
  for (let size = boundedSize % 2 === 0 ? boundedSize - 1 : boundedSize;
       size >= 5; size -= 2) {
    const candidates: Array<FilamentQrLogoPlate & { distance: number; horizontal: number }> = [];
    for (let y = 1; y < grid.size - size; y++) {
      for (let x = 1; x < grid.size - size; x++) {
        const dx = 2 * x + size - grid.size;
        const dy = 2 * y + size - grid.size;
        candidates.push({ x, y, size, distance: dx * dx + dy * dy, horizontal: Math.abs(dx) });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || b.y - a.y ||
      a.horizontal - b.horizontal || a.x - b.x);
    for (const { x, y } of candidates) {
      let clear = true;
      for (let row = y - 1; clear && row <= y + size; row++) {
        for (let column = x - 1; column <= x + size; column++) {
          if (grid.isReserved(row, column)) { clear = false; break; }
        }
      }
      if (clear) return { x, y, size };
    }
  }
  return null;
}
