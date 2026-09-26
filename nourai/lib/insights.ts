import { api, type ClientEventType, type ClientEventFields } from '@/services/api';

/**
 * Fire-and-forget tester analytics. Never awaits, never throws — a failed
 * event must not affect what the person is doing.
 */
export function track(type: ClientEventType, fields: ClientEventFields = {}): void {
  api.trackEvent({ type, ...fields }).catch(() => {});
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Catalogue products have UUID ids; USDA whole foods use `usda-…` ids. */
export function isCatalogueId(id: string | null | undefined): id is string {
  return !!id && UUID.test(id);
}
