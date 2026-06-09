const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Get AI conversation history
router.get('/conversation/:userId', aiController.getConversation);

// Send message to AI
router.post('/message', aiController.sendMessage);

// Clear conversation history
router.delete('/conversation/:userId', aiController.clearConversation);

module.exports = router;
