export type ParsedAppError = {
  code: string;
  safeDetail: string | null;
  diagnosticId: string | null;
};
export type ErrorTranslator = (key: string, fallback: string) => string;
export function parseAppError(error: unknown): ParsedAppError | null;
export function localizedAppError(
  error: unknown,
  translate: ErrorTranslator,
  fallback: string,
): string;
export function appErrorDiagnosticSummary(error: unknown): string;
