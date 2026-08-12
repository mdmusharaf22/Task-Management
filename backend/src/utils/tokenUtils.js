const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role?.name || user.roleName,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role?.name || user.roleName,
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

const generateResetToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const getRefreshTokenExpiryDate = () => {
  const match = REFRESH_TOKEN_EXPIRY.match(/^(\d+)([dhms])$/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    const ms = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
    return new Date(Date.now() + value * ms[unit]);
  }
  // Default 7 days
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  generateResetToken,
  getRefreshTokenExpiryDate,
};
