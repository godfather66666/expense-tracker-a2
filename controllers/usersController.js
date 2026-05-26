const { pool } = require("../db");
const { hashPassword, createSafeUser } = require("../utils/security");
const { logActivity } = require("./activitiesController");

const userSelectSql = `
  SELECT
    u.id,
    u.name,
    u.email,
    u.role,
    u.status,
    DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
    DATE_FORMAT(u.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
    COUNT(DISTINCT e.id) AS expense_count,
    COUNT(DISTINCT ua.id) AS activity_count
  FROM users u
  LEFT JOIN expenses e ON e.user_id = u.id
  LEFT JOIN user_activities ua ON ua.user_id = u.id
`;

function parseUserId(idValue) {
  const id = Number(idValue);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateUserPayload(payload, requirePassword = false) {
  if (!payload.name || payload.name.length < 2) {
    return "Name must be at least 2 characters long.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return "A valid email address is required.";
  }

  if (requirePassword && String(payload.password || "").length < 8) {
    return "Password must be at least 8 characters long.";
  }

  if (!["admin", "member"].includes(payload.role)) {
    return "Role must be either admin or member.";
  }

  if (!["active", "disabled"].includes(payload.status)) {
    return "Status must be either active or disabled.";
  }

  return null;
}

function buildUserPayload(body) {
  return {
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    password: String(body.password || ""),
    role: String(body.role || "member").trim(),
    status: String(body.status || "active").trim()
  };
}

async function listUsers(req, res, next) {
  try {
    const query = String(req.query.q || "").trim();
    const params = [];
    let whereSql = "";

    if (query) {
      // Admin page search filters users by name, email, role, or status.
      whereSql = "WHERE u.name LIKE ? OR u.email LIKE ? OR u.role LIKE ? OR u.status LIKE ?";
      const likeQuery = `%${query}%`;
      params.push(likeQuery, likeQuery, likeQuery, likeQuery);
    }

    const [rows] = await pool.execute(
      `
        ${userSelectSql}
        ${whereSql}
        GROUP BY u.id
        ORDER BY u.created_at DESC, u.id DESC
      `,
      params
    );

    res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
}

async function createUser(req, res, next) {
  try {
    // Admin-created accounts complete the Create part of user CRUD.
    const payload = buildUserPayload(req.body);
    const validationMessage = validateUserPayload(payload, true);

    if (validationMessage) {
      return res.status(400).json({
        message: validationMessage
      });
    }

    const [existingRows] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [payload.email]
    );

    if (existingRows.length) {
      return res.status(409).json({
        message: "This email address is already registered."
      });
    }

    const [result] = await pool.execute(
      `
        INSERT INTO users (name, email, password_hash, role, status)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        payload.name,
        payload.email,
        hashPassword(payload.password),
        payload.role,
        payload.status
      ]
    );

    await logActivity(req.user.id, "user_created", "user", result.insertId, `Admin created ${payload.email}.`);

    const [rows] = await pool.execute(
      `
        SELECT id, name, email, role, status, created_at, updated_at
        FROM users
        WHERE id = ?
      `,
      [result.insertId]
    );

    res.status(201).json(createSafeUser(rows[0]));
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const id = parseUserId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid user id."
      });
    }

    const payload = buildUserPayload(req.body);
    const validationMessage = validateUserPayload(payload, false);

    if (validationMessage) {
      return res.status(400).json({
        message: validationMessage
      });
    }

    if (id === req.user.id && payload.status !== "active") {
      return res.status(400).json({
        message: "You cannot disable your own admin account."
      });
    }

    const [existingRows] = await pool.execute(
      "SELECT id FROM users WHERE id = ?",
      [id]
    );

    if (!existingRows.length) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    const [duplicateRows] = await pool.execute(
      "SELECT id FROM users WHERE email = ? AND id <> ?",
      [payload.email, id]
    );

    if (duplicateRows.length) {
      return res.status(409).json({
        message: "Another user already uses this email address."
      });
    }

    if (payload.password) {
      if (payload.password.length < 8) {
        return res.status(400).json({
          message: "Password must be at least 8 characters long."
        });
      }

      await pool.execute(
        `
          UPDATE users
          SET name = ?, email = ?, password_hash = ?, role = ?, status = ?
          WHERE id = ?
        `,
        [
          payload.name,
          payload.email,
          hashPassword(payload.password),
          payload.role,
          payload.status,
          id
        ]
      );
    } else {
      await pool.execute(
        `
          UPDATE users
          SET name = ?, email = ?, role = ?, status = ?
          WHERE id = ?
        `,
        [payload.name, payload.email, payload.role, payload.status, id]
      );
    }

    await logActivity(req.user.id, "user_updated", "user", id, `Admin updated ${payload.email}.`);

    const [rows] = await pool.execute(
      `
        SELECT id, name, email, role, status, created_at, updated_at
        FROM users
        WHERE id = ?
      `,
      [id]
    );

    res.status(200).json(createSafeUser(rows[0]));
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const id = parseUserId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid user id."
      });
    }

    if (id === req.user.id) {
      return res.status(400).json({
        message: "You cannot delete your own account while signed in."
      });
    }

    const [existingRows] = await pool.execute(
      "SELECT id, email FROM users WHERE id = ?",
      [id]
    );
    const existingUser = existingRows[0];

    if (!existingUser) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    // Preserve old expense/activity records for review instead of deleting related history.
    await pool.execute("UPDATE expenses SET user_id = NULL WHERE user_id = ?", [id]);
    await pool.execute("UPDATE user_activities SET user_id = NULL WHERE user_id = ?", [id]);
    await pool.execute("DELETE FROM users WHERE id = ?", [id]);

    await logActivity(req.user.id, "user_deleted", "user", id, `Admin deleted ${existingUser.email}.`);

    res.status(200).json({
      message: "User deleted successfully."
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser
};
