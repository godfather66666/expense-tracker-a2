const { pool } = require("../db");
const {
  hashPassword,
  verifyPassword,
  signJwt,
  createSafeUser
} = require("../utils/security");
const { logActivity } = require("./activitiesController");

function buildAuthUserPayload(body) {
  return {
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    password: String(body.password || "")
  };
}

function validateRegistration(payload) {
  if (!payload.name || payload.name.length < 2) {
    return "Name must be at least 2 characters long.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return "A valid email address is required.";
  }

  if (payload.password.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  return null;
}

function buildAuthResponse(user) {
  return {
    token: signJwt({
      sub: user.id,
      email: user.email,
      role: user.role
    }),
    user: createSafeUser(user)
  };
}

async function register(req, res, next) {
  try {
    const payload = buildAuthUserPayload(req.body);
    const validationMessage = validateRegistration(payload);

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

    const [countRows] = await pool.execute("SELECT COUNT(*) AS total FROM users");
    const role = Number(countRows[0]?.total || 0) === 0 ? "admin" : "member";
    const passwordHash = hashPassword(payload.password);

    const [result] = await pool.execute(
      `
        INSERT INTO users (name, email, password_hash, role, status)
        VALUES (?, ?, ?, ?, 'active')
      `,
      [payload.name, payload.email, passwordHash, role]
    );

    const [rows] = await pool.execute(
      `
        SELECT id, name, email, role, status, created_at, updated_at
        FROM users
        WHERE id = ?
      `,
      [result.insertId]
    );
    const user = rows[0];

    await logActivity(user.id, "register", "user", user.id, `${user.email} registered as ${user.role}.`);

    res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const [rows] = await pool.execute(
      `
        SELECT id, name, email, password_hash, role, status, created_at, updated_at
        FROM users
        WHERE email = ?
      `,
      [email]
    );
    const user = rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        message: "This account has been disabled."
      });
    }

    await logActivity(user.id, "login", "user", user.id, `${user.email} logged in.`);

    res.status(200).json(buildAuthResponse(user));
  } catch (error) {
    next(error);
  }
}

async function getCurrentUser(req, res) {
  res.status(200).json({
    user: req.user
  });
}

async function updateCurrentUser(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();

    if (!name || name.length < 2) {
      return res.status(400).json({
        message: "Name must be at least 2 characters long."
      });
    }

    await pool.execute(
      "UPDATE users SET name = ? WHERE id = ?",
      [name, req.user.id]
    );

    const [rows] = await pool.execute(
      `
        SELECT id, name, email, role, status, created_at, updated_at
        FROM users
        WHERE id = ?
      `,
      [req.user.id]
    );

    await logActivity(req.user.id, "profile_updated", "user", req.user.id, "User updated profile name.");

    res.status(200).json({
      user: createSafeUser(rows[0])
    });
  } catch (error) {
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    await logActivity(req.user.id, "logout", "user", req.user.id, `${req.user.email} logged out.`);
    res.status(200).json({
      message: "Logged out successfully."
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  getCurrentUser,
  updateCurrentUser,
  logout
};
