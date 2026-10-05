// tests/member-name-resolver.test.js
// Member name matching for the pdf-report plugin (services/member-name-resolver.js).

jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../services/db', () => ({
    getMembers: jest.fn(),
    getMemberSourceAliases: jest.fn(),
    getSkills: jest.fn(),
    createAutoMemberSourceAlias: jest.fn(),
    updateMemberFirstName: jest.fn().mockResolvedValue(),
    logEvent: jest.fn().mockResolvedValue(),
}));

const db = require('../services/db');
const resolver = require('../services/member-name-resolver');

let nextId = 1;
const member = (name, { first, last, osm = null, enabled = 1 } = {}) => {
    const m = /^(\S+) ([^,]+), (.+)$/.exec(name);
    return {
        id: nextId++, name, rank: m && m[1], enabled, member_osm_id: osm,
        last_name: last !== undefined ? last : m && m[2],
        first_name: first !== undefined ? first : m && m[3],
    };
};
const alias = (sourceName, memberId, matchType = 'auto', id = 100 + memberId) =>
    ({ id, source_name: sourceName, source_key: resolver.normaliseKey(sourceName), member_id: memberId, match_type: matchType });

beforeEach(() => {
    jest.clearAllMocks();
    nextId = 1;
});

// ── normaliseKey ────────────────────────────────────────────────────────────

describe('normaliseKey', () => {
    it.each([
        ['  Andrew   Keith ', 'andrew keith'],
        ['Zoë  Mäkinen', 'zoe makinen'],
        ['Module 1 Working Safely around Water – Level 1', 'module 1 working safely around water - level 1'],
        ['Hazmat - Emergency Decontamination  (C)', 'hazmat - emergency decontamination (c)'],
        ['O’Brien', "o'brien"],
        [null, ''],
    ])('normalises %p', (input, expected) => {
        expect(resolver.normaliseKey(input)).toBe(expected);
    });
});

// ── findCandidates / analyseNames ───────────────────────────────────────────

describe('analyseNames', () => {
    const analyse = (names, members, aliases = []) => resolver.analyseNames(names, members, aliases);

    it('matches on surname and first initial', () => {
        const keith = member('QFF Keith, A');
        const r = analyse(['Andrew Keith'], [keith, member('FF Keith, B'), member('FF Kerr, A')]).get('Andrew Keith');
        expect(r).toMatchObject({ status: 'suggested', member: keith, givenName: 'Andrew' });
    });

    it('matches compound surnames and accents', () => {
        const vdm = member('FF van der Merwe, J');
        const zoe = member('FF Mäkinen, Z');
        const res = analyse(['Jan van der Merwe', 'Zoe Makinen'], [vdm, zoe]);
        expect(res.get('Jan van der Merwe')).toMatchObject({ status: 'suggested', member: vdm, givenName: 'Jan' });
        expect(res.get('Zoe Makinen')).toMatchObject({ status: 'suggested', member: zoe });
    });

    it('matches members without ETL name fields by parsing their name', () => {
        const m = member('SFF Price, S', { first: null, last: null });
        expect(analyse(['Scott Price'], [m]).get('Scott Price')).toMatchObject({ status: 'suggested', member: m });
    });

    it('prefers the member whose full first name matches exactly', () => {
        const mark = member('FF Edwards, Mark', { first: 'Mark' });
        const mike = member('FF Edwards, Mike', { first: 'Michael' });
        expect(analyse(['Mark Edwards'], [mark, mike]).get('Mark Edwards')).toMatchObject({ status: 'suggested', member: mark });
    });

    it('leaves two equally good members for an admin', () => {
        const a = member('FF Roberts, G');
        const b = member('QFF Roberts, G');
        const r = analyse(['Geoff Roberts'], [a, b]).get('Geoff Roberts');
        expect(r.status).toBe('ambiguous');
        expect(r.member).toBeNull();
        expect(r.candidates.map((c) => c.id).sort()).toEqual([a.id, b.id]);
    });

    it('reports names with no candidate, and single-word names, as unmatched', () => {
        const res = analyse(['Emma Ryan', 'Madonna'], [member('FF Ryan, J'), member('FF Madonna, M')]);
        expect(res.get('Emma Ryan')).toMatchObject({ status: 'unmatched', candidates: [] });
        expect(res.get('Madonna')).toMatchObject({ status: 'unmatched' });
    });

    it('uses saved links first, reporting manual and automatic ones', () => {
        const a = member('FF Whybrow, R');
        const b = member('FF Smith, R');
        const res = analyse(['Rob Whybrow', 'Bob Smith'], [a, b], [alias('Rob Whybrow', a.id), alias('bob  smith', b.id, 'manual')]);
        expect(res.get('Rob Whybrow')).toMatchObject({ status: 'auto', member: a, aliasId: 100 + a.id });
        expect(res.get('Bob Smith')).toMatchObject({ status: 'manual', member: b });
    });

    it('never auto-matches a member already linked to a different name', () => {
        const claudia = member('FF Hansen, S');
        const res = analyse(['Stuart Hansen'], [claudia], [alias('Stu Hansen', claudia.id, 'manual')]);
        expect(res.get('Stuart Hansen')).toMatchObject({ status: 'unmatched', member: null });
    });

    it('treats two names pointing at the same member as ambiguous', () => {
        const m = member('FF Tucker, W');
        const res = analyse(['Warren Tucker', 'Wayne Tucker'], [m]);
        expect(res.get('Warren Tucker')).toMatchObject({ status: 'ambiguous', member: null, candidates: [m] });
        expect(res.get('Wayne Tucker')).toMatchObject({ status: 'ambiguous', member: null });
    });

    it('ignores a saved link whose member no longer exists', () => {
        const m = member('FF Busch, G');
        const res = analyse(['Gavin Busch'], [m], [alias('Gavin Busch', 999)]);
        expect(res.get('Gavin Busch')).toMatchObject({ status: 'suggested', member: m });
    });
});

