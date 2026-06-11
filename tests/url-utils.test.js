const { assertSafeUrl } = require('../services/url-utils');

describe('assertSafeUrl', () => {

    describe('valid public URLs', () => {
        it('accepts a plain http URL', () => {
            expect(() => assertSafeUrl('http://example.com')).not.toThrow();
        });

        it('accepts a plain https URL', () => {
            expect(() => assertSafeUrl('https://opready.example.com:8443/api')).not.toThrow();
        });

        it('accepts a URL with a path and query string', () => {
            expect(() => assertSafeUrl('https://remote-server.nz/api/health?v=1')).not.toThrow();
        });
    });

    describe('invalid or disallowed protocols', () => {
        it('rejects ftp://', () => {
            expect(() => assertSafeUrl('ftp://example.com')).toThrow('Invalid endpoint URL');
        });

        it('rejects file://', () => {
            expect(() => assertSafeUrl('file:///etc/passwd')).toThrow('Invalid endpoint URL');
        });

        it('rejects a plain hostname with no protocol', () => {
            expect(() => assertSafeUrl('example.com')).toThrow('Invalid endpoint URL');
        });
    });

    describe('loopback addresses (C-03)', () => {
        it('rejects localhost', () => {
            expect(() => assertSafeUrl('http://localhost/api')).toThrow('Endpoint not reachable');
        });

        it('rejects 127.0.0.1', () => {
            expect(() => assertSafeUrl('http://127.0.0.1:6379')).toThrow('Endpoint not reachable');
        });

        it('rejects 127.0.0.2 (full loopback /8 range)', () => {
            expect(() => assertSafeUrl('http://127.0.0.2')).toThrow('Endpoint not reachable');
        });

        it('rejects 127.255.255.255', () => {
            expect(() => assertSafeUrl('http://127.255.255.255')).toThrow('Endpoint not reachable');
        });

        it('rejects [::1] (IPv6 loopback)', () => {
            // Node URL parser returns hostname as '[::1]' (brackets preserved)
            expect(() => assertSafeUrl('http://[::1]:5432')).toThrow('Endpoint not reachable');
        });

        it('rejects 0.0.0.0', () => {
            expect(() => assertSafeUrl('http://0.0.0.0')).toThrow('Endpoint not reachable');
        });
    });

    describe('RFC-1918 private ranges', () => {
        it('rejects 10.0.0.1 (class A)', () => {
            expect(() => assertSafeUrl('http://10.0.0.1')).toThrow('Endpoint not reachable');
        });

        it('rejects 10.255.255.255', () => {
            expect(() => assertSafeUrl('http://10.255.255.255')).toThrow('Endpoint not reachable');
        });

        it('rejects 172.16.0.1 (class B)', () => {
            expect(() => assertSafeUrl('http://172.16.0.1')).toThrow('Endpoint not reachable');
        });

        it('rejects 172.31.255.255', () => {
            expect(() => assertSafeUrl('http://172.31.255.255')).toThrow('Endpoint not reachable');
        });

        it('accepts 172.15.0.1 (just outside class B range)', () => {
            expect(() => assertSafeUrl('http://172.15.0.1')).not.toThrow();
        });

        it('rejects 192.168.1.1 (class C)', () => {
            expect(() => assertSafeUrl('http://192.168.1.1')).toThrow('Endpoint not reachable');
        });
    });

    describe('cloud metadata endpoints', () => {
        it('rejects 169.254.169.254 (AWS / Azure metadata)', () => {
            expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data/')).toThrow('Endpoint not reachable');
        });

        it('rejects 100.100.100.200 (Alibaba Cloud metadata)', () => {
            expect(() => assertSafeUrl('http://100.100.100.200')).toThrow('Endpoint not reachable');
        });
    });
});
