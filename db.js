const mysql = require("mysql2/promise");
const config = require("./config");

const pool = mysql.createPool({
  ...config.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  multipleStatements: false
});

async function testConnection() {
  const connection = await pool.getConnection();
  connection.release();
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.execute(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  return Number(rows[0]?.total || 0) > 0;
}

async function addColumnIfMissing(tableName, columnName, alterSql) {
  if (!(await columnExists(tableName, columnName))) {
    await pool.execute(alterSql);
  }
}

async function initializeDatabase() {
  // A2 requires three database-backed entities: users, expense items, and user activities.
  // The server checks/creates these tables at startup so the demo can run after npm start.
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'member',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_role (role),
      INDEX idx_users_status (status)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      expense_date DATE NOT NULL,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_expenses_user_id (user_id),
      INDEX idx_expenses_category (category),
      INDEX idx_expenses_date (expense_date)
    )
  `);

  await addColumnIfMissing(
    "expenses",
    "user_id",
    "ALTER TABLE expenses ADD COLUMN user_id INT NULL AFTER id"
  );
  await addColumnIfMissing(
    "expenses",
    "created_at",
    "ALTER TABLE expenses ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
  );
  await addColumnIfMissing(
    "expenses",
    "updated_at",
    "ALTER TABLE expenses ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  );

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_activities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id INT NULL,
      details VARCHAR(255),
      reviewed TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_activities_user_id (user_id),
      INDEX idx_activities_action (action),
      INDEX idx_activities_created_at (created_at)
    )
  `);
}

module.exports = {
  pool,
  testConnection,
  initializeDatabase
};
