const express = require("express");
const router = express.Router();
const {
  sendRequest,
  unsendRequest,
  getPendingRequests,
  getSentRequests,
  respondToRequest,
  getAcceptedChats,
  getRequestStatuses,
} = require("../controllers/requestController");

router.get("/", (req, res) => res.send("Request routes working"));

router.post("/send", sendRequest);
router.delete("/:requestId", unsendRequest);
router.get("/pending/:email", getPendingRequests);
router.get("/sent/:email", getSentRequests);
router.post("/respond", respondToRequest);
router.get("/accepted/:email", getAcceptedChats);
router.get("/statuses/:email", getRequestStatuses);

module.exports = router;
