const User = require("./User");
const Role = require("./Role");
const RefreshToken = require("./RefreshToken");
const PasswordResetToken = require("./PasswordResetToken");

// Associations
Role.hasMany(User, { foreignKey: "role_id", as: "users" });
User.belongsTo(Role, { foreignKey: "role_id", as: "role" });

User.hasMany(RefreshToken, { foreignKey: "user_id", as: "refreshTokens" });
RefreshToken.belongsTo(User, { foreignKey: "user_id", as: "user" });

User.hasMany(PasswordResetToken, { foreignKey: "user_id", as: "resetTokens" });
PasswordResetToken.belongsTo(User, { foreignKey: "user_id", as: "user" });

module.exports = {
  User,
  Role,
  RefreshToken,
  PasswordResetToken,
};
