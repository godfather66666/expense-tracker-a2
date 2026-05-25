const express = require("express");
const {
  listUsers,
  createUser,
  updateUser,
  deleteUser
} = require("../controllers/usersController");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get("/", listUsers);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
