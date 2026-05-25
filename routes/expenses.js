const express = require("express");
const {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense
} = require("../controllers/expensesController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

router.get("/", getAllExpenses);
router.post("/", createExpense);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

module.exports = router;