// ── givenNameFor / firstNameUpgrade ─────────────────────────────────────────

describe('givenNameFor', () => {
    it('returns the words before the member surname', () => {
        expect(resolver.givenNameFor('Mary Jane Smith', member('FF Smith, M'))).toBe('Mary Jane');
        expect(resolver.givenNameFor('Jan van der Merwe', member('FF van der Merwe, J'))).toBe('Jan');
    });

    it('falls back to the first word when the surname differs', () => {
        expect(resolver.givenNameFor('Bob Smyth', member('FF Smith, R'))).toBe('Bob');
        expect(resolver.givenNameFor('Madonna', member('FF Smith, R'))).toBe('');
    });
});

describe('firstNameUpgrade', () => {
    it.each([
        ['an initial that agrees', 'A', 'Andrew', 'Andrew'],
        ['an initial with a dot', 'A.', 'Andrew', 'Andrew'],
        ['a blank first name', null, 'Andrew', 'Andrew'],
        ['an initial that disagrees', 'R', 'Bob', null],
        ['an existing full first name', 'Andy', 'Andrew', null],
        ['a given name that is only an initial', 'A', 'A', null],
        ['no given name', 'A', '', null],
    ])('handles %s', (_label, current, given, expected) => {
        expect(resolver.firstNameUpgrade({ first_name: current }, given)).toBe(expected);
    });
});

// ── resolveRecords ──────────────────────────────────────────────────────────

describe('resolveRecords', () => {
    const rec = (sourceName, skill = 'BA - Search & Rescue') => ({
        name: sourceName, sourceName, rank: '', firstName: sourceName.split(' ')[0], lastName: sourceName.split(' ').slice(1).join(' '),
        memberOsmId: sourceName, skill, skillOsmId: skill, skillCategory: 'B.A', dueDate: '2026-12-01',
    });

    it('rewrites matched records to the member and skill as stored, and saves new automatic matches', async () => {
        const keith = member('QFF Keith, A', { osm: 'osm-keith' });
        db.getMembers.mockResolvedValue([keith]);
        db.getMemberSourceAliases.mockResolvedValue([]);
        db.getSkills.mockResolvedValue([{ id: 5, name: 'Hazmat - Emergency Decontamination (C)', skill_osm_id: null }]);
        db.createAutoMemberSourceAlias.mockResolvedValue(true);
        const log = jest.fn();

        const { records, summary } = await resolver.resolveRecords(
            [rec('Andrew Keith', 'Hazmat - Emergency Decontamination  (C)'), rec('Emma Ryan')], { log },
        );

        expect(records[0]).toMatchObject({
            name: 'QFF Keith, A', memberId: keith.id, memberOsmId: 'osm-keith', rank: 'QFF', lastName: 'Keith', firstName: 'Andrew',
            skill: 'Hazmat - Emergency Decontamination (C)', skillOsmId: 'Hazmat - Emergency Decontamination (C)',
            sourceName: 'Andrew Keith', dueDate: '2026-12-01',
        });
        expect(records[0].unresolved).toBeUndefined();
        expect(records[1]).toMatchObject({ name: 'Emma Ryan', unresolved: true, skill: 'BA - Search & Rescue' });
        expect(summary).toEqual({ names: 2, matched: 1, unresolved: ['Emma Ryan'], autoMatched: 1 });

        expect(db.createAutoMemberSourceAlias).toHaveBeenCalledWith({ sourceName: 'Andrew Keith', sourceKey: 'andrew keith', memberId: keith.id });
        expect(db.updateMemberFirstName).toHaveBeenCalledWith(keith.id, 'Andrew');
        expect(db.logEvent).toHaveBeenCalledWith('System', 'Member', 'Member Name Matched Automatically', {
            sourceName: 'Andrew Keith', memberId: keith.id, memberName: 'QFF Keith, A', firstNameStored: 'Andrew',
        });
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/1 of 2 matched \(1 newly matched automatically\) — 1 need matching/));
    });

    it('does not log or change the member when another request saved the match first', async () => {
        const keith = member('QFF Keith, A');
        db.getMembers.mockResolvedValue([keith]);
        db.getMemberSourceAliases.mockResolvedValue([]);
        db.getSkills.mockResolvedValue([]);
        db.createAutoMemberSourceAlias.mockResolvedValue(false);

        const { records } = await resolver.resolveRecords([rec('Andrew Keith')]);
        expect(records[0].name).toBe('QFF Keith, A');
        expect(db.updateMemberFirstName).not.toHaveBeenCalled();
        expect(db.logEvent).not.toHaveBeenCalled();
    });

    it('uses saved links without writing anything', async () => {
        const keith = member('QFF Keith, Andrew', { first: 'Andrew' });
        db.getMembers.mockResolvedValue([keith]);
        db.getMemberSourceAliases.mockResolvedValue([alias('Andrew Keith', keith.id)]);
        db.getSkills.mockResolvedValue([]);

        const { records, summary } = await resolver.resolveRecords([rec('Andrew Keith')]);
        expect(records[0]).toMatchObject({ name: 'QFF Keith, Andrew', memberOsmId: 'QFF Keith, Andrew' });
        expect(summary.autoMatched).toBe(0);
        expect(db.createAutoMemberSourceAlias).not.toHaveBeenCalled();
    });
});
