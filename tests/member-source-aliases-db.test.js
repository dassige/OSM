// Integration test for services/db/member-source-aliases.js against a throwaway SQLite file.
// DB_PATH MUST point at a temp file before anything requires the connection —
// never let this suite touch the real fenz.db / demo.db.
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB = path.join(os.tmpdir(), `opready-aliases-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB;

jest.mock('../config', () => ({ appMode: 'production' }));
jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { initDB, closeDB } = require('../services/db/connection');
const aliases = require('../services/db/member-source-aliases');
const { updateMemberFirstName, getMemberById } = require('../services/db/members');

let keithId;
let rybId;

beforeAll(async () => {
    const db = await initDB();
    keithId = (await db.run("INSERT INTO members (name, email, mobile, first_name, last_name) VALUES ('QFF Skywalker, L', '', '', 'L', 'Skywalker')")).lastID;
    rybId = (await db.run("INSERT INTO members (name, email, mobile, first_name, last_name) VALUES ('FF Erso, J', '', '', 'J', 'Erso')")).lastID;
});

afterAll(async () => {
    await closeDB();
    for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(TEST_DB + suffix); } catch { /* not created */ }
    }
});

describe('member source aliases DB module', () => {
    it('saves an automatic match once and ignores repeats', async () => {
        expect(await aliases.createAutoMemberSourceAlias({ sourceName: 'Luke Skywalker', sourceKey: 'luke skywalker', memberId: keithId })).toBe(true);
        expect(await aliases.createAutoMemberSourceAlias({ sourceName: 'Luke Skywalker', sourceKey: 'luke skywalker', memberId: rybId })).toBe(false);

        const [row] = await aliases.getMemberSourceAliases();
        expect(row).toMatchObject({
            source_name: 'Luke Skywalker', source_key: 'luke skywalker', member_id: keithId,
            match_type: 'auto', created_by: 'System', member_name: 'QFF Skywalker, L',
        });
    });

    it('lets a manual match replace an automatic one', async () => {
        const id = await aliases.saveManualMemberSourceAlias({ sourceName: 'Luke  Skywalker', sourceKey: 'luke skywalker', memberId: rybId, createdBy: 'Admin' });
        const row = await aliases.getMemberSourceAliasById(id);
        expect(row).toMatchObject({ source_name: 'Luke  Skywalker', member_id: rybId, match_type: 'manual', created_by: 'Admin', member_name: 'FF Erso, J' });
        expect(await aliases.getMemberSourceAliases()).toHaveLength(1);
    });

    it('allows several names for one member and deletes by id', async () => {
        const id = await aliases.saveManualMemberSourceAlias({ sourceName: 'Em Erso', sourceKey: 'em erso', memberId: rybId, createdBy: 'Admin' });
        // Listed alphabetically by report name
        expect((await aliases.getMemberSourceAliases()).map((a) => a.source_name)).toEqual(['Em Erso', 'Luke  Skywalker']);
        expect(await aliases.deleteMemberSourceAlias(id)).toBe(1);
        expect(await aliases.getMemberSourceAliasById(id)).toBeUndefined();
    });

    it('removes a member\'s names when the member is deleted', async () => {
        const db = await initDB();
        await db.run('DELETE FROM members WHERE id = ?', [rybId]);
        expect(await aliases.getMemberSourceAliases()).toEqual([]);
    });

    it('updates a member\'s first name', async () => {
        await updateMemberFirstName(keithId, 'Luke');
        expect((await getMemberById(keithId)).first_name).toBe('Luke');
    });
});
