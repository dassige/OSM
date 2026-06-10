const geoip = require('geoip-lite');

// Strip IPv6-mapped IPv4 prefix so geoip-lite gets a plain v4 address
function normalise(ip) {
    if (!ip) return '';
    return ip.replace(/^::ffff:/, '').trim();
}

const PRIVATE_RANGES = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
];

function isPrivate(ip) {
    return PRIVATE_RANGES.some(re => re.test(ip));
}

/**
 * Resolve an IP address to a { city, region, country } object.
 * Returns null when the IP is private/loopback or unrecognised.
 */
function lookupIp(rawIp) {
    const ip = normalise(rawIp);
    if (!ip) return null;
    if (isPrivate(ip)) return { city: 'Private Network', region: '', country: 'Local' };
    const geo = geoip.lookup(ip);
    if (!geo) return null;
    return {
        city:    geo.city    || '',
        region:  geo.region  || '',
        country: geo.country || '',
    };
}

/**
 * Format a geo object as a short human-readable string, e.g. "Auckland, NZ".
 * Returns an empty string when geo is null.
 */
function formatGeo(geo) {
    if (!geo) return '';
    const parts = [geo.city, geo.country].filter(Boolean);
    return parts.join(', ');
}

module.exports = { lookupIp, formatGeo };
