import assert from "node:assert/strict";
import test from "node:test";
import { checkRegionOverlaps } from "./geometry.js";

test("checkRegionOverlaps reports overlap metrics for known rectangles", () => {
  const [overlap, separated] = checkRegionOverlaps({
    labels: ["panel", "badge", "footer"],
    regions: [
      {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      },
      {
        x: 5,
        y: 5,
        width: 10,
        height: 10,
      },
      {
        x: 30,
        y: 30,
        width: 5,
        height: 5,
      },
    ],
  });

  assert.equal(overlap?.overlaps, true);
  assert.deepEqual(overlap?.overlapRegion, {
    x: 5,
    y: 5,
    width: 5,
    height: 5,
  });
  assert.equal(overlap?.overlapArea, 25);
  assert.equal(overlap?.overlapRatioA, 0.25);
  assert.equal(separated?.overlaps, false);
});

test("checkRegionOverlaps validates labels and rectangle geometry", () => {
  assert.throws(() => {
    checkRegionOverlaps({
      labels: ["one"],
      regions: [
        {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
        {
          x: 2,
          y: 2,
          width: 1,
          height: 1,
        },
      ],
    });
  }, /labels/);

  assert.throws(() => {
    checkRegionOverlaps({
      regions: [
        {
          x: 0,
          y: 0,
          width: 0,
          height: 1,
        },
      ],
    });
  }, /positive finite/);
});
