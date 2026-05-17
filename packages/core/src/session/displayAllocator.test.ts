import test from "node:test";
import assert from "node:assert/strict";
import { DisplayAllocator } from "./displayAllocator.js";

test("DisplayAllocator skips displays reported as in use", async () => {
  const allocator = new DisplayAllocator({
    min: 90,
    max: 91,
    isDisplayInUse: (displayNumber) => displayNumber === 90
  });

  const allocated = await allocator.allocate();

  assert.equal(allocated.number, 91);
  assert.equal(allocated.value, ":91");
  assert.equal(allocator.isReserved(91), true);
});

test("DisplayAllocator releases displays for reuse", async () => {
  const allocator = new DisplayAllocator({
    min: 90,
    max: 90,
    isDisplayInUse: () => false
  });

  const first = await allocator.allocate();
  assert.equal(first.number, 90);

  await assert.rejects(() => allocator.allocate(), /No available X display/);

  allocator.release(90);
  const second = await allocator.allocate();
  assert.equal(second.number, 90);
});
