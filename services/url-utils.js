'use strict';

/**
 * Validates that a URL is safe for outbound HTTP requests.
 * Blocks loopback addresses, cloud metadata endpoints, RFC-1918 private ranges,
 * and link-local addresses to prevent server-side request forgery (SSRF).
 *
 * @param {string} url
 * @throws {Error} if the URL is invalid or targets a blocked address
 */
function assertSafeUrl(url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Invalid endpoint URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid endpoint URL');
    const h = parsed.hostname.toLowerCase();
    const blocked =
        h === 'localhost'           ||  // loopback hostname
        /^127\./.test(h)            ||  // 127.0.0.0/8 loopback range
        h === '[::1]'               ||  // IPv6 loopback (URL parser preserves brackets)
        h === '0.0.0.0'             ||  // unspecified address
        /^169\.254\./.test(h)       ||  // link-local / AWS + Azure metadata
        h === '100.100.100.200'     ||  // Alibaba Cloud metadata
        /^10\./.test(h)             ||  // RFC-1918 class A
        /^172\.(1[6-9]|2\d|3[01])\./.test(h) || // RFC-1918 class B
        /^192\.168\./.test(h);          // RFC-1918 class C
    if (blocked) throw new Error('Endpoint not reachable');
}

module.exports = { assertSafeUrl };
