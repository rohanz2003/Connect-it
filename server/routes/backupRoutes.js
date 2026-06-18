const express = require("express");
const router = express.Router();
const { saveBackup, getBackup, deleteBackup } = require("../controllers/backupController");
const { requireAuth } = require("../middleware/auth");
const { backupRules } = require("../middleware/validators");

router.put("/", requireAuth, backupRules, saveBackup);
router.get("/", requireAuth, getBackup);
router.delete("/", requireAuth, deleteBackup);

module.exports = router;
