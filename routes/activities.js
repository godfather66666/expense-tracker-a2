const express = require("express");
const {
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity
} = require("../controllers/activitiesController");
const { authenticate, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get("/", listActivities);
router.post("/", createActivity);
router.put("/:id", updateActivity);
router.delete("/:id", deleteActivity);

module.exports = router;
