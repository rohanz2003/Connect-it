const express = require("express");
const router = express.Router();
const { getActiveDevices, revokeDevice } = require("../controllers/deviceController");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth, getActiveDevices);
router.delete("/:deviceId", requireAuth, revokeDevice);

module.exports = router;
