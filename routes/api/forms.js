
const express = require("express");
const router = express.Router();
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

const db = require("../../services/db");
const formsService = require("../../services/forms-service");
const { hasRole } = require("../../middleware/auth");
const { validateForm, validateBulkData } = require("../../middleware/validation");

const upload = multer({ dest: "uploads/" });

router.get("/", hasRole("admin"), async (req, res) => {
  try {
    res.json(await formsService.getAllForms());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/export/all", hasRole("admin"), async (req, res) => {
  try {
    const forms = await formsService.getAllFormsFull();
    const filename = `all_forms_export_${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(forms, null, 2));
  } catch (e) {
    res.status(500).send(e.message);
  }
});

router.post("/import/all", hasRole("admin"), upload.single("formsFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  try {
    const fileContent = fs.readFileSync(req.file.path, "utf8");
    const data = JSON.parse(fileContent);

    const { error, value } = validateBulkData(data);
    if (error) {
      return res.status(400).json({
        error: "Import Failed: Schema Mismatch",
        details: error.details.map((d) => d.message),
      });
    }

    await formsService.importBulkForms(value);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Forms", "Bulk Import (Wipe & Replace)", {
      formsImportedCount: value.length,
      sourceFile: req.file.originalname,
    });
    fs.unlinkSync(req.file.path);
    res.json({ success: true, count: value.length });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Import failed: " + e.message });
  }
});

router.get("/:id", async (req, res) => {
  // This route has no hasRole() guard so that members can fetch their own form; the session check below prevents unauthenticated access
  if (!req.session.loggedIn) return res.status(401).json({ error: "Unauthorized" });
  try {
    const form = await formsService.getFormById(req.params.id);
    if (!form) return res.status(404).json({ error: "Form not found" });
    res.json(form);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", hasRole("admin"), validateForm, async (req, res) => {
  try {
    const { name, status, intro, structure } = req.body;
    const id = await formsService.createForm(name, status, intro, structure);
    const newForm = await formsService.getFormById(id);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Forms", "Created Form", {
      formId: id,
      formName: name,
      questionCount: structure.length,
      status: status ? "Active" : "Draft",
    });
    res.json(newForm);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", hasRole("admin"), validateForm, async (req, res) => {
  try {
    await formsService.updateForm(req.params.id, req.body);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Forms", "Updated Form", {
      formId: req.params.id,
      formName: req.body.name || "N/A",
      updateType: req.body.structure ? "Full Content Edit" : "Status Change",
      newStatus: req.body.status !== undefined ? (req.body.status ? "Enabled" : "Disabled") : "Unchanged",
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", hasRole("admin"), async (req, res) => {
  try {
    const formToDelete = await formsService.getFormById(req.params.id);
    if (formToDelete) {
      await formsService.deleteForm(req.params.id);
      const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
      await db.logEvent(actor, "Forms", "Deleted Form", {
        formId: req.params.id,
        formName: formToDelete.name,
      });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/export", hasRole("admin"), async (req, res) => {
  try {
    const form = await formsService.getFormById(req.params.id);
    if (!form) return res.status(404).send("Form not found");
    const filename = `form_export_${form.id}_${form.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    
    const exportData = {
      name: form.name,
      intro: form.intro,
      status: form.status,
      structure: form.structure,
    };
    res.send(JSON.stringify(exportData, null, 2));
  } catch (e) {
    res.status(500).send(e.message);
  }
});

router.post("/import", hasRole("admin"), upload.single("formFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  try {
    const fileContent = fs.readFileSync(req.file.path, "utf8");
    const data = JSON.parse(fileContent);
    if (!data.name || !Array.isArray(data.structure)) {
      throw new Error("Invalid form structure file.");
    }
    const id = await formsService.createForm(data.name, data.status, data.intro, data.structure);
    const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
    await db.logEvent(actor, "Forms", "Form Imported", {
      formId: id,
      formName: data.name,
      sourceFile: req.file.originalname,
    });
    fs.unlinkSync(req.file.path);
    res.json({ success: true, id });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Import failed: " + e.message });
  }
});

router.get("/public/:publicId", async (req, res) => {
  try {
    const form = await formsService.getFormByPublicId(req.params.publicId);
    if (!form) return res.status(404).json({ error: "Form not found" });

    const isAdmin = req.session?.user?.role === "admin" || req.session?.user?.role === "superadmin";
    // Correct answers are stripped for non-admins so members can't see rubric answers before submitting
    const structure = (form.structure || []).map((field) => {
      const { correctAnswer, ...publicField } = field;
      return isAdmin ? field : publicField;
    });

    res.json({
      name: form.name,
      intro: form.intro,
      status: form.status,
      structure: structure,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/usage", hasRole("admin"), async (req, res) => {
  try {
    const usage = await formsService.getFormUsage(req.params.id);
    res.json({ count: usage.length, skills: usage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;