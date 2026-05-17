import { join } from "node:path";
import type { DisplayNumberRange } from "../types.js";
import { pathExists } from "../utils/fs.js";

export interface AllocatedDisplay {
  readonly number: number;
  readonly value: string;
}

export interface DisplayAllocatorOptions {
  readonly min?: number;
  readonly max?: number;
  readonly isDisplayInUse?: (displayNumber: number) => boolean | Promise<boolean>;
}

export class DisplayAllocator {
  private readonly activeDisplays = new Set<number>();
  private readonly min: number;
  private readonly max: number;
  private readonly isDisplayInUse: (displayNumber: number) => boolean | Promise<boolean>;

  constructor(options: DisplayAllocatorOptions = {}) {
    this.min = options.min ?? 90;
    this.max = options.max ?? 199;
    this.isDisplayInUse = options.isDisplayInUse ?? defaultIsDisplayInUse;

    if (this.min > this.max) {
      throw new Error("Display allocator minimum cannot be greater than maximum.");
    }
  }

  async allocate(range?: DisplayNumberRange): Promise<AllocatedDisplay> {
    const min = range?.min ?? this.min;
    const max = range?.max ?? this.max;

    if (min > max) {
      throw new Error("Display allocation range minimum cannot be greater than maximum.");
    }

    for (let displayNumber = min; displayNumber <= max; displayNumber += 1) {
      if (this.activeDisplays.has(displayNumber)) {
        continue;
      }

      if (await this.isDisplayInUse(displayNumber)) {
        continue;
      }

      this.activeDisplays.add(displayNumber);
      return {
        number: displayNumber,
        value: `:${displayNumber}`
      };
    }

    throw new Error(`No available X display in range :${min} to :${max}.`);
  }

  release(displayNumber: number): void {
    this.activeDisplays.delete(displayNumber);
  }

  isReserved(displayNumber: number): boolean {
    return this.activeDisplays.has(displayNumber);
  }
}

async function defaultIsDisplayInUse(displayNumber: number): Promise<boolean> {
  return await pathExists(join("/tmp/.X11-unix", `X${displayNumber}`));
}
