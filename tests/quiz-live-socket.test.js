const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

jest.mock('../services/db', () => ({
    getQuizPlayerByCode: jest.fn(),
    getTeamByCode: jest.fn(),
}));
jest.mock('../services/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const db = require('../services/db');
const { initQuizLiveSocket, isHostConnected } = require('../services/quiz-live-socket');

const ROLES = { guest: 0, simple: 1, admin: 2, superadmin: 3 };

// Real session middleware is express-session; here we just need something that
// stamps req.session from a header so a test client can act as an admin host
// or an anonymous player, exactly like initQuizLiveSocket expects downstream.
function fakeSessionMiddleware(req, res, next) {
    const role = req.headers['x-test-role'];
    req.session = role ? { user: { role } } : {};
    next();
}

function waitForEvent(socket, event) {
    return new Promise((resolve) => socket.once(event, resolve));
}

let httpServer, io, port;

function makeClient(extraHeaders = {}) {
    return Client(`http://localhost:${port}/quiz-live`, {
        transports: ['polling'],
        extraHeaders,
        forceNew: true,
    });
}

beforeAll((done) => {
    httpServer = http.createServer();
    io = new Server(httpServer);
    initQuizLiveSocket(io, fakeSessionMiddleware, ROLES);
    httpServer.listen(() => {
        port = httpServer.address().port;
        done();
    });
});

afterAll((done) => {
    io.close();
    httpServer.close(done);
});

describe('quiz-live-socket host presence (host-disconnect safety net)', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('reports the host as connected once join-host succeeds', async () => {
        const host = makeClient({ 'x-test-role': 'admin' });
        await waitForEvent(host, 'connect');
        host.emit('join-host', { kind: 'individual', sessionId: 501 });
        await new Promise((r) => setTimeout(r, 50));

        expect(isHostConnected('individual', 501)).toBe(true);
        host.close();
    });

    it('rejects a non-admin join-host attempt — host status stays disconnected', async () => {
        const host = makeClient({ 'x-test-role': 'simple' });
        await waitForEvent(host, 'connect');
        host.emit('join-host', { kind: 'individual', sessionId: 502 });
        await new Promise((r) => setTimeout(r, 50));

        expect(isHostConnected('individual', 502)).toBe(false);
        host.close();
    });

    it('tells a newly-joined player the host is already connected', async () => {
        db.getQuizPlayerByCode.mockResolvedValue({ id: 1, session_id: 503 });

        const host = makeClient({ 'x-test-role': 'admin' });
        await waitForEvent(host, 'connect');
        host.emit('join-host', { kind: 'individual', sessionId: 503 });
        await new Promise((r) => setTimeout(r, 50));

        const player = makeClient();
        await waitForEvent(player, 'connect');
        const statusPromise = waitForEvent(player, 'host-status');
        player.emit('join-player', { kind: 'individual', code: 'ABC123' });
        const status = await statusPromise;

        expect(status.connected).toBe(true);
        host.close();
        player.close();
    });

    it('tells a newly-joined player the host is NOT connected when no host has joined yet', async () => {
        db.getQuizPlayerByCode.mockResolvedValue({ id: 2, session_id: 504 });

        const player = makeClient();
        await waitForEvent(player, 'connect');
        const statusPromise = waitForEvent(player, 'host-status');
        player.emit('join-player', { kind: 'individual', code: 'DEF456' });
        const status = await statusPromise;

        expect(status.connected).toBe(false);
        player.close();
    });

    it('broadcasts host-status:false to already-joined players when the host disconnects mid-game', async () => {
        db.getQuizPlayerByCode.mockResolvedValue({ id: 3, session_id: 505 });

        const host = makeClient({ 'x-test-role': 'admin' });
        await waitForEvent(host, 'connect');
        host.emit('join-host', { kind: 'individual', sessionId: 505 });
        await new Promise((r) => setTimeout(r, 50));

        const player = makeClient();
        await waitForEvent(player, 'connect');
        const joinedStatusPromise = waitForEvent(player, 'host-status');
        player.emit('join-player', { kind: 'individual', code: 'GHI789' });
        expect((await joinedStatusPromise).connected).toBe(true);

        const disconnectStatusPromise = waitForEvent(player, 'host-status');
        host.close();
        const status = await disconnectStatusPromise;

        expect(status.connected).toBe(false);
        expect(isHostConnected('individual', 505)).toBe(false);
        player.close();
    });

    it('does not report disconnected while a second host tab is still open', async () => {
        const hostA = makeClient({ 'x-test-role': 'admin' });
        const hostB = makeClient({ 'x-test-role': 'admin' });
        await Promise.all([waitForEvent(hostA, 'connect'), waitForEvent(hostB, 'connect')]);
        hostA.emit('join-host', { kind: 'team', sessionId: 506 });
        hostB.emit('join-host', { kind: 'team', sessionId: 506 });
        await new Promise((r) => setTimeout(r, 50));

        hostA.close();
        await new Promise((r) => setTimeout(r, 50));

        expect(isHostConnected('team', 506)).toBe(true);
        hostB.close();
    });

    it('reports host-status:true again once a new host tab reconnects', async () => {
        db.getTeamByCode.mockResolvedValue({ id: 4, team_session_id: 507 });

        const host1 = makeClient({ 'x-test-role': 'admin' });
        await waitForEvent(host1, 'connect');
        host1.emit('join-host', { kind: 'team', sessionId: 507 });
        await new Promise((r) => setTimeout(r, 50));

        const player = makeClient();
        await waitForEvent(player, 'connect');
        const firstStatus = waitForEvent(player, 'host-status');
        player.emit('join-player', { kind: 'team', code: 'JKL012' });
        expect((await firstStatus).connected).toBe(true);

        const disconnectStatus = waitForEvent(player, 'host-status');
        host1.close();
        expect((await disconnectStatus).connected).toBe(false);

        const reconnectStatus = waitForEvent(player, 'host-status');
        const host2 = makeClient({ 'x-test-role': 'admin' });
        await waitForEvent(host2, 'connect');
        host2.emit('join-host', { kind: 'team', sessionId: 507 });
        expect((await reconnectStatus).connected).toBe(true);

        host2.close();
        player.close();
    });
});
