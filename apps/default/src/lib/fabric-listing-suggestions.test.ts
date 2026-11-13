import { expect, it } from 'vitest';
import { applyFabricSuggestions } from './fabric-listing-suggestions';
const blank = { materials: '', careInstructions: '' };
const analysis = { listingMaterialSuggestion: 'Possible cotton', fabricFamily: 'Woven fabric', careConsiderations: ['Hand wash cold', 'Lay flat to dry'] };
it('fills the dedicated fields and marks both suggestions as unverified', () => {
  const result = applyFabricSuggestions(blank, analysis);
  expect(result.materials).toBe('Possible cotton (visual estimate — verify fiber content from label or supplier)');
  expect(result.careInstructions).toBe('Hand wash cold; Lay flat to dry (suggested care — verify garment label)');
});
it('preserves maker text exactly while filling only the missing field', () => {
  const current = { materials: '  100% linen from supplier  ', careInstructions: '' };
  const result = applyFabricSuggestions(current, analysis);
  expect(result.materials).toBe(current.materials);
  expect(result.careInstructions).toContain('Hand wash cold');
  const care = { materials: '', careInstructions: 'Dry clean only' };
  expect(applyFabricSuggestions(care, analysis).careInstructions).toBe(care.careInstructions);
});
it('repeated application does not duplicate suggestions or overwrite later edits', () => {
  const first = applyFabricSuggestions(blank, analysis);
  expect(applyFabricSuggestions(first, analysis)).toEqual(first);
  const edited = { ...first, careInstructions: 'Machine washable per label' };
  expect(applyFabricSuggestions(edited, analysis)).toEqual(edited);
});
it('treats whitespace-only fields as empty and falls back to a usable fabric family', () => {
  expect(applyFabricSuggestions({ materials: '  ', careInstructions: '\n' }, { listingMaterialSuggestion: ' ', fabricFamily: 'Woven linen' }).materials).toContain('Woven linen');
});
it.each([null, undefined, 'cotton', [], {}, { listingMaterialSuggestion: {}, fabricFamily: 12, careConsiderations: [null, false, {}] }])('ignores unusable analysis without inventing material or care: %j', value => {
  expect(applyFabricSuggestions(blank, value)).toEqual(blank);
});
it('keeps only distinct nonblank text care suggestions', () => {
  const result = applyFabricSuggestions(blank, { careConsiderations: [' Hand wash ', null, 'Hand wash', {}, '', 'Dry flat'] });
  expect(result.materials).toBe('');
  expect(result.careInstructions).toBe('Hand wash; Dry flat (suggested care — verify garment label)');
});
