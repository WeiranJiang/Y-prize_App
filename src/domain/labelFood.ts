import { FoodDetails } from './food';
/** Read only explicit label evidence; zero added sugar does not imply zero total sugar. */
export function foodFromLabel(text: string): FoodDetails | null {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const sugar = text.match(/(?:^|\n)\s*(?:total\s+)?sugars?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  const hasIngredients = /ingredients?\s*:/i.test(text);
  if (!/nutrition|ingredients|sugars?\s*\d/i.test(text) || text.trim().length < 20) return null;
  const total = sugar ? Number(sugar[1].replace(',', '.')) : null;
  const namedSugar = /\b(sugar|sucrose|glucose syrup|corn syrup|honey|dextrose|molasses)\b/i.test(text.split(/ingredients?\s*:/i)[1] ?? '');
  const acid = /\b(citric acid|phosphoric acid|malic acid|tartaric acid|ascorbic acid)\b/i.test(text);
  const heading = lines.find(line => !/nutrition|facts|serving|energy|calories|fat|sodium|carbohydrate|protein|sugar|daily|ingredients|^\d|%/i.test(line) && line.length >= 4 && line.length <= 80);
  return {
    name: heading ?? 'Packaged food or drink',
    sugar: total != null ? (total > 0 ? 'yes' : 'no') : namedSugar ? 'yes' : 'unknown',
    acidic: acid ? 'yes' : 'unknown',
    sticky: 'unknown',
    note: [total != null ? (total > 0 ? 'Sugar is listed on the label.' : 'Label appears to list zero total sugars; check the text.') : 'Sugar content could not be confirmed.', acid ? 'An acid ingredient is listed; this does not measure the product’s pH.' : '', !hasIngredients ? 'Ingredients may not be visible.' : ''].filter(Boolean).join(' ').slice(0, 240),
  };
}
