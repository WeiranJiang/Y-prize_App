import type { FoodDetails, PhotoKind } from './food';
/** Native builds can keep logging manually; the web demo includes local photo reading. */
export async function readFoodPhoto(_uri: string, _kind: PhotoKind, _progress: (message: string) => void): Promise<FoodDetails> {
  throw new Error('Photo suggestions are available in the web demo. You can still take a photo here and type the food name.');
}
