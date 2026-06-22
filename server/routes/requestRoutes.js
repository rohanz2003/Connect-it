const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middleware/firebaseAuth");
const {
  sendRequest,
  unsendRequest,
  getPendingRequests,
  getSentRequests,
  respondToRequest,
  getAcceptedChats,
  getRequestStatuses,
  removeFriend,
} = require("../controllers/requestController");

router.get("/", (req, res) => res.send("Request routes working"));

router.post("/send", firebaseAuth, sendRequest);
router.delete("/:requestId", firebaseAuth, unsendRequest);
router.get("/pending/:email", firebaseAuth, getPendingRequests);
router.get("/sent/:email", firebaseAuth, getSentRequests);
router.post("/respond", firebaseAuth, respondToRequest);
router.post("/remove-friend", firebaseAuth, removeFriend);
router.get("/accepted/:email", firebaseAuth, getAcceptedChats);
router.get("/statuses/:email", firebaseAuth, getRequestStatuses);

module.exports = router;
