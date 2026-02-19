export interface TrustScoreInput {
  extractionConfidence: number;
  sourceAuthority: number;
  sourceCount: number;
  corroborationCount: number;
  citationCount: number;
  openQuestionCount: number;
  totalQuestionCount: number;
  hasConflict: boolean;
}

/**
 * Compute a trust score for a fact based on multiple signals.
 * Returns a value clamped to [0, 1].
 */
export function computeTrustScore(input: TrustScoreInput): number {
  // Base: extraction confidence weighted by source authority
  const base = input.extractionConfidence * input.sourceAuthority;

  // Source diversity boost: more sources = higher trust (diminishing returns)
  const sourceBoost =
    input.sourceCount > 1
      ? Math.min(
          0.15,
          ((input.sourceCount - 1) * 0.05) /
            (1 + (input.sourceCount - 1) * 0.2)
        )
      : 0;

  // Corroboration boost: independent confirmations (log scale)
  const corroborationBoost =
    input.corroborationCount > 0
      ? Math.min(0.1, 0.05 * Math.log2(1 + input.corroborationCount))
      : 0;

  // Citation boost: usage by humans/agents
  const citationBoost = Math.min(0.2, input.citationCount * 0.02);

  // Question penalties
  const openQuestionPenalty = input.openQuestionCount * 0.1;
  const resolvedQuestionPenalty =
    (input.totalQuestionCount - input.openQuestionCount) * 0.01;

  // Conflict penalty
  const conflictPenalty = input.hasConflict ? 0.3 : 0;

  const score =
    base +
    sourceBoost +
    corroborationBoost +
    citationBoost -
    openQuestionPenalty -
    resolvedQuestionPenalty -
    conflictPenalty;

  return Math.max(0, Math.min(1, score));
}

/**
 * Map a source type to an authority weight.
 */
export function getSourceAuthority(
  sourceType:
    | 'direct_entry'
    | 'text_input'
    | 'document_upload'
    | 'image_upload'
    | 'url'
    | 'google_doc'
): number {
  const authorityMap: Record<string, number> = {
    direct_entry: 0.9,
    text_input: 0.8,
    google_doc: 0.75,
    document_upload: 0.7,
    url: 0.6,
    image_upload: 0.5,
  };
  return authorityMap[sourceType] ?? 0.5;
}

/** Trust score threshold for auto-approval. */
export const AUTO_APPROVE_THRESHOLD = 0.7;
