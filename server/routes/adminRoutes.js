const express = require('express');
const router = express.Router();
const { sendOtp, verifyOtp } = require('../controllers/adminAuthController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const adminController = require('../controllers/adminController');

// --- PUBLIC ROUTES (No Auth Required) ---

// @route POST /api/admin/send-otp
// @desc Send OTP to admin email
// @access Public
router.post('/send-otp', sendOtp);

// @route POST /api/admin/verify-otp
// @desc Verify OTP and issue JWT
// @access Public
router.post('/verify-otp', verifyOtp);

// --- PROTECTED ROUTES (JWT Required) ---

// @route GET /api/admin/stats
// @desc Get dashboard statistics
// @access Private (Admin only)
router.get('/stats', adminAuthMiddleware, adminController.getDashboardStats);

// @route GET /api/admin/messages
// @desc Get all messages
// @access Private (Admin only)
router.get('/messages', adminAuthMiddleware, adminController.getAllMessages);

// @route GET /api/admin/feedback
// @desc Get all feedback
// @access Private (Admin only)
router.get('/feedback', adminAuthMiddleware, adminController.getAllFeedback);

// @route GET /api/admin/users
// @desc Get all users
// @access Private (Admin only)
router.get('/users', adminAuthMiddleware, adminController.getAllUsers);

// @route GET /api/admin/message-stats
// @desc Get message statistics (top senders, etc.)
// @access Private (Admin only)
router.get('/message-stats', adminAuthMiddleware, adminController.getMessageStats);

// @route DELETE /api/admin/users/:email
// @desc Delete a user from MongoDB + Firebase Auth
// @access Private (Admin only)
router.delete('/users/:email', adminAuthMiddleware, adminController.adminDeleteUser);

// @route GET /api/admin/health
// @desc System health check
// @access Private (Admin only)
router.get('/health', adminAuthMiddleware, adminController.getSystemHealth);

// @route GET /api/admin/users/:email/detail
// @desc Get user detail with activity
// @access Private (Admin only)
router.get('/users/:email/detail', adminAuthMiddleware, adminController.getUserDetail);

// @route POST /api/admin/broadcast
// @desc Broadcast message to all users
// @access Private (Admin only)
router.post('/broadcast', adminAuthMiddleware, adminController.broadcastMessage);

// @route POST /api/admin/feedback/:id/reply
// @desc Reply to feedback
// @access Private (Admin only)
router.post('/feedback/:id/reply', adminAuthMiddleware, adminController.replyToFeedback);

// @route POST /api/admin/logout
// @desc Confirm token validity and hint client to remove token
// @access Private (Admin only)
router.post('/logout', adminAuthMiddleware, (req, res) => {
  res.status(200).json({ message: "Admin logout successful. Please clear token from client-side." });
});

module.exports = router;