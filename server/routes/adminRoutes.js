const express = require('express');
const router = express.Router();
const { sendOtp, verifyOtp } = require('../controllers/adminAuthController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const adminController = require('../controllers/adminController');
const { loginLimiter } = require("../middleware/security");

// --- PUBLIC ROUTES (No Auth Required) ---

// @route POST /api/admin/send-otp
// @desc Send OTP to admin email
// @access Public
router.post('/send-otp', loginLimiter, sendOtp);

// @route POST /api/admin/verify-otp
// @desc Verify OTP and issue JWT
// @access Public
router.post('/verify-otp', loginLimiter, verifyOtp);

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

// @route POST /api/admin/logout
// @desc Confirm token validity and hint client to remove token
// @access Private (Admin only)
router.post('/logout', adminAuthMiddleware, (req, res) => {
  res.status(200).json({ message: "Admin logout successful. Please clear token from client-side." });
});

module.exports = router;
