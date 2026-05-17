export type MeasuredWeightUpdatePlan =
  | {
      kind: "usage";
      usedGrams: number;
      jobName: string | null;
    }
  | {
      kind: "weight";
      measuredTotalWeight: number;
    }
  | {
      kind: "none";
    };

export function buildMeasuredWeightUpdatePlan({
  previousRemaining,
  measuredTotalWeight,
  tareWeight,
  jobName,
}: {
  previousRemaining: number | null | undefined;
  measuredTotalWeight: number;
  tareWeight: number;
  jobName?: string | null;
}): MeasuredWeightUpdatePlan {
  const safeMeasuredTotal = Math.max(0, Math.round(measuredTotalWeight));
  const safeTareWeight = Math.max(0, Math.round(tareWeight));
  const measuredFilament = Math.max(0, safeMeasuredTotal - safeTareWeight);

  if (previousRemaining == null || !Number.isFinite(previousRemaining)) {
    return { kind: "weight", measuredTotalWeight: safeMeasuredTotal };
  }

  const baseline = Math.max(0, Math.round(previousRemaining));
  const usedGrams = Math.max(0, baseline - measuredFilament);
  if (usedGrams > 0) {
    return {
      kind: "usage",
      usedGrams,
      jobName: jobName?.trim() ? jobName.trim() : null,
    };
  }

  if (measuredFilament !== baseline) {
    return { kind: "weight", measuredTotalWeight: safeMeasuredTotal };
  }

  return { kind: "none" };
}
