export type MaterialTone = {
  card: string;
  cardBorder: string;
  badge: string;
  badgeText: string;
  filterActive: string;
  filterInactive: string;
};

function normalizeMaterial(raw: string): string {
  return raw.trim().toUpperCase();
}

export function materialGroup(material: string): string {
  const upper = normalizeMaterial(material);
  if (upper.includes("PLA")) return "PLA";
  if (upper.includes("PETG")) return "PETG";
  if (upper.includes("ABS")) return "ABS";
  if (upper.includes("ASA")) return "ASA";
  if (upper.includes("TPU") || upper.includes("TPE")) return "TPU";
  if (upper.includes("PA") || upper.includes("NYLON")) return "PA";
  if (upper.includes("PC")) return "PC";
  return "OTHER";
}

const toneMap: Record<string, MaterialTone> = {
  PLA: {
    card: "bg-emerald-50/60 dark:bg-emerald-950/15",
    cardBorder: "border-emerald-200/80 dark:border-emerald-800/40",
    badge: "bg-emerald-100 dark:bg-emerald-900/35",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    filterActive:
      "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-900/35 dark:text-emerald-200",
    filterInactive:
      "border-emerald-200/60 bg-white text-emerald-700 dark:border-emerald-800/40 dark:bg-slate-900/50 dark:text-emerald-300",
  },
  PETG: {
    card: "bg-cyan-50/60 dark:bg-cyan-950/15",
    cardBorder: "border-cyan-200/80 dark:border-cyan-800/40",
    badge: "bg-cyan-100 dark:bg-cyan-900/35",
    badgeText: "text-cyan-700 dark:text-cyan-300",
    filterActive:
      "border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-600 dark:bg-cyan-900/35 dark:text-cyan-200",
    filterInactive:
      "border-cyan-200/60 bg-white text-cyan-700 dark:border-cyan-800/40 dark:bg-slate-900/50 dark:text-cyan-300",
  },
  ABS: {
    card: "bg-amber-50/60 dark:bg-amber-950/15",
    cardBorder: "border-amber-200/80 dark:border-amber-800/40",
    badge: "bg-amber-100 dark:bg-amber-900/35",
    badgeText: "text-amber-700 dark:text-amber-300",
    filterActive:
      "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/35 dark:text-amber-200",
    filterInactive:
      "border-amber-200/60 bg-white text-amber-700 dark:border-amber-800/40 dark:bg-slate-900/50 dark:text-amber-300",
  },
  ASA: {
    card: "bg-orange-50/60 dark:bg-orange-950/15",
    cardBorder: "border-orange-200/80 dark:border-orange-800/40",
    badge: "bg-orange-100 dark:bg-orange-900/35",
    badgeText: "text-orange-700 dark:text-orange-300",
    filterActive:
      "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-600 dark:bg-orange-900/35 dark:text-orange-200",
    filterInactive:
      "border-orange-200/60 bg-white text-orange-700 dark:border-orange-800/40 dark:bg-slate-900/50 dark:text-orange-300",
  },
  TPU: {
    card: "bg-violet-50/60 dark:bg-violet-950/15",
    cardBorder: "border-violet-200/80 dark:border-violet-800/40",
    badge: "bg-violet-100 dark:bg-violet-900/35",
    badgeText: "text-violet-700 dark:text-violet-300",
    filterActive:
      "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-600 dark:bg-violet-900/35 dark:text-violet-200",
    filterInactive:
      "border-violet-200/60 bg-white text-violet-700 dark:border-violet-800/40 dark:bg-slate-900/50 dark:text-violet-300",
  },
  PA: {
    card: "bg-fuchsia-50/60 dark:bg-fuchsia-950/15",
    cardBorder: "border-fuchsia-200/80 dark:border-fuchsia-800/40",
    badge: "bg-fuchsia-100 dark:bg-fuchsia-900/35",
    badgeText: "text-fuchsia-700 dark:text-fuchsia-300",
    filterActive:
      "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-800 dark:border-fuchsia-600 dark:bg-fuchsia-900/35 dark:text-fuchsia-200",
    filterInactive:
      "border-fuchsia-200/60 bg-white text-fuchsia-700 dark:border-fuchsia-800/40 dark:bg-slate-900/50 dark:text-fuchsia-300",
  },
  PC: {
    card: "bg-indigo-50/60 dark:bg-indigo-950/15",
    cardBorder: "border-indigo-200/80 dark:border-indigo-800/40",
    badge: "bg-indigo-100 dark:bg-indigo-900/35",
    badgeText: "text-indigo-700 dark:text-indigo-300",
    filterActive:
      "border-indigo-300 bg-indigo-100 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-900/35 dark:text-indigo-200",
    filterInactive:
      "border-indigo-200/60 bg-white text-indigo-700 dark:border-indigo-800/40 dark:bg-slate-900/50 dark:text-indigo-300",
  },
  OTHER: {
    card: "bg-slate-50/60 dark:bg-slate-900/30",
    cardBorder: "border-slate-200/80 dark:border-slate-700/60",
    badge: "bg-slate-100 dark:bg-slate-800/70",
    badgeText: "text-slate-700 dark:text-slate-200",
    filterActive:
      "border-slate-300 bg-slate-200 text-slate-800 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100",
    filterInactive:
      "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200",
  },
};

export function materialTone(material: string): MaterialTone {
  return toneMap[materialGroup(material)] ?? toneMap.OTHER;
}
