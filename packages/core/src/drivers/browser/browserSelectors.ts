import { ProcessError } from "../../errors.js";
import type { BrowserFillOptions, BrowserSelectorTarget } from "./browserTypes.js";

export type BrowserSelectorKind = "selector" | "testId" | "role" | "label" | "placeholder" | "text";

export interface BrowserResolvedTarget {
  readonly kind: BrowserSelectorKind;
  readonly value: string;
  readonly name?: string;
}

const TARGET_PRIORITY: readonly BrowserSelectorKind[] = [
  "selector",
  "testId",
  "role",
  "label",
  "placeholder",
  "text",
];

export function resolveBrowserTarget(target: BrowserSelectorTarget): BrowserResolvedTarget {
  if (isNonEmpty(target.selector)) {
    return { kind: "selector", value: target.selector };
  }
  if (isNonEmpty(target.testId)) {
    return { kind: "testId", value: target.testId };
  }
  if (isNonEmpty(target.role)) {
    return {
      kind: "role",
      value: target.role,
      name: isNonEmpty(target.name) ? target.name : undefined,
    };
  }
  if (isNonEmpty(target.label)) {
    return { kind: "label", value: target.label };
  }
  if (isNonEmpty(target.placeholder)) {
    return { kind: "placeholder", value: target.placeholder };
  }
  if (isNonEmpty(target.text)) {
    return { kind: "text", value: target.text };
  }

  throw new ProcessError(`Browser action requires one target: ${TARGET_PRIORITY.join(", ")}.`);
}

export function hasBrowserTarget(target: BrowserSelectorTarget): boolean {
  return TARGET_PRIORITY.some((kind) => isNonEmpty(target[kind]));
}

export function formatBrowserTarget(target: BrowserSelectorTarget): Record<string, unknown> {
  const resolved = resolveBrowserTarget(target);
  return {
    kind: resolved.kind,
    value: resolved.value,
    name: resolved.name,
  };
}

export function makeBrowserFillDetails(
  options: BrowserFillOptions,
): Readonly<Record<string, unknown>> {
  return {
    target: formatBrowserTarget(options),
    redacted: options.secret === true,
    valueLength: options.value.length,
    value: options.secret === true ? undefined : truncateForLog(options.value),
    truncated: options.secret === true ? undefined : options.value.length > 256,
    label: options.label,
  };
}

export function compactDetails(
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function truncateForLog(value: string): string {
  return value.length > 256 ? `${value.slice(0, 256)}...` : value;
}
