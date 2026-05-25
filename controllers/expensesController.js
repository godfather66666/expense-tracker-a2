const { pool } = require("../db");
const { logActivity } = require("./activitiesController");

const expenseSelectSql = `
  SELECT
    e.id,
    e.user_id,
    COALESCE(u.name, 'Unassigned') AS owner_name,
    e.title,
    e.category,
    e.amount,
    DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS date,
    e.description,
    DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
    DATE_FORMAT(e.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
  FROM expenses e
  LEFT JOIN users u ON e.user_id = u.id
`;

function buildExpensePayload(body) {
  return {
    title: String(body.title || "").trim(),
    category: String(body.category || "").trim(),
    amount: Number(body.amount),
    date: String(body.date || "").trim().slice(0, 10),
    description: String(body.description || "").trim()
  };
}

function validateExpensePayload(payload) {
  if (!payload.title || payload.title.length < 2) {
    return "Title must be at least 2 characters long.";
  }

  if (!payload.category || payload.category.length < 2) {
    return "Category must be at least 2 characters long.";
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return "Amount must be a valid number greater than 0.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    return "A valid date is required.";
  }

  return null;
}

function parseExpenseId(idValue) {
  const id = Number(idValue);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function addAccessFilter(req, whereParts, params, tableAlias = "e") {
  if (req.user.role !== "admin") {
    whereParts.push(`${tableAlias}.user_id = ?`);
    params.push(req.user.id);
  }
}

function buildWhereSql(whereParts) {
  return whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
}

async function findExpenseById(req, id) {
  const whereParts = ["e.id = ?"];
  const params = [id];
  addAccessFilter(req, whereParts, params);

  const [rows] = await pool.execute(
    `${expenseSelectSql} ${buildWhereSql(whereParts)}`,
    params
  );

  return rows[0] || null;
}

async function getAllExpenses(req, res, next) {
  try {
    const whereParts = [];
    const params = [];
    const query = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();

    addAccessFilter(req, whereParts, params);

    if (query) {
      whereParts.push("(e.title LIKE ? OR e.category LIKE ? OR e.description LIKE ? OR u.name LIKE ?)");
      const likeQuery = `%${query}%`;
      params.push(likeQuery, likeQuery, likeQuery, likeQuery);
    }

    if (category && category !== "All categories") {
      whereParts.push("e.category = ?");
      params.push(category);
    }

    const [rows] = await pool.execute(
      `
        ${expenseSelectSql}
        ${buildWhereSql(whereParts)}
        ORDER BY e.expense_date DESC, e.id DESC
      `,
      params
    );

    res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
}

async function createExpense(req, res, next) {
  try {
    const payload = buildExpensePayload(req.body);
    const validationMessage = validateExpensePayload(payload);

    if (validationMessage) {
      return res.status(400).json({
        message: validationMessage
      });
    }

    const [result] = await pool.execute(
      `
        INSERT INTO expenses (user_id, title, category, amount, expense_date, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.id,
        payload.title,
        payload.category,
        payload.amount,
        payload.date,
        payload.description
      ]
    );

    await logActivity(req.user.id, "expense_created", "expense_item", result.insertId, payload.title);

    const createdExpense = await findExpenseById(req, result.insertId);
    res.status(201).json(createdExpense);
  } catch (error) {
    next(error);
  }
}

async function updateExpense(req, res, next) {
  try {
    const id = parseExpenseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid expense id."
      });
    }

    const payload = buildExpensePayload(req.body);
    const validationMessage = validateExpensePayload(payload);

    if (validationMessage) {
      return res.status(400).json({
        message: validationMessage
      });
    }

    const existingExpense = await findExpenseById(req, id);

    if (!existingExpense) {
      return res.status(404).json({
        message: "Expense not found."
      });
    }

    const whereParts = ["id = ?"];
    const params = [
      payload.title,
      payload.category,
      payload.amount,
      payload.date,
      payload.description,
      id
    ];

    if (req.user.role !== "admin") {
      whereParts.push("user_id = ?");
      params.push(req.user.id);
    }

    await pool.execute(
      `
        UPDATE expenses
        SET title = ?, category = ?, amount = ?, expense_date = ?, description = ?
        WHERE ${whereParts.join(" AND ")}
      `,
      params
    );

    await logActivity(req.user.id, "expense_updated", "expense_item", id, payload.title);

    const updatedExpense = await findExpenseById(req, id);
    res.status(200).json(updatedExpense);
  } catch (error) {
    next(error);
  }
}

async function deleteExpense(req, res, next) {
  try {
    const id = parseExpenseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "Invalid expense id."
      });
    }

    const existingExpense = await findExpenseById(req, id);

    if (!existingExpense) {
      return res.status(404).json({
        message: "Expense not found."
      });
    }

    const whereParts = ["id = ?"];
    const params = [id];

    if (req.user.role !== "admin") {
      whereParts.push("user_id = ?");
      params.push(req.user.id);
    }

    await pool.execute(
      `DELETE FROM expenses WHERE ${whereParts.join(" AND ")}`,
      params
    );

    await logActivity(req.user.id, "expense_deleted", "expense_item", id, existingExpense.title);

    res.status(200).json({
      message: "Expense deleted successfully."
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense
};
