export function nowIso(): string {
  return new Date().toISOString();
}

export function computeExpiry(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function isExpired(isoDate: string): boolean {
  return new Date(isoDate).getTime() < Date.now();
}
