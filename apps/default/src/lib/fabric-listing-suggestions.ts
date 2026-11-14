type ListingFields = { materials: string; careInstructions: string };

/** Photo analysis is an estimate, and must never overwrite a maker's own text. */
export function applyFabricSuggestions(current: ListingFields, analysis: unknown): ListingFields {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return current;
  const result = analysis as Record<string, unknown>;
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const material = text(result.listingMaterialSuggestion) || text(result.fabricFamily);
  const care = Array.isArray(result.careConsiderations)
    ? Array.from(new Set(result.careConsiderations.map(text).filter(Boolean))).join('; ')
    : '';
  return {
    materials: current.materials.trim() || !material ? current.materials
      : `${material} (visual estimate — verify fiber content from label or supplier)`,
    careInstructions: current.careInstructions.trim() || !care ? current.careInstructions
      : `${care} (suggested care — verify garment label)`,
  };
}
