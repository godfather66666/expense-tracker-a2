const { pool } = require("../db");
const { verifyJwt, createSafeUser } = require("../utils/security");

async function authenticate(req, res, next) {
  try {
    // Protected routes expect Authorization: Bearer <jwt>.
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        message: "Authentication is required."
      });
    }

    const claims = verifyJwt(token);
    // Load the latest user state so disabled accounts cannot keep using old tokens.
    const [rows] = await pool.execute(
      `
        SELECT id, name, email, role, status, created_at, updated_at
        FROM users
        WHERE id = ?
      `,
      [claims.sub]
    );

    const user = rows[0];

    if (!user || user.status !== "active") {
      return res.status(401).json({
        message: "Your account is not active."
      });
    }

    req.user = createSafeUser(user);
    next();
  } catch (error) {
    res.status(401).json({
      message: error.message || "Invalid authentication token."
    });
  }
}

// Admin-only middleware protects user management and activity-log CRUD.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      message: "Administrator access is required."
    });
  }

  next();
}

module.exports = {
  authenticate,
  requireAdmin
};
