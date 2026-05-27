import type { DesktopSession, SessionId } from "../types.js";
import { NoVncObserver } from "./NoVncObserver.js";
import type {
  LiveObserverRef,
  LiveObserverStatus,
  StartLiveObserverOptions,
  StopLiveObserverResult,
} from "./observerTypes.js";

export class LiveObserverService {
  constructor(private readonly observer: NoVncObserver = new NoVncObserver()) {}

  async status(): Promise<LiveObserverStatus> {
    return await this.observer.status();
  }

  async start(
    session: DesktopSession,
    options: StartLiveObserverOptions = {},
  ): Promise<LiveObserverRef> {
    return await this.observer.start(session, options);
  }

  list(sessionId?: SessionId): LiveObserverRef[] {
    return this.observer.list(sessionId);
  }

  async stop(sessionId: SessionId, observerId?: string): Promise<StopLiveObserverResult> {
    return await this.observer.stop(sessionId, observerId);
  }

  async stopAll(sessionId?: SessionId): Promise<void> {
    await this.observer.stopAll(sessionId);
  }
}
