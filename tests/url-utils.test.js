const path = require('path');
const { assertSafeUrl, assertSafeBackupLocation } = require('../services/url-utils');

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

describe('assertSafeBackupLocation (M-07 / N-BR-2)', () => {
    const root = path.resolve('/opt/opready/backups');

    it('accepts an empty location (caller falls back to its own default)', () => {
        expect(() => assertSafeBackupLocation('', root)).not.toThrow();
        expect(() => assertSafeBackupLocation('   ', root)).not.toThrow();
        expect(() => assertSafeBackupLocation(undefined, root)).not.toThrow();
    });

    it('accepts the root itself', () => {
        expect(() => assertSafeBackupLocation(root, root)).not.toThrow();
    });

    it('accepts a subdirectory of the root', () => {
        expect(() => assertSafeBackupLocation(path.join(root, 'scheduled'), root)).not.toThrow();
    });

    it('rejects a path outside the root via traversal (N-BR-2 exploit: pointing at the public web root)', () => {
        expect(() => assertSafeBackupLocation(path.join(root, '..', '..', 'public'), root))
            .toThrow(/Backup location must be inside the configured backup root/);
    });

    it('rejects a completely unrelated absolute path', () => {
        expect(() => assertSafeBackupLocation(path.resolve('/etc'), root))
            .toThrow(/Backup location must be inside the configured backup root/);
    });

    it('rejects a sibling directory that merely shares the root as a string prefix', () => {
        // e.g. root "/opt/opready/backups" vs "/opt/opready/backups-evil" — must not pass a naive startsWith check
        expect(() => assertSafeBackupLocation(root + '-evil', root))
            .toThrow(/Backup location must be inside the configured backup root/);
    });
});
