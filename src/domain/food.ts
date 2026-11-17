export type FoodSignal = 'yes' | 'no' | 'unknown';
export type PhotoKind = 'meal' | 'label';
export interface FoodDetails {
  name: string;
  sugar: FoodSignal;
  acidic: FoodSignal;
  sticky: FoodSignal;
  note: string;
}
export interface FoodEntry extends FoodDetails {
  id: string;
  at: string;
  durationMinutes: number;
  durationAtLeast: boolean;
  source: 'manual' | PhotoKind;
  /** Small local JPEG thumbnail; never a remote URL or temporary file URI. */
  photo?: string;
}
export const EMPTY_FOOD: FoodDetails = { name: '', sugar: 'unknown', acidic: 'unknown', sticky: 'unknown', note: '' };
export function validFoodDetails(value: unknown): value is FoodDetails {
  if (!value || typeof value !== 'object') return false;
  const v = value as FoodDetails;
  return typeof v.name === 'string' && !!v.name.trim() && v.name.length <= 120 &&
    typeof v.note === 'string' && v.note.length <= 240 &&
    [v.sugar, v.acidic, v.sticky].every(signal => ['yes', 'no', 'unknown'].includes(signal));
}
export function validFoodEntry(value: unknown): value is FoodEntry {
  if (!validFoodDetails(value)) return false;
  const v = value as FoodEntry;
  return typeof v.id === 'string' && v.id.length > 0 && v.id.length <= 100 &&
    typeof v.at === 'string' && Number.isFinite(Date.parse(v.at)) &&
    Number.isInteger(v.durationMinutes) && v.durationMinutes >= 1 && v.durationMinutes <= 720 &&
    (v.photo === undefined || (typeof v.photo === 'string' && v.photo.length <= 250000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.photo))) &&
    typeof v.durationAtLeast === 'boolean' && ['manual', 'meal', 'label'].includes(v.source);
}
export function foodGuidance(food: FoodDetails): string {
  if (food.sugar === 'yes' || food.acidic === 'yes') return 'Eating or sipping over a longer period can extend sugar or acid exposure. Water afterward can help clear the mouth.';
  return 'How often and how long you eat or sip helps put your oral-health readings in context. A food log can’t diagnose tooth damage.';
}

export function foodSummary(food: FoodDetails): string {
  const describe = (label: string, value: FoodSignal) => `${label}: ${value === 'unknown' ? 'unsure' : value}`;
  return [describe('Sugar', food.sugar), describe('Acidic', food.acidic), describe('Sticky', food.sticky)].join(' · ');
}
