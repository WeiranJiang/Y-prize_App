import type * as Mobilenet from '@tensorflow-models/mobilenet';
import type { FoodDetails, PhotoKind } from './food';
import { estimateFood } from './foodEstimates';
import { foodFromLabel } from './labelFood';

let model: Promise<Mobilenet.MobileNet> | undefined;
const FOOD_CLASSES = /pizza|cheeseburger|hotdog|hot dog|burrito|taco|bagel|pretzel|dough|bread|french loaf|croissant|waffle|pancake|ice cream|ice lolly|chocolate|candy|trifle|carbonara|spaghetti|potpie|meat loaf|guacamole|hummus|soup|salad|espresso|coffee|red wine|beer|eggnog|orange|lemon|banana|apple|strawberry|fig|pineapple|jackfruit|pomegranate|cucumber|artichoke|broccoli|cauliflower|bell pepper|mushroom|corn|cabbage|zucchini|squash|acorn|fruit|grape|crab|lobster|oyster|salmon|crayfish/i;

export async function readFoodPhoto(uri: string, kind: PhotoKind, progress: (message: string) => void): Promise<FoodDetails> {
  if (kind === 'label') {
    progress('Loading label reader…');
    const { createWorker } = await import('tesseract.js');
    const assets = new URL('/assets/food-reader/', window.location.origin).href;
    const worker = await createWorker('eng', 1, { workerPath: `${assets}worker.min.js`, corePath: assets, langPath: assets, logger: update => {
      if (update.status === 'recognizing text') progress('Reading the label…');
    } });
    try {
      const { data } = await worker.recognize(uri);
      const result = foodFromLabel(data.text);
      if (!result || data.confidence < 35) throw new Error('The label is hard to read. Try a closer, well-lit photo, or type the food name.');
      return result;
    } finally { await worker.terminate(); }
  }
  progress('Loading food reader…');
  if (!model) {
    model = (async () => {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      const mobilenet = await import('@tensorflow-models/mobilenet');
      return mobilenet.load({ version: 2, alpha: 0.5 });
    })();
    model.catch(() => { model = undefined; });
  }
  const net = await model;
  const image = new Image();
  image.src = uri;
  await image.decode();
  progress('Looking for recognizable foods…');
  const predictions = await net.classify(image, 3);
  const best = predictions[0];
  if (!best || best.probability < 0.2 || !FOOD_CLASSES.test(best.className)) throw new Error('I couldn’t identify this food confidently. Type a short name to finish the log.');
  const name = best.className.split(',')[0].replace(/_/g, ' ').trim();
  return estimateFood(name.charAt(0).toUpperCase() + name.slice(1));
}
