export function now(): Date {
  return new Date();
}

export function isoNow(): string {
  return now().toISOString();
}
