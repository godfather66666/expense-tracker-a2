const express = require("express");
const {
  register,
  login,
  getCurrentUser,
  updateCurrentUser,
  logout
} = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authenticate, getCurrentUser);
router.put("/me", authenticate, updateCurrentUser);
router.post("/logout", authenticate, logout);

module.exports = router;
