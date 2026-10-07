/** The device's region as an ISO 3166-1 alpha-2 code ("en-US" → "US"), if the platform exposes one. */
export function deviceRegion(): string | undefined {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split(/[-_]/).find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part));
    return region?.toUpperCase();
  } catch {
    return undefined;
  }
}
