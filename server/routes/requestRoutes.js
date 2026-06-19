const express = require("express");
const router = express.Router();
const {
  sendRequest,
  getPendingRequests,
  getSentRequests,
  respondToRequest,
  getAcceptedChats,
} = require("../controllers/requestController");

router.get("/", (req, res) => res.send("Request routes working"));

router.post("/send", sendRequest);
router.get("/pending/:email", getPendingRequests);
router.get("/sent/:email", getSentRequests);
router.post("/respond", respondToRequest);
router.get("/accepted/:email", getAcceptedChats);

module.exports = router;
