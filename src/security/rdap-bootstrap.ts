// RDAP servers come from IANA's RDAP bootstrap registry (RFC 9224), never from a
// hand-written table.
//
// The table this replaces (IR-2026-10, 2026-10-10) pointed .au at
// rdap.audns.net.au and .org at rdap.pir.org, neither of which exists (NXDOMAIN),
// and .info, .biz and .de at hosts IANA does not list. A registry hostname that
// does not exist is a dormant dependency: whoever later gets that name created
// receives every lookup made through it. IANA's bootstrap is the authoritative
// TLD -> RDAP service mapping, and it is what RDAP clients are meant to use.

export const IANA_RDAP_DNS_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';

/** Lower-cased DNS label (usually a TLD) -> RDAP base URL ending in '/'. */
export type RdapBootstrap = Map<string, string>;

/**
 * Parse IANA's dns.json (`{ services: [[labels[], urls[]], ...] }`). Only https
 * base URLs are kept (the first one listed for each entry); malformed entries
 * are skipped, so a malformed document yields an empty map.
 */
export function parseRdapBootstrap(doc: unknown): RdapBootstrap {
  const out: RdapBootstrap = new Map();
  const services = (doc as { services?: unknown } | null)?.services;
  if (!Array.isArray(services)) return out;
  for (const entry of services) {
    if (!Array.isArray(entry) || !Array.isArray(entry[0]) || !Array.isArray(entry[1])) continue;
    const url = (entry[1] as unknown[]).find((u): u is string => typeof u === 'string' && u.startsWith('https://'));
    if (!url) continue;
    const base = url.endsWith('/') ? url : `${url}/`;
    for (const label of entry[0] as unknown[]) {
      if (typeof label === 'string' && label) out.set(label.toLowerCase(), base);
    }
  }
  return out;
}

/** The RDAP base URL for `domain`: longest matching label suffix (RFC 9224 section 4), or undefined. */
export function rdapBaseFor(domain: string, bootstrap: RdapBootstrap): string | undefined {
  const labels = domain.trim().toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  for (let i = 0; i < labels.length; i++) {
    const base = bootstrap.get(labels.slice(i).join('.'));
    if (base) return base;
  }
  return undefined;
}
