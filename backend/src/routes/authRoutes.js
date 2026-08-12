const express = require("express");
const router = express.Router();
const {
  register,
  login,
  logout,
  refresh,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/refresh", refresh);

// Protected routes
router.post("/logout", authenticate, logout);

module.exports = router;
