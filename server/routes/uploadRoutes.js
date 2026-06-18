const express = require("express");
const router = express.Router();
const { uploadFile } = require("../controllers/uploadController");
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../middleware/uploadSecurity");

router.post("/", requireAuth, upload.single("file"), uploadFile);

module.exports = router;
