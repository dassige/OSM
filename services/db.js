// services/db.js — backwards-compatible facade
const { initDB, closeDB, getDbPath } = require("./db/connection");
const users = require("./db/users");
const members = require("./db/members");
const skills = require("./db/skills");
const preferences = require("./db/preferences");
const events = require("./db/events");
const training = require("./db/training");
const backup = require("./db/backup");
const surveys = require("./db/surveys");

module.exports = {
  initDB,
  closeDB,
  getDbPath,
  ...users,
  ...members,
  ...skills,
  ...preferences,
  ...events,
  ...training,
  ...backup,
  ...surveys,
};
