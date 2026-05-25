const express = require("express");
const path = require("path");
const config = require("./config");
const authRoutes = require("./routes/auth");
const expenseRoutes = require("./routes/expenses");
const userRoutes = require("./routes/users");
const activityRoutes = require("./routes/activities");
const { testConnection, initializeDatabase } = require("./db");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/users", userRoutes);
app.use("/api/activities", activityRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/script.js", (req, res) => {
  res.sendFile(path.join(__dirname, "script.js"));
});

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((req, res) => {
  res.status(404).json({
    message: "Resource not found."
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  res.status(error.status || 500).json({
    message: error.message || "Internal server error."
  });
});

async function startServer() {
  try {
    await testConnection();
    await initializeDatabase();
    console.log("Database connection established and schema checked.");

    app.listen(config.port, () => {
      console.log(`Server is running at http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error("Failed to start server.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
