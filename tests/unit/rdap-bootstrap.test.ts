import { describe, it, expect } from '@jest/globals';
import { IANA_RDAP_DNS_BOOTSTRAP, parseRdapBootstrap, rdapBaseFor } from '../../src/security/rdap-bootstrap.js';

// Entries copied from https://data.iana.org/rdap/dns.json, publication 2026-09-30T23:00:03Z
// (the .org and .info entries list more TLDs; only these are kept here).
const IANA_EXCERPT = {
  version: '1.0',
  publication: '2026-09-30T23:00:03Z',
  services: [
    [['au'], ['https://rdap.cctld.au/rdap/']],
    [['org'], ['https://rdap.publicinterestregistry.org/rdap/']],
    [['info'], ['https://rdap.identitydigital.services/rdap/']],
    [['biz'], ['https://rdap.nic.biz/']],
    [['com'], ['https://rdap.verisign.com/com/v1/']],
    [['net'], ['https://rdap.verisign.com/net/v1/']],
    [['uk'], ['https://rdap.nominet.uk/uk/']],
    [['fr'], ['https://rdap.nic.fr/']],
  ],
};

describe('rdap-bootstrap', () => {
  const bootstrap = parseRdapBootstrap(IANA_EXCERPT);

  it('reads the server for each TLD from the bootstrap', () => {
    expect(rdapBaseFor('example.com.au', bootstrap)).toBe('https://rdap.cctld.au/rdap/');
    expect(rdapBaseFor('example.org', bootstrap)).toBe('https://rdap.publicinterestregistry.org/rdap/');
    expect(rdapBaseFor('example.info', bootstrap)).toBe('https://rdap.identitydigital.services/rdap/');
    expect(rdapBaseFor('example.biz', bootstrap)).toBe('https://rdap.nic.biz/');
    expect(rdapBaseFor('example.com', bootstrap)).toBe('https://rdap.verisign.com/com/v1/');
  });

  it('never yields the non-existent or non-IANA hosts the old table used (IR-2026-10)', () => {
    const hosts = [...bootstrap.values()].map((u) => new URL(u).hostname);
    for (const bad of ['rdap.audns.net.au', 'rdap.auda.org.au', 'rdap.pir.org', 'rdap.afilias.net', 'rdap.denic.de']) {
      expect(hosts).not.toContain(bad);
    }
  });

  it('returns undefined for a TLD IANA lists no RDAP service for', () => {
    expect(rdapBaseFor('example.de', bootstrap)).toBeUndefined();
  });

  it('matches case-insensitively, ignores a trailing dot and prefers the longest suffix', () => {
    const b = parseRdapBootstrap({ services: [[['uk'], ['https://rdap.nominet.uk/uk/']], [['co.uk'], ['https://example.test/co-uk/']]] });
    expect(rdapBaseFor('WWW.Example.CO.UK.', b)).toBe('https://example.test/co-uk/');
    expect(rdapBaseFor('example.org.uk', b)).toBe('https://rdap.nominet.uk/uk/');
  });

  it('keeps only https servers, takes the first one, and ensures a trailing slash', () => {
    const b = parseRdapBootstrap({ services: [[['x'], ['http://plain.test/', 'https://a.test/rdap', 'https://b.test/']], [['y'], ['http://only-http.test/']]] });
    expect(b.get('x')).toBe('https://a.test/rdap/');
    expect(b.has('y')).toBe(false);
  });

  it('yields an empty map for a malformed document', () => {
    expect(parseRdapBootstrap(null).size).toBe(0);
    expect(parseRdapBootstrap({ services: 'nope' }).size).toBe(0);
    expect(parseRdapBootstrap({ services: [['au', 'https://x/'], [[], []]] }).size).toBe(0);
  });

  it("fetches IANA's own bootstrap", () => {
    expect(IANA_RDAP_DNS_BOOTSTRAP).toBe('https://data.iana.org/rdap/dns.json');
  });
});
