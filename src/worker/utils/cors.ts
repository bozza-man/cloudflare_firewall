/**
 * CORS Utility
 * Handles cross-origin request headers
 */

export function corsHeaders(origin: string = '*'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Access-JWT-Assertion',
    'Access-Control-Max-Age': '86400'
  };
}
