const { Op } = require("sequelize");
const { User, Role, RefreshToken, PasswordResetToken } = require("../models");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  generateResetToken,
  getRefreshTokenExpiryDate,
} = require("../utils/tokenUtils");
const { sendPasswordResetEmail } = require("../utils/emailUtils");

/**
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role_id } = req.body;

    // Validation
    const missing = [];
    if (!name) missing.push("name");
    if (!email) missing.push("email");
    if (!password) missing.push("password");
    if (missing.length > 0) {
      return res
        .status(400)
        .json({ message: `Missing required fields: ${missing.join(", ")}` });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Password length validation
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        message: "Password must be between 8 and 128 characters long",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // Default role to Developer (id: 3) if not provided
    const assignedRoleId = role_id || 3;

    // Verify the role exists
    const role = await Role.findByPk(assignedRoleId);
    if (!role) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role_id: assignedRoleId,
    });

    // Generate tokens
    const userWithRole = await User.findOne({
      where: { id: user.id },
      include: [{ model: Role, as: "role" }],
    });

    const accessToken = generateAccessToken(userWithRole);
    const refreshToken = generateRefreshToken(userWithRole);

    // Store refresh token
    await RefreshToken.create({
      token: refreshToken,
      user_id: user.id,
      expires_at: getRefreshTokenExpiryDate(),
    });

    return res.status(201).json({
      message: "Registration successful",
      accessToken,
      refreshToken,
      user: {
        id: userWithRole.id,
        name: userWithRole.name,
        email: userWithRole.email,
        role: userWithRole.role.name,
      },
    });
  } catch (error) {
    console.error("Register error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      const missing = [];
      if (!email) missing.push("email");
      if (!password) missing.push("password");
      return res
        .status(400)
        .json({ message: `Missing required fields: ${missing.join(", ")}` });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Find user with role
    const user = await User.findOne({
      where: { email },
      include: [{ model: Role, as: "role" }],
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in database
    await RefreshToken.create({
      token: refreshToken,
      user_id: user.id,
      expires_at: getRefreshTokenExpiryDate(),
    });

    return res.status(200).json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    // Verify the token is valid
    let decoded;
    try {
      decoded = verifyToken(refreshToken);
    } catch (error) {
      return res
        .status(400)
        .json({ message: "Invalid or expired refresh token" });
    }

    // Find the token in database
    const tokenRecord = await RefreshToken.findOne({
      where: { token: refreshToken },
    });

    if (!tokenRecord) {
      return res.status(400).json({ message: "Invalid refresh token" });
    }

    if (tokenRecord.is_blacklisted) {
      return res
        .status(400)
        .json({ message: "Token has already been invalidated" });
    }

    // Blacklist the token
    await tokenRecord.update({ is_blacklisted: true });

    return res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/auth/refresh
 */
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    // Check if token is blacklisted
    const tokenRecord = await RefreshToken.findOne({
      where: { token: refreshToken },
    });

    if (tokenRecord && tokenRecord.is_blacklisted) {
      return res.status(403).json({ message: "Invalid token" });
    }

    // Verify the token
    let decoded;
    try {
      decoded = verifyToken(refreshToken);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired" });
      }
      return res.status(403).json({ message: "Invalid token" });
    }

    // Find user
    const user = await User.findOne({
      where: { id: decoded.id },
      include: [{ model: Role, as: "role" }],
    });

    if (!user) {
      return res.status(403).json({ message: "Invalid token" });
    }

    // Blacklist the old refresh token
    if (tokenRecord) {
      await tokenRecord.update({ is_blacklisted: true });
    }

    // Generate new token pair
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Store new refresh token
    await RefreshToken.create({
      token: newRefreshToken,
      user_id: user.id,
      expires_at: getRefreshTokenExpiryDate(),
    });

    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Refresh error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validation
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Rate limiting: max 5 requests per 15 minutes per email
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const user = await User.findOne({ where: { email } });

    if (user) {
      const recentRequests = await PasswordResetToken.count({
        where: {
          user_id: user.id,
          created_at: { [Op.gte]: fifteenMinutesAgo },
        },
      });

      if (recentRequests >= 5) {
        return res.status(429).json({
          message: "Too many password reset attempts. Please try again later.",
        });
      }

      // Invalidate previous tokens
      await PasswordResetToken.update(
        { is_used: true },
        { where: { user_id: user.id, is_used: false } }
      );

      // Generate new reset token
      const resetToken = generateResetToken();
      await PasswordResetToken.create({
        token: resetToken,
        user_id: user.id,
        expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      });

      // Send email (don't await to avoid timing attacks)
      sendPasswordResetEmail(email, resetToken).catch((err) => {
        console.error("Failed to send reset email:", err.message);
      });
    }

    // Always return success to prevent user enumeration
    return res.status(200).json({
      message:
        "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Validation
    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({
        message: "Password must be between 8 and 128 characters long",
      });
    }

    // Find the reset token
    const resetTokenRecord = await PasswordResetToken.findOne({
      where: { token, is_used: false },
    });

    if (!resetTokenRecord) {
      return res.status(400).json({ message: "Invalid token" });
    }

    // Check expiry
    if (new Date() > resetTokenRecord.expires_at) {
      await resetTokenRecord.update({ is_used: true });
      return res.status(400).json({ message: "Token expired" });
    }

    // Update password
    const user = await User.findByPk(resetTokenRecord.user_id);
    if (!user) {
      return res.status(400).json({ message: "Invalid token" });
    }

    user.password = newPassword;
    await user.save(); // beforeUpdate hook will hash the password

    // Invalidate the used token
    await resetTokenRecord.update({ is_used: true });

    // Invalidate all refresh tokens for this user
    await RefreshToken.update(
      { is_blacklisted: true },
      { where: { user_id: user.id, is_blacklisted: false } }
    );

    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Reset password error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  register,
  login,
  logout,
  refresh,
  forgotPassword,
  resetPassword,
};
