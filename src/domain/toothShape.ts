/** Top-down crown outlines, normalized to [-1, 1] on both axes. */
export function toothShape(position: number): { outline: string; grooves: string } {
  if (position <= 2) {
    return {
      // Broad cutting edge and a narrower, gently scalloped lingual side.
      outline: 'M -.84 -.84 Q 0 -1.02 .84 -.84 Q 1 -.72 .92 -.34 L .65 .64 Q .45 .96 0 .9 Q -.45 .96 -.65 .64 L -.92 -.34 Q -1 -.72 -.84 -.84 Z',
      grooves: 'M -.65 -.42 Q 0 -.22 .65 -.42 M -.4 .3 Q 0 .55 .4 .3',
    };
  }
  if (position === 3) {
    return {
      outline: 'M 0 -.98 Q .3 -.9 .74 -.54 Q 1 -.24 .82 .25 Q .65 .84 .15 .96 Q -.35 1 -.72 .54 Q -1 .12 -.78 -.38 Q -.5 -.76 0 -.98 Z',
      grooves: 'M 0 -.6 Q -.2 -.08 0 .5 M -.45 .17 Q 0 -.08 .45 .17',
    };
  }
  if (position <= 5) {
    return {
      outline: 'M -.65 -.84 Q -.3 -1.02 0 -.86 Q .4 -1 .7 -.7 Q 1 -.3 .84 .08 Q 1 .55 .57 .85 Q .16 1.02 -.12 .85 Q -.6 1 -.85 .52 Q -1 .06 -.83 -.3 Q -.94 -.61 -.65 -.84 Z',
      grooves: 'M -.6 0 Q 0 -.22 .6 0 M 0 -.64 Q -.18 0 0 .64',
    };
  }
  return {
    // Four rounded cusps and a central fissure distinguish the molars.
    outline: 'M -.82 -.73 Q -.53 -1.02 -.12 -.85 Q .3 -1.02 .75 -.78 Q 1 -.57 .85 -.12 Q 1 .28 .8 .73 Q .5 1.02 .08 .85 Q -.35 1.02 -.78 .78 Q -1 .53 -.86 .08 Q -1 -.35 -.82 -.73 Z',
    grooves: 'M -.66 -.08 Q -.25 .12 0 0 Q .3 -.16 .66 .08 M -.08 -.65 Q .16 -.3 0 0 Q -.13 .3 .08 .65',
  };
}
