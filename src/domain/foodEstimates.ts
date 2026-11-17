import { EMPTY_FOOD, type FoodDetails, type FoodSignal } from './food';

/** Typical-food estimates after recognition, not ingredient analysis or measured pH. */
export function estimateFood(name: string): FoodDetails {
  const text = name.toLowerCase().replace(/[_-]/g, ' ');
  let sugar: FoodSignal = 'unknown', acidic: FoodSignal = 'unknown', sticky: FoodSignal = 'unknown';
  const sweet = /\b(sugar|sweetened|candy|caramel|toffee|gummy|gummies|chocolate|cake|cookie|biscuit|ice cream|ice lolly|sorbet|jam|honey|syrup|trifle|doughnut|donut|eggnog)\b/.test(text);
  const fruit = /\b(apple|orange|lemon|lime|grape|strawberry|pineapple|pomegranate|fruit|banana|fig|raisin|date|jackfruit)\b/.test(text);
  const acid = /\b(soda|cola|soft drink|energy drink|sports drink|juice|lemon|lime|orange|pineapple|grapefruit|sour candy|vinegar|pickle|wine|tomato)\b/.test(text);
  const tacky = /\b(caramel|toffee|gummy|gummies|raisin|dried fruit|date|bagel|pretzel|bread|toast|cracker|croissant|cookie|biscuit|waffle|pancake|doughnut|donut)\b/.test(text);
  const plainProtein = /\b(egg|chicken|beef|steak|salmon|fish|crab|lobster|oyster|shrimp|cheese)\b/.test(text) && !/\b(sauce|glaze|sweet|breaded|sandwich|burger|pizza|taco|burrito)\b/.test(text);
  const vegetable = /\b(broccoli|cauliflower|cucumber|cabbage|zucchini|mushroom|artichoke)\b/.test(text);
  if (sweet || fruit) sugar = 'yes';
  if (acid) acidic = 'yes';
  if (tacky) sticky = 'yes';
  if (plainProtein || vegetable || /\bplain water\b/.test(text)) {
    if (!sweet && !fruit) sugar = 'no';
    if (!acid) acidic = 'no';
    if (!tacky) sticky = 'no';
  }
  if (/\b(coffee|espresso|tea|beer|wine|juice|soda|cola|water|drink)\b/.test(text) && !tacky) sticky = 'no';
  // A sugar-free product may still contain naturally occurring sugars or be acidic.
  if (/\b(sugar free|no added sugar|unsweetened)\b/.test(text)) sugar = 'unknown';
  return { ...EMPTY_FOOD, name, sugar, acidic, sticky,
    note: 'Estimated from the food name and typical preparation, not measured. Ingredients and added sugar may differ; unsure means there is not enough evidence. Review and edit.' };
}
