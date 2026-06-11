
const express = require("express");
const router = express.Router();
const db = require("../../services/db");
const extractionEngine = require("../../services/extraction-engine");
const { getActiveProxy } = require("../../services/proxy-manager");
const config = require("../../config");
const { hasRole } = require("../../middleware/auth");
const { validateMember } = require("../../middleware/validation");
const logger = require("../../services/logger");
const { formatMemberName } = require("../../services/rank-config");

// Returns true when SQLite throws a FOREIGN KEY constraint violation
function isForeignKeyError(err) {
  return err && err.message && err.message.toLowerCase().includes('foreign key');
}

router.get("/", hasRole("admin"), async (req, res) => {
  try {
    const { limit, offset, search, sortBy, sortDir } = req.query;
    if (limit !== undefined) {
      // M-06: Clamp to prevent NaN (parseInt('abc')→NaN) being passed to SQLite LIMIT,
      // which would cause it to return all rows, bypassing pagination.
      const safeLimit  = Math.min(Math.max(parseInt(limit,  10) || 25, 1), 500);
      const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
      res.json(await db.getMembersPage({
        limit: safeLimit,
        offset: safeOffset,
        search,
        sortBy,
        sortDir,
      }));
    } else {
      res.json(await db.getMembers());
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", hasRole("admin"), validateMember, async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const id = await db.addMember(req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Member Created', {
      memberId: id,
      memberName: formatMemberName(req.body.rank, req.body.last_name, req.body.first_name, req.body.name),
      email: req.body.email,
      notificationPreference: req.body.notificationPreference || 'email',
    });
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", hasRole("admin"), validateMember, async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await db.updateMember(req.params.id, req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Member Updated', {
      memberId: req.params.id,
      memberName: formatMemberName(req.body.rank, req.body.last_name, req.body.first_name, req.body.name),
      email: req.body.email,
      enabled: req.body.enabled,
      notificationPreference: req.body.notificationPreference,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const member = await db.getMemberById(req.params.id);
    await db.deleteMember(req.params.id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Member Deleted', {
      memberId: req.params.id,
      memberName: member ? formatMemberName(member.rank, member.last_name, member.first_name, member.name) : undefined,
    });
    res.json({ success: true });
  } catch (error) {
    logger.error("Delete Member Error", error);
    if (isForeignKeyError(error)) {
      return res.status(409).json({
        error: 'Cannot delete this member — they have linked records (live forms, survey activity, or email history). Remove those linked records first, or disable the member instead.',
      });
    }
    res.status(500).json({ error: 'Could not delete member.' });
  }
});

router.post("/bulk-delete", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await db.bulkDeleteMembers(req.body.ids);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Members Bulk Deleted', {
      deletedCount: req.body.ids?.length || 0,
    });
    res.json({ success: true });
  } catch (e) {
    logger.error("Bulk Delete Members Error", e);
    if (isForeignKeyError(e)) {
      return res.status(409).json({
        error: 'One or more members could not be deleted — they have linked records (live forms, survey activity, or email history). Remove those linked records first, or disable the members instead.',
      });
    }
    res.status(500).json({ error: 'Could not delete members.' });
  }
});

router.get("/discover", hasRole("admin"), async (req, res) => {
  try {
    const rawData = await extractionEngine.extractData({ forceRefresh: true, proxyUrl: getActiveProxy() });
    const existing = await db.getMembers();

    // Build lookup maps — prefer member_osm_id match, fall back to name
    const byOsmId = new Map(existing.filter((m) => m.member_osm_id).map((m) => [m.member_osm_id, m]));
    const byName  = new Map(existing.map((m) => [m.name, m]));

    // Deduplicate extracted records by memberOsmId (one entry per unique member)
    const seen = new Set();
    const uniqueExtracted = [];
    for (const r of rawData) {
      if (typeof r.name !== 'string' || !r.name.trim()) continue;
      if (seen.has(r.memberOsmId)) continue;
      seen.add(r.memberOsmId);
      uniqueExtracted.push(r);
    }

    const newMembers     = [];
    const changedMembers = [];

    for (const r of uniqueExtracted) {
      const dbRow = byOsmId.get(r.memberOsmId) || byName.get(r.name);

      if (!dbRow) {
        newMembers.push({ name: r.name, rank: r.rank || null, lastName: r.lastName || null, firstName: r.firstName || null, memberOsmId: r.memberOsmId });
      } else {
        const rankChanged      = (r.rank      || null) !== (dbRow.rank       || null);
        const firstNameChanged = (r.firstName || null) !== (dbRow.first_name || null);
        const lastNameChanged  = (r.lastName  || null) !== (dbRow.last_name  || null);
        const osmIdChanged     = r.memberOsmId !== (dbRow.member_osm_id || null);
        if (rankChanged || firstNameChanged || lastNameChanged || osmIdChanged) {
          changedMembers.push({
            dbId: dbRow.id, name: r.name,
            rank: r.rank || null, lastName: r.lastName || null, firstName: r.firstName || null, memberOsmId: r.memberOsmId,
            currentRank: dbRow.rank || null, currentFirstName: dbRow.first_name || null, currentLastName: dbRow.last_name || null,
          });
        }
      }
    }

    res.json({ new: newMembers, changed: changedMembers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/sync", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    const { add = [], update = [] } = req.body;
    if (add.length > 0) await db.bulkAddMembersWithEtl(add);
    for (const m of update) {
      await db.updateMemberEtlFields(m.dbId, { rank: m.rank, firstName: m.firstName, lastName: m.lastName, memberOsmId: m.memberOsmId });
    }
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Members Synced from OSM', { addedCount: add.length, updatedCount: update.length });
    logger.info('[Members] OSM sync complete', { added: add.length, updated: update.length, actor });
    res.json({ success: true, added: add.length, updated: update.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/import", hasRole("admin"), async (req, res) => {
  if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
  try {
    await db.bulkAddMembers(req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, 'Member', 'Members Imported', {
      importedCount: req.body?.length || 0,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
