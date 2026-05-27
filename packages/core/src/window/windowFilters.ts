import type { WindowFilter, WindowInfo } from "../types.js";

const DEVTOOLS_TITLE_PATTERNS = ["DevTools", "Developer Tools", "Inspect"] as const;

export function filterWindows(
  windows: readonly WindowInfo[],
  filter: WindowFilter = {},
): WindowInfo[] {
  const titleIncludes = filter.titleIncludes?.toLowerCase();
  const titleExcludes = (filter.titleExcludes ?? []).map((value) => value.toLowerCase());
  const candidates = windows.filter((window) => {
    if (filter.pid !== undefined && window.pid !== filter.pid) {
      return false;
    }

    const title = window.title.toLowerCase();
    if (titleIncludes !== undefined && !title.includes(titleIncludes)) {
      return false;
    }

    if (titleExcludes.some((excluded) => title.includes(excluded))) {
      return false;
    }

    if (filter.excludeDevtools === true && isDevtoolsWindow(window)) {
      return false;
    }

    return true;
  });

  if (filter.preferLargest !== true) {
    return candidates;
  }

  return [...candidates].sort((left, right) => windowArea(right) - windowArea(left));
}

export function findBestWindow(
  windows: readonly WindowInfo[],
  filter: WindowFilter = {},
): WindowInfo | undefined {
  return filterWindows(windows, filter)[0];
}

export function isDevtoolsWindow(window: WindowInfo): boolean {
  return DEVTOOLS_TITLE_PATTERNS.some((pattern) => window.title.includes(pattern));
}

function windowArea(window: WindowInfo): number {
  if (window.width === undefined || window.height === undefined) {
    return 0;
  }

  return Math.max(0, window.width) * Math.max(0, window.height);
}
