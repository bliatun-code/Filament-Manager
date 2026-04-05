export type UsageRecord = {
  material: string;
  colorName: string;
  usedGrams: number;
  windowDays: number;
};

export type SpoolSnapshot = {
  material: string;
  colorName: string;
  remainingGrams: number | null;
};

export type MasterEntry = {
  material: string;
  filamentName: string;
  colorName: string;
  productUrl?: string | null;
};

export type Recommendation = {
  material: string;
  colorName: string;
  reason: string;
  confidence: number;
  productUrl?: string | null;
};

type RecommendationContext = {
  usage: UsageRecord[];
  spools: SpoolSnapshot[];
  masterList: MasterEntry[];
};

export function generateRecommendations(
  context: RecommendationContext,
): Recommendation[] {
  const usageIndex = new Map<string, UsageRecord>();
  for (const record of context.usage) {
    usageIndex.set(key(record.material, record.colorName), record);
  }

  const masterIndex = new Map<string, MasterEntry>();
  for (const entry of context.masterList) {
    masterIndex.set(key(entry.material, entry.colorName), entry);
  }

  const recommendations: Recommendation[] = [];

  for (const spool of context.spools) {
    const usage = usageIndex.get(key(spool.material, spool.colorName));
    const remaining = spool.remainingGrams ?? 0;
    const usagePerDay = usage ? usage.usedGrams / usage.windowDays : 0;
    const daysLeft = usagePerDay > 0 ? remaining / usagePerDay : 999;

    if (remaining < 200 || daysLeft < 10) {
      const confidence = Math.min(0.95, 0.45 + (200 - remaining) / 300);
      const master = masterIndex.get(key(spool.material, spool.colorName));
      recommendations.push({
        material: spool.material,
        colorName: spool.colorName,
        reason:
          remaining < 200
            ? "Low stock below 200g"
            : "Projected to run out within 10 days",
        confidence,
        productUrl: master?.productUrl ?? null,
      });
    }
  }

  recommendations.sort((first, second) => second.confidence - first.confidence);
  return recommendations;
}

function key(material: string, colorName: string): string {
  return `${material.toLowerCase()}::${colorName.toLowerCase()}`;
}
