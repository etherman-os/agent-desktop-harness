import { ProcessError } from "../../errors.js";
import type { ElectronDriverStatus } from "../electron/electronTypes.js";
import type { TauriDriverStatus } from "../tauri/tauriTypes.js";
import type {
  AppKind,
  DriverRouteDecision,
  DriverRouteRequest,
  DriverRouterStatus,
  RoutedDriverKind
} from "./driverRouterTypes.js";

export function makeDriverRouterStatus(input: {
  readonly tauri: TauriDriverStatus;
  readonly electron: ElectronDriverStatus;
}): DriverRouterStatus {
  return {
    browser: {
      available: true,
      driver: "browser-playwright",
      warnings: [
        "Browser semantic mode requires a host browser executable or browserExecutablePath."
      ],
      errors: []
    },
    tauri: {
      available: input.tauri.available,
      driver: "tauri-webdriver",
      experimental: true,
      warnings: input.tauri.warnings,
      errors: input.tauri.errors
    },
    electron: {
      available: input.electron.available,
      driver: "electron-playwright",
      experimental: true,
      warnings: input.electron.warnings,
      errors: input.electron.errors
    },
    x11Fallback: {
      available: true,
      driver: "x11-fallback",
      warnings: [],
      errors: []
    }
  };
}

export function selectDriver(
  status: DriverRouterStatus,
  request: DriverRouteRequest
): DriverRouteDecision {
  const allowFallback = request.allowFallback ?? true;
  const preferredDriver = request.preferredDriver;

  if (preferredDriver) {
    const preferred = decisionForDriver(status, request.appKind, preferredDriver, "explicit");
    if (preferred.errors.length === 0) {
      return enforceSemanticAndFallback(status, request, preferred);
    }
    if (!allowFallback || request.requireSemantic === true) {
      throw new ProcessError(preferred.errors.join("; "));
    }
    return fallbackDecision(status, request.appKind, preferred.errors.join("; "), "explicit");
  }

  const selected = defaultDriverForAppKind(request.appKind);
  const decision = decisionForDriver(status, request.appKind, selected, "auto");
  if (decision.errors.length === 0) {
    return enforceSemanticAndFallback(status, request, decision);
  }
  if (!allowFallback || request.requireSemantic === true) {
    throw new ProcessError(decision.errors.join("; "));
  }
  return fallbackDecision(status, request.appKind, decision.errors.join("; "), "auto");
}

export function isSemanticDriver(driver: RoutedDriverKind): boolean {
  return driver !== "x11-fallback";
}

function defaultDriverForAppKind(appKind: AppKind): RoutedDriverKind {
  switch (appKind) {
    case "browser":
      return "browser-playwright";
    case "tauri":
      return "tauri-webdriver";
    case "electron":
      return "electron-playwright";
    case "native":
    case "unknown":
      return "x11-fallback";
  }
}

function decisionForDriver(
  status: DriverRouterStatus,
  appKind: AppKind,
  selectedDriver: RoutedDriverKind,
  selectionMode: "auto" | "explicit"
): DriverRouteDecision {
  const availability = availabilityForDriver(status, selectedDriver);
  const semantic = isSemanticDriver(selectedDriver);

  return {
    appKind,
    selectedDriver,
    selectionMode,
    semantic,
    fallbackUsed: false,
    warnings: availability.warnings,
    errors: availability.available
      ? []
      : [
          `${selectedDriver} is unavailable${
            availability.errors.length > 0 ? `: ${availability.errors.join("; ")}` : "."
          }`
        ]
  };
}

function availabilityForDriver(
  status: DriverRouterStatus,
  driver: RoutedDriverKind
): {
  readonly available: boolean;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
} {
  switch (driver) {
    case "browser-playwright":
      return status.browser;
    case "tauri-webdriver":
      return status.tauri;
    case "electron-playwright":
      return status.electron;
    case "x11-fallback":
      return status.x11Fallback;
  }
}

function enforceSemanticAndFallback(
  status: DriverRouterStatus,
  request: DriverRouteRequest,
  decision: DriverRouteDecision
): DriverRouteDecision {
  if (request.requireSemantic === true && !decision.semantic) {
    throw new ProcessError(
      `Semantic driver is required for appKind=${request.appKind}, but ${decision.selectedDriver} is not semantic.`
    );
  }
  if (decision.selectedDriver === "x11-fallback" && status.x11Fallback.available !== true) {
    throw new ProcessError("X11 fallback driver is unavailable.");
  }
  return decision;
}

function fallbackDecision(
  status: DriverRouterStatus,
  appKind: AppKind,
  fallbackReason: string,
  selectionMode: "auto" | "explicit"
): DriverRouteDecision {
  if (!status.x11Fallback.available) {
    throw new ProcessError(`No driver is available. Fallback reason: ${fallbackReason}`);
  }

  return {
    appKind,
    selectedDriver: "x11-fallback",
    selectionMode,
    semantic: false,
    fallbackUsed: true,
    fallbackReason,
    warnings: [
      ...status.x11Fallback.warnings,
      fallbackReason
    ],
    errors: []
  };
}
