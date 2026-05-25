const { pool } = require("../db");
const { verifyJwt, createSafeUser } = require("../utils/security");

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        message: "Authentication is required."
      });
    }

    const claims = verifyJwt(token);
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
