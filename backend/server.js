require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sequelize = require("./src/config/database");

// Validate required environment variables
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error(
    "❌ JWT_SECRET is not defined or is shorter than 32 characters."
  );
  console.error("   Current value length:", (process.env.JWT_SECRET || "").length);
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

// Routes
const authRoutes = require("./src/routes/authRoutes");
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("working");
});

const PORT = process.env.PORT || 5000;

// Import models to sync associations
require("./src/models");

sequelize
  .authenticate()
  .then(() => {
    console.log("✅ PostgreSQL Connected");
    return sequelize.sync({ alter: true });
  })
  .then(() => {
    console.log("✅ Database synced");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database Connection Failed");
    console.error(err.message);
  });
