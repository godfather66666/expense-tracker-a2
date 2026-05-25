const { pool } = require("../db");

const activitySelectSql = `
  SELECT
    ua.id,
    ua.user_id,
    COALESCE(u.name, 'Deleted user') AS user_name,
    COALESCE(u.email, 'unknown') AS user_email,
    ua.action,
    ua.entity_type,
    ua.entity_id,
    ua.details,
    ua.reviewed,
    DATE_FORMAT(ua.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
    DATE_FORMAT(ua.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
  FROM user_activities ua
  LEFT JOIN users u ON ua.user_id = u.id
`;

function parsePositiveId(idValue) {
  const id = Number(idValue);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function logActivity(userId, action, entityType, entityId = null, details = "") {
  await pool.execute(
    `
      INSERT INTO user_activities (user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      userId || null,
      String(action || "").slice(0, 80),
      String(entityType || "").slice(0, 80),
      entityId || null,
      String(details || "").slice(0, 255)
    ]
  );
}

async function listActivities(req, res, next) {
  try {
    const query = String(req.query.q || "").trim();
    const params = [];
    let whereSql = "";

    if (query) {
      whereSql = `
        WHERE ua.action LIKE ?
          OR ua.entity_type LIKE ?
          OR ua.details LIKE ?
          OR u.name LIKE ?
          OR u.email LIKE ?
      `;
      const likeQuery = `%${query}%`;
      params.push(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
    }

    const [rows] = await pool.execute(
      `${activitySelectSql} ${whereSql} ORDER BY ua.created_at DESC, ua.id DESC LIMIT 200`,
      params
    );

    res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
}

async function createActivity(req, res, next) {
  try {
    const action = String(req.body.action || "admin_note").trim();
    const details = String(req.body.details || "").trim();

    if (!details || details.length < 3) {
      return res.status(400).json({
        message: "Activity details must be at least 3 characters long."
      });
    }

    const [result] = await pool.execute(
      `
        INSERT INTO user_activities (user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'user_activity', NULL, ?)
      `,
      [req.user.id, action.slice(0, 80), details.slice(0, 255)]
    );

    const [rows] = await pool.execute(`${activitySelectSql} WHERE ua.id = ?`, [result.insertId]);

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
}

async function updateActivity(req, res, next) {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid activity id."
      });
    }

    const reviewed = req.body.reviewed ? 1 : 0;
    const details = req.body.details === undefined ? null : String(req.body.details || "").trim();

    const [existingRows] = await pool.execute(`${activitySelectSql} WHERE ua.id = ?`, [id]);

    if (!existingRows.length) {
      return res.status(404).json({
        message: "Activity not found."
      });
    }

    if (details === null) {
      await pool.execute(
        "UPDATE user_activities SET reviewed = ? WHERE id = ?",
        [reviewed, id]
      );
    } else {
      await pool.execute(
        "UPDATE user_activities SET reviewed = ?, details = ? WHERE id = ?",
        [reviewed, details.slice(0, 255), id]
      );
    }

    await logActivity(req.user.id, "activity_review_updated", "user_activity", id, "Admin updated an activity log entry.");

    const [rows] = await pool.execute(`${activitySelectSql} WHERE ua.id = ?`, [id]);
    res.status(200).json(rows[0]);
  } catch (error) {
    next(error);
  }
}

async function deleteActivity(req, res, next) {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid activity id."
      });
    }

    const [existingRows] = await pool.execute("SELECT id FROM user_activities WHERE id = ?", [id]);

    if (!existingRows.length) {
      return res.status(404).json({
        message: "Activity not found."
      });
    }

    await pool.execute("DELETE FROM user_activities WHERE id = ?", [id]);

    res.status(200).json({
      message: "Activity deleted successfully."
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  logActivity,
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity
};
