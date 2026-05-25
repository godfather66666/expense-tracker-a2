const API_BASE_URL = "/api";
const TOKEN_KEY = "expense_tracker_a2_token";
const CURRENCY_LOCALE = "en-AU";
const CURRENCY_CODE = "AUD";

const h = React.createElement;
const {
  useEffect,
  useMemo,
  useReducer,
  useState
} = React;

const currencyFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: "currency",
  currency: CURRENCY_CODE
});

const numberFormatter = new Intl.NumberFormat(CURRENCY_LOCALE);

const initialState = {
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  expenses: [],
  users: [],
  activities: [],
  activeTab: "expenses",
  loading: true,
  refreshing: false,
  toast: null,
  filters: {
    search: "",
    category: "All categories",
    sortBy: "date-desc"
  }
};

function reducer(state, action) {
  switch (action.type) {
    case "BOOT_SUCCESS":
      return {
        ...state,
        user: action.user,
        expenses: action.expenses,
        users: action.users,
        activities: action.activities,
        loading: false,
        refreshing: false
      };
    case "AUTH_SUCCESS":
      return {
        ...state,
        token: action.token,
        user: action.user,
        activeTab: "expenses",
        loading: false
      };
    case "SET_DATA":
      return {
        ...state,
        expenses: action.expenses,
        users: action.users,
        activities: action.activities,
        refreshing: false
      };
    case "SET_REFRESHING":
      return {
        ...state,
        refreshing: action.value
      };
    case "SET_FILTER":
      return {
        ...state,
        filters: {
          ...state.filters,
          [action.name]: action.value
        }
      };
    case "RESET_FILTERS":
      return {
        ...state,
        filters: {
          search: "",
          category: "All categories",
          sortBy: "date-desc"
        }
      };
    case "SET_TAB":
      return {
        ...state,
        activeTab: action.tab
      };
    case "SET_TOAST":
      return {
        ...state,
        toast: action.toast
      };
    case "CLEAR_TOAST":
      return {
        ...state,
        toast: null
      };
    case "LOGOUT":
      return {
        ...initialState,
        token: null,
        user: null,
        loading: false,
        toast: action.toast || null
      };
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [expenseModal, setExpenseModal] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  async function request(path, options = {}, tokenOverride = state.token) {
    const headers = {
      ...(options.headers || {})
    };

    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    if (tokenOverride) {
      headers.Authorization = `Bearer ${tokenOverride}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (response.status === 401 && tokenOverride) {
      localStorage.removeItem(TOKEN_KEY);
      dispatch({
        type: "LOGOUT",
        toast: {
          title: "Session ended",
          message: "Please sign in again.",
          type: "error"
        }
      });
    }

    if (!response.ok) {
      throw new Error(data?.message || "Request failed.");
    }

    return data;
  }

  async function loadWorkspaceData(user = state.user, token = state.token) {
    if (!user || !token) {
      return;
    }

    dispatch({ type: "SET_REFRESHING", value: true });

    const expensePromise = request("/expenses", {}, token);
    const userPromise = user.role === "admin" ? request("/users", {}, token) : Promise.resolve([]);
    const activityPromise = user.role === "admin" ? request("/activities", {}, token) : Promise.resolve([]);
    const [expenses, users, activities] = await Promise.all([
      expensePromise,
      userPromise,
      activityPromise
    ]);

    dispatch({
      type: "SET_DATA",
      expenses,
      users,
      activities
    });
  }

  useEffect(() => {
    let isActive = true;

    async function boot() {
      if (!state.token) {
        dispatch({ type: "LOGOUT" });
        return;
      }

      try {
        const me = await request("/auth/me", {}, state.token);
        const expensePromise = request("/expenses", {}, state.token);
        const userPromise = me.user.role === "admin" ? request("/users", {}, state.token) : Promise.resolve([]);
        const activityPromise = me.user.role === "admin" ? request("/activities", {}, state.token) : Promise.resolve([]);
        const [expenses, users, activities] = await Promise.all([
          expensePromise,
          userPromise,
          activityPromise
        ]);

        if (isActive) {
          dispatch({
            type: "BOOT_SUCCESS",
            user: me.user,
            expenses,
            users,
            activities
          });
        }
      } catch (error) {
        if (isActive) {
          localStorage.removeItem(TOKEN_KEY);
          dispatch({
            type: "LOGOUT",
            toast: {
              title: "Unable to restore session",
              message: error.message,
              type: "error"
            }
          });
        }
      }
    }

    boot();

    return () => {
      isActive = false;
    };
  }, [state.token]);

  useEffect(() => {
    if (!state.toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      dispatch({ type: "CLEAR_TOAST" });
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [state.toast]);

  const categories = useMemo(() => {
    const values = state.expenses.map((expense) => expense.category).filter(Boolean);
    return ["All categories", ...Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))];
  }, [state.expenses]);

  const visibleExpenses = useMemo(() => {
    const query = state.filters.search.trim().toLowerCase();
    const filtered = state.expenses.filter((expense) => {
      const matchesCategory =
        state.filters.category === "All categories" ||
        expense.category === state.filters.category;
      const matchesQuery =
        !query ||
        [expense.title, expense.category, expense.description, expense.owner_name]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesCategory && matchesQuery;
    });

    return [...filtered].sort((a, b) => {
      switch (state.filters.sortBy) {
        case "date-asc":
          return String(a.date).localeCompare(String(b.date));
        case "amount-desc":
          return Number(b.amount) - Number(a.amount);
        case "amount-asc":
          return Number(a.amount) - Number(b.amount);
        case "title-asc":
          return String(a.title).localeCompare(String(b.title));
        case "owner-asc":
          return String(a.owner_name).localeCompare(String(b.owner_name));
        case "date-desc":
        default:
          return String(b.date).localeCompare(String(a.date));
      }
    });
  }, [state.expenses, state.filters]);

  function showToast(title, message, type = "success") {
    dispatch({
      type: "SET_TOAST",
      toast: {
        title,
        message,
        type
      }
    });
  }

  async function handleAuth(mode, payload) {
    const path = mode === "register" ? "/auth/register" : "/auth/login";
    const data = await request(path, {
      method: "POST",
      body: JSON.stringify(payload)
    }, null);

    localStorage.setItem(TOKEN_KEY, data.token);
    dispatch({
      type: "AUTH_SUCCESS",
      token: data.token,
      user: data.user
    });

    await loadWorkspaceData(data.user, data.token);
    showToast("Signed in", `Welcome, ${data.user.name}.`, "success");
  }

  async function handleLogout() {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch (error) {
      // The local session can still be cleared if the token has already expired.
    }

    localStorage.removeItem(TOKEN_KEY);
    dispatch({
      type: "LOGOUT",
      toast: {
        title: "Signed out",
        message: "Your session has ended.",
        type: "success"
      }
    });
  }

  async function handleSaveExpense(payload) {
    const isEditing = Boolean(payload.id);
    const path = isEditing ? `/expenses/${payload.id}` : "/expenses";
    const method = isEditing ? "PUT" : "POST";

    await request(path, {
      method,
      body: JSON.stringify(payload)
    });

    setExpenseModal(null);
    await loadWorkspaceData();
    showToast(isEditing ? "Expense updated" : "Expense created", payload.title, "success");
  }

  async function handleDeleteExpense(expense) {
    setConfirmDialog({
      title: "Delete expense",
      message: `Delete "${expense.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await request(`/expenses/${expense.id}`, { method: "DELETE" });
        await loadWorkspaceData();
        showToast("Expense deleted", expense.title, "success");
      }
    });
  }

  async function handleUpdateProfile(name) {
    const data = await request("/auth/me", {
      method: "PUT",
      body: JSON.stringify({ name })
    });

    dispatch({
      type: "AUTH_SUCCESS",
      token: state.token,
      user: data.user
    });
    setProfileOpen(false);
    await loadWorkspaceData(data.user, state.token);
    showToast("Profile updated", "Your display name was changed.", "success");
  }

  async function handleCreateUser(payload) {
    await request("/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    await loadWorkspaceData();
    showToast("User created", payload.email, "success");
  }

  async function handleUpdateUser(id, payload) {
    await request(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    await loadWorkspaceData();
    showToast("User updated", payload.email, "success");
  }

  async function handleDeleteUser(user) {
    setConfirmDialog({
      title: "Delete user",
      message: `Delete "${user.email}"? Their expenses will become unassigned for admin review.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await request(`/users/${user.id}`, { method: "DELETE" });
        await loadWorkspaceData();
        showToast("User deleted", user.email, "success");
      }
    });
  }

  async function handleCreateActivity(payload) {
    await request("/activities", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    await loadWorkspaceData();
    showToast("Activity note added", payload.details, "success");
  }

  async function handleUpdateActivity(id, payload) {
    await request(`/activities/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    await loadWorkspaceData();
    showToast("Activity updated", "The activity log entry was saved.", "success");
  }

  async function handleDeleteActivity(activity) {
    setConfirmDialog({
      title: "Delete activity",
      message: `Delete activity #${activity.id}?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await request(`/activities/${activity.id}`, { method: "DELETE" });
        await loadWorkspaceData();
        showToast("Activity deleted", `Activity #${activity.id} was removed.`, "success");
      }
    });
  }

  if (state.loading) {
    return h("div", { className: "loading-page" }, "Loading Expense Tracker...");
  }

  if (!state.user) {
    return h(React.Fragment, null,
      h(AuthScreen, { onSubmit: handleAuth }),
      h(ToastArea, { toast: state.toast })
    );
  }

  return h(React.Fragment, null,
    h("div", { className: "app-shell" },
      h(AppHeader, {
        user: state.user,
        refreshing: state.refreshing,
        onProfile: () => setProfileOpen(true),
        onLogout: handleLogout
      }),
      h(Tabs, {
        activeTab: state.activeTab,
        isAdmin: state.user.role === "admin",
        onChange: (tab) => dispatch({ type: "SET_TAB", tab })
      }),
      state.activeTab === "expenses" && h(ExpenseDashboard, {
        user: state.user,
        expenses: visibleExpenses,
        allExpenses: state.expenses,
        categories,
        filters: state.filters,
        onFilter: (name, value) => dispatch({ type: "SET_FILTER", name, value }),
        onResetFilters: () => dispatch({ type: "RESET_FILTERS" }),
        onAdd: () => setExpenseModal({ mode: "create", expense: null }),
        onEdit: (expense) => setExpenseModal({ mode: "edit", expense }),
        onDelete: handleDeleteExpense
      }),
      state.activeTab === "users" && state.user.role === "admin" && h(AdminUsersPanel, {
        users: state.users,
        currentUser: state.user,
        onCreateUser: handleCreateUser,
        onUpdateUser: handleUpdateUser,
        onDeleteUser: handleDeleteUser
      }),
      state.activeTab === "activities" && state.user.role === "admin" && h(ActivityPanel, {
        activities: state.activities,
        onCreateActivity: handleCreateActivity,
        onUpdateActivity: handleUpdateActivity,
        onDeleteActivity: handleDeleteActivity
      })
    ),
    expenseModal && h(ExpenseModal, {
      expense: expenseModal.expense,
      onClose: () => setExpenseModal(null),
      onSave: handleSaveExpense
    }),
    profileOpen && h(ProfileModal, {
      user: state.user,
      onClose: () => setProfileOpen(false),
      onSave: handleUpdateProfile
    }),
    confirmDialog && h(ConfirmModal, {
      dialog: confirmDialog,
      onClose: () => setConfirmDialog(null),
      onError: (error) => showToast("Action failed", error.message, "error")
    }),
    h(ToastArea, { toast: state.toast })
  );
}

function AuthScreen({ onSubmit }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value
    }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setWorking(true);
    setError("");

    try {
      await onSubmit(mode, form);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setWorking(false);
    }
  }

  return h("main", { className: "auth-shell" },
    h("section", { className: "auth-panel" },
      h("div", { className: "auth-copy" },
        h("h1", null, "Expense Tracker A2"),
        h("p", null, "A single-page expense management system with authenticated users, real-time search, role-based admin tools, and database-backed activity auditing."),
        h("ul", null,
          h("li", null, "First registered account automatically becomes the administrator."),
          h("li", null, "Passwords are stored with PBKDF2 hashing."),
          h("li", null, "JWT tokens protect expense, user, and activity APIs.")
        )
      ),
      h("form", { className: "auth-form", onSubmit: submit },
        h("div", { className: "tabs" },
          h("button", {
            className: `mode-btn ${mode === "login" ? "is-active" : ""}`,
            type: "button",
            onClick: () => setMode("login")
          }, "Login"),
          h("button", {
            className: `mode-btn ${mode === "register" ? "is-active" : ""}`,
            type: "button",
            onClick: () => setMode("register")
          }, "Register")
        ),
        mode === "register" && h(Field, {
          label: "Name",
          name: "name",
          value: form.name,
          onChange: updateField,
          placeholder: "Your name"
        }),
        h(Field, {
          label: "Email",
          name: "email",
          type: "email",
          value: form.email,
          onChange: updateField,
          placeholder: "name@example.com"
        }),
        h(Field, {
          label: "Password",
          name: "password",
          type: "password",
          value: form.password,
          onChange: updateField,
          placeholder: "At least 8 characters"
        }),
        error && h("div", { className: "error-box" }, error),
        h("div", { className: "modal-foot" },
          h("button", {
            className: "btn btn-primary",
            type: "submit",
            disabled: working
          }, working ? "Please wait..." : mode === "register" ? "Create account" : "Sign in")
        )
      )
    )
  );
}

function AppHeader({ user, refreshing, onProfile, onLogout }) {
  return h("header", { className: "topbar" },
    h("div", null,
      h("h1", null, "Expense Tracker"),
      h("p", { className: "subtitle" }, "Manage personal spending, user accounts, and audit activity from one responsive single-page interface.")
    ),
    h("div", { className: "user-strip" },
      h("span", { className: "user-chip" }, `${user.name} (${user.role})`),
      refreshing && h("span", { className: "user-chip" }, "Syncing"),
      h("button", { className: "btn btn-secondary", type: "button", onClick: onProfile }, "Profile"),
      h("button", { className: "btn btn-ghost", type: "button", onClick: onLogout }, "Logout")
    )
  );
}

function Tabs({ activeTab, isAdmin, onChange }) {
  const tabs = [
    { key: "expenses", label: "Expenses" }
  ];

  if (isAdmin) {
    tabs.push(
      { key: "users", label: "Users" },
      { key: "activities", label: "Activity Log" }
    );
  }

  return h("nav", { className: "tabs", "aria-label": "Application sections" },
    tabs.map((tab) => h("button", {
      key: tab.key,
      className: `tab-btn ${activeTab === tab.key ? "is-active" : ""}`,
      type: "button",
      onClick: () => onChange(tab.key)
    }, tab.label))
  );
}

function ExpenseDashboard(props) {
  const {
    user,
    expenses,
    allExpenses,
    categories,
    filters,
    onFilter,
    onResetFilters,
    onAdd,
    onEdit,
    onDelete
  } = props;

  const summary = useMemo(() => buildExpenseSummary(expenses), [expenses]);
  const categorySummary = useMemo(() => buildCategorySummary(expenses), [expenses]);

  return h("main", { className: "grid" },
    h(SummaryGrid, { summary }),
    h("section", { className: "panel" },
      h("div", { className: "toolbar" },
        h(Field, {
          label: "Live search",
          name: "search",
          value: filters.search,
          onChange: onFilter,
          placeholder: "Search title, category, description, or owner"
        }),
        h(SelectField, {
          label: "Category",
          name: "category",
          value: filters.category,
          options: categories,
          onChange: onFilter
        }),
        h(SelectField, {
          label: "Sort by",
          name: "sortBy",
          value: filters.sortBy,
          options: [
            ["date-desc", "Date: newest first"],
            ["date-asc", "Date: oldest first"],
            ["amount-desc", "Amount: high to low"],
            ["amount-asc", "Amount: low to high"],
            ["title-asc", "Title: A to Z"],
            ["owner-asc", "Owner: A to Z"]
          ],
          onChange: onFilter
        }),
        h("div", { className: "actions" },
          h("button", { className: "btn btn-secondary", type: "button", onClick: onResetFilters }, "Reset"),
          h("button", { className: "btn btn-primary", type: "button", onClick: onAdd }, "Add Expense")
        )
      )
    ),
    h("section", { className: "two-column" },
      h("div", { className: "panel" },
        h("h2", null, "Category Summary"),
        h("p", { className: "subtitle" }, "Current visible spending by category."),
        categorySummary.length
          ? h("div", { className: "category-list" },
              categorySummary.map((item) => h("div", { className: "category-line", key: item.category },
                h("span", { className: "strong" }, item.category),
                h("div", { className: "bar" },
                  h("div", { className: "bar-fill", style: { width: `${item.percentage}%` } })
                ),
                h("span", { className: "muted" }, `${formatCurrency(item.total)} (${item.percentage.toFixed(0)}%)`)
              ))
            )
          : h("div", { className: "empty-state" }, "No category data yet.")
      ),
      h("div", { className: "panel" },
        h("h2", null, "A2 Coverage"),
        h("p", { className: "subtitle" }, "This build contains three database-backed entities with CRUD behaviour."),
        h("div", { className: "category-list" },
          h("span", { className: "badge" }, "user: register, admin create/read/update/delete"),
          h("span", { className: "badge" }, "expense_item: create/read/update/delete with live search"),
          h("span", { className: "badge" }, "user_activity: create/read/update/delete audit log")
        ),
        h("p", { className: "subtitle" }, user.role === "admin" ? `Admin view includes ${allExpenses.length} total expense records.` : "Member view only shows your own expenses.")
      )
    ),
    h("section", { className: "panel" },
      h("div", { className: "topbar" },
        h("div", null,
          h("h2", null, "Expense Items"),
          h("p", { className: "subtitle" }, `Showing ${numberFormatter.format(expenses.length)} matching record${expenses.length === 1 ? "" : "s"}.`)
        )
      ),
      h(ExpenseTable, {
        expenses,
        isAdmin: user.role === "admin",
        onEdit,
        onDelete
      })
    )
  );
}

function SummaryGrid({ summary }) {
  return h("section", { className: "summary-grid" },
    h(SummaryCard, { label: "Total spending", value: formatCurrency(summary.total) }),
    h(SummaryCard, { label: "This month", value: formatCurrency(summary.thisMonth) }),
    h(SummaryCard, { label: "Records", value: numberFormatter.format(summary.count) }),
    h(SummaryCard, { label: "Average", value: formatCurrency(summary.average) })
  );
}

function SummaryCard({ label, value }) {
  return h("article", { className: "summary-card" },
    h("p", { className: "summary-label" }, label),
    h("p", { className: "summary-value" }, value)
  );
}

function ExpenseTable({ expenses, isAdmin, onEdit, onDelete }) {
  if (!expenses.length) {
    return h("div", { className: "empty-state" }, "No expenses match the current search or filter.");
  }

  return h("div", { className: "table" },
    h("div", { className: "table-head" },
      h("div", null, "Title"),
      h("div", null, "Category"),
      h("div", null, "Amount"),
      h("div", null, "Date"),
      h("div", null, isAdmin ? "Description / Owner" : "Description"),
      h("div", null, "Actions")
    ),
    expenses.map((expense) => h("article", { className: "expense-row", key: expense.id },
      h("div", { className: "cell-title" },
        h("span", { className: "strong" }, expense.title),
        h("span", { className: "muted" }, `ID: ${expense.id}`)
      ),
      h("div", null, h("span", { className: "badge" }, expense.category)),
      h("div", { className: "strong" }, formatCurrency(expense.amount)),
      h("div", { className: "muted" }, formatDate(expense.date)),
      h("div", { className: "muted" },
        expense.description || "No description",
        isAdmin && h("div", null, h("span", { className: "badge badge-accent" }, expense.owner_name || "Unassigned"))
      ),
      h("div", { className: "actions" },
        h("button", { className: "mini-btn", type: "button", onClick: () => onEdit(expense) }, "Edit"),
        h("button", { className: "mini-btn danger", type: "button", onClick: () => onDelete(expense) }, "Delete")
      )
    ))
  );
}

function ExpenseModal({ expense, onClose, onSave }) {
  const [form, setForm] = useState({
    id: expense?.id || "",
    title: expense?.title || "",
    category: expense?.category || "",
    amount: expense?.amount || "",
    date: expense?.date || getTodayIso(),
    description: expense?.description || ""
  });
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value
    }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    const validationMessage = validateExpenseForm(form);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setWorking(true);

    try {
      await onSave({
        ...form,
        amount: Number(form.amount)
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setWorking(false);
    }
  }

  return h("div", { className: "modal", role: "presentation" },
    h("form", { className: "modal-card", onSubmit: submit },
      h("div", { className: "modal-head" },
        h("div", null,
          h("h2", null, expense ? "Edit Expense" : "Add Expense"),
          h("p", { className: "subtitle" }, "Changes are saved to the MySQL database through the protected API.")
        ),
        h("button", { className: "icon-close", type: "button", onClick: onClose, "aria-label": "Close" }, "x")
      ),
      h("div", { className: "form-grid" },
        h(Field, { label: "Title", name: "title", value: form.title, onChange: updateField, placeholder: "e.g. Grocery shopping" }),
        h(Field, { label: "Category", name: "category", value: form.category, onChange: updateField, placeholder: "Food, Rent, Transport" }),
        h(Field, { label: "Amount", name: "amount", type: "number", value: form.amount, onChange: updateField, placeholder: "0.00", step: "0.01" }),
        h(Field, { label: "Date", name: "date", type: "date", value: form.date, onChange: updateField }),
        h(TextAreaField, { label: "Description", name: "description", value: form.description, onChange: updateField, className: "full", placeholder: "Optional notes" })
      ),
      error && h("div", { className: "error-box" }, error),
      h("div", { className: "modal-foot" },
        h("button", { className: "btn btn-secondary", type: "button", onClick: onClose }, "Cancel"),
        h("button", { className: "btn btn-primary", type: "submit", disabled: working }, working ? "Saving..." : "Save Expense")
      )
    )
  );
}

function ProfileModal({ user, onClose, onSave }) {
  const [name, setName] = useState(user.name);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function submit(event) {
    event.preventDefault();

    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters long.");
      return;
    }

    setWorking(true);
    setError("");

    try {
      await onSave(name.trim());
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setWorking(false);
    }
  }

  return h("div", { className: "modal", role: "presentation" },
    h("form", { className: "modal-card modal-card-small", onSubmit: submit },
      h("div", { className: "modal-head" },
        h("div", null,
          h("h2", null, "Profile"),
          h("p", { className: "subtitle" }, user.email)
        ),
        h("button", { className: "icon-close", type: "button", onClick: onClose, "aria-label": "Close" }, "x")
      ),
      h(Field, {
        label: "Display name",
        name: "name",
        value: name,
        onChange: (fieldName, value) => setName(value)
      }),
      error && h("div", { className: "error-box" }, error),
      h("div", { className: "modal-foot" },
        h("button", { className: "btn btn-secondary", type: "button", onClick: onClose }, "Cancel"),
        h("button", { className: "btn btn-primary", type: "submit", disabled: working }, working ? "Saving..." : "Save")
      )
    )
  );
}

function ConfirmModal({ dialog, onClose, onError }) {
  const [working, setWorking] = useState(false);

  async function confirm() {
    setWorking(true);

    try {
      await dialog.onConfirm();
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setWorking(false);
    }
  }

  return h("div", { className: "modal", role: "presentation" },
    h("div", { className: "modal-card modal-card-small" },
      h("div", { className: "modal-head" },
        h("div", null,
          h("h2", null, dialog.title),
          h("p", { className: "subtitle" }, dialog.message)
        ),
        h("button", { className: "icon-close", type: "button", onClick: onClose, "aria-label": "Close" }, "x")
      ),
      h("div", { className: "modal-foot" },
        h("button", { className: "btn btn-secondary", type: "button", onClick: onClose }, "Cancel"),
        h("button", {
          className: dialog.danger ? "btn btn-danger" : "btn btn-primary",
          type: "button",
          disabled: working,
          onClick: confirm
        }, working ? "Working..." : dialog.confirmLabel || "Confirm")
      )
    )
  );
}

function AdminUsersPanel({ users, currentUser, onCreateUser, onUpdateUser, onDeleteUser }) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "member",
    status: "active"
  });
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const visibleUsers = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();

    if (!lowerQuery) {
      return users;
    }

    return users.filter((user) =>
      [user.name, user.email, user.role, user.status]
        .join(" ")
        .toLowerCase()
        .includes(lowerQuery)
    );
  }, [users, query]);

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value
    }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setWorking(true);
    setError("");

    try {
      await onCreateUser(form);
      setForm({
        name: "",
        email: "",
        password: "",
        role: "member",
        status: "active"
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setWorking(false);
    }
  }

  return h("main", { className: "grid" },
    h("section", { className: "summary-grid" },
      h(SummaryCard, { label: "Users", value: numberFormatter.format(users.length) }),
      h(SummaryCard, { label: "Admins", value: numberFormatter.format(users.filter((user) => user.role === "admin").length) }),
      h(SummaryCard, { label: "Active", value: numberFormatter.format(users.filter((user) => user.status === "active").length) }),
      h(SummaryCard, { label: "Disabled", value: numberFormatter.format(users.filter((user) => user.status === "disabled").length) })
    ),
    h("section", { className: "panel" },
      h("h2", null, "Create User"),
      h("p", { className: "subtitle" }, "Admins can create user records directly, which completes the Create part of user CRUD."),
      h("form", { className: "form-grid", onSubmit: submit },
        h(Field, { label: "Name", name: "name", value: form.name, onChange: updateField }),
        h(Field, { label: "Email", name: "email", type: "email", value: form.email, onChange: updateField }),
        h(Field, { label: "Password", name: "password", type: "password", value: form.password, onChange: updateField }),
        h(SelectField, {
          label: "Role",
          name: "role",
          value: form.role,
          options: [["member", "Member"], ["admin", "Admin"]],
          onChange: updateField
        }),
        h(SelectField, {
          label: "Status",
          name: "status",
          value: form.status,
          options: [["active", "Active"], ["disabled", "Disabled"]],
          onChange: updateField
        }),
        h("div", { className: "field" },
          h("label", null, "Action"),
          h("button", { className: "btn btn-primary", type: "submit", disabled: working }, working ? "Creating..." : "Create User")
        )
      ),
      error && h("div", { className: "error-box" }, error)
    ),
    h("section", { className: "panel" },
      h("div", { className: "toolbar" },
        h(Field, {
          label: "Live user search",
          name: "query",
          value: query,
          onChange: (name, value) => setQuery(value),
          placeholder: "Search by name, email, role, or status"
        })
      ),
      h("div", { className: "admin-grid" },
        visibleUsers.map((user) => h(UserRow, {
          key: user.id,
          user,
          currentUser,
          onUpdateUser,
          onDeleteUser
        })),
        !visibleUsers.length && h("div", { className: "empty-state" }, "No users match the search.")
      )
    )
  );
}

function UserRow({ user, currentUser, onUpdateUser, onDeleteUser }) {
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    password: "",
    role: user.role,
    status: user.status
  });
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value
    }));
    setError("");
  }

  async function save() {
    setWorking(true);
    setError("");

    try {
      await onUpdateUser(user.id, form);
      setForm((current) => ({ ...current, password: "" }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setWorking(false);
    }
  }

  return h("article", { className: "user-row" },
    h(Field, { label: "Name", name: "name", value: form.name, onChange: updateField }),
    h(Field, { label: "Email", name: "email", type: "email", value: form.email, onChange: updateField }),
    h(SelectField, { label: "Role", name: "role", value: form.role, options: [["member", "Member"], ["admin", "Admin"]], onChange: updateField }),
    h(SelectField, { label: "Status", name: "status", value: form.status, options: [["active", "Active"], ["disabled", "Disabled"]], onChange: updateField }),
    h(Field, { label: "New password", name: "password", type: "password", value: form.password, onChange: updateField, placeholder: "Optional" }),
    h("div", { className: "field" },
      h("label", null, `${user.expense_count || 0} expenses`),
      h("div", { className: "actions" },
        h("button", { className: "mini-btn", type: "button", disabled: working, onClick: save }, working ? "Saving" : "Save"),
        h("button", {
          className: "mini-btn danger",
          type: "button",
          disabled: user.id === currentUser.id,
          onClick: () => onDeleteUser(user)
        }, "Delete")
      ),
      error && h("div", { className: "error-box" }, error)
    )
  );
}

function ActivityPanel({ activities, onCreateActivity, onUpdateActivity, onDeleteActivity }) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    action: "admin_note",
    details: ""
  });
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  const visibleActivities = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();

    if (!lowerQuery) {
      return activities;
    }

    return activities.filter((activity) =>
      [
        activity.user_name,
        activity.user_email,
        activity.action,
        activity.entity_type,
        activity.details,
        activity.created_at
      ]
        .join(" ")
        .toLowerCase()
        .includes(lowerQuery)
    );
  }, [activities, query]);

  async function submit(event) {
    event.preventDefault();
    setWorking(true);
    setError("");

    try {
      await onCreateActivity(form);
      setForm({
        action: "admin_note",
        details: ""
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setWorking(false);
    }
  }

  return h("main", { className: "grid" },
    h("section", { className: "summary-grid" },
      h(SummaryCard, { label: "Activity entries", value: numberFormatter.format(activities.length) }),
      h(SummaryCard, { label: "Unreviewed", value: numberFormatter.format(activities.filter((item) => !item.reviewed).length) }),
      h(SummaryCard, { label: "Reviewed", value: numberFormatter.format(activities.filter((item) => item.reviewed).length) }),
      h(SummaryCard, { label: "Users active", value: numberFormatter.format(new Set(activities.map((item) => item.user_id).filter(Boolean)).size) })
    ),
    h("section", { className: "panel" },
      h("h2", null, "Create Activity Note"),
      h("p", { className: "subtitle" }, "Automatic audit events are created by login/logout and CRUD actions. Admin notes show manual Create for the user_activity entity."),
      h("form", { className: "form-grid", onSubmit: submit },
        h(Field, {
          label: "Action",
          name: "action",
          value: form.action,
          onChange: (name, value) => setForm((current) => ({ ...current, [name]: value }))
        }),
        h(TextAreaField, {
          label: "Details",
          name: "details",
          value: form.details,
          onChange: (name, value) => setForm((current) => ({ ...current, [name]: value })),
          className: "full",
          placeholder: "Write an audit note"
        }),
        h("div", { className: "field" },
          h("label", null, "Action"),
          h("button", { className: "btn btn-primary", type: "submit", disabled: working }, working ? "Adding..." : "Add Activity")
        )
      ),
      error && h("div", { className: "error-box" }, error)
    ),
    h("section", { className: "panel" },
      h("div", { className: "toolbar" },
        h(Field, {
          label: "Live activity search",
          name: "query",
          value: query,
          onChange: (name, value) => setQuery(value),
          placeholder: "Search actions, users, dates, or details"
        })
      ),
      h("div", { className: "admin-grid" },
        visibleActivities.map((activity) => h(ActivityRow, {
          key: activity.id,
          activity,
          onUpdateActivity,
          onDeleteActivity
        })),
        !visibleActivities.length && h("div", { className: "empty-state" }, "No activity entries match the search.")
      )
    )
  );
}

function ActivityRow({ activity, onUpdateActivity, onDeleteActivity }) {
  const [details, setDetails] = useState(activity.details || "");
  const [reviewed, setReviewed] = useState(Boolean(activity.reviewed));
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function save() {
    setWorking(true);
    setError("");

    try {
      await onUpdateActivity(activity.id, {
        details,
        reviewed
      });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setWorking(false);
    }
  }

  return h("article", { className: "activity-row" },
    h("div", { className: "cell-title" },
      h("span", { className: "strong" }, activity.action),
      h("span", { className: "muted" }, `${activity.entity_type} #${activity.entity_id || "-"}`)
    ),
    h("div", null,
      h("span", { className: "badge badge-accent" }, activity.user_name),
      h("div", { className: "muted" }, activity.user_email)
    ),
    h("div", { className: "muted" }, activity.created_at),
    h(TextAreaField, {
      label: "Details",
      name: "details",
      value: details,
      onChange: (name, value) => setDetails(value)
    }),
    h("div", { className: "field" },
      h("label", { className: "checkbox-line" },
        h("input", {
          type: "checkbox",
          checked: reviewed,
          onChange: (event) => setReviewed(event.target.checked)
        }),
        "Reviewed"
      ),
      h("div", { className: "actions" },
        h("button", { className: "mini-btn", type: "button", disabled: working, onClick: save }, working ? "Saving" : "Save"),
        h("button", { className: "mini-btn danger", type: "button", onClick: () => onDeleteActivity(activity) }, "Delete")
      ),
      error && h("div", { className: "error-box" }, error)
    )
  );
}

function Field({ label, name, value, onChange, type = "text", placeholder = "", step, className = "" }) {
  return h("div", { className: `field ${className}`.trim() },
    h("label", { htmlFor: name }, label),
    h("input", {
      id: name,
      name,
      type,
      value,
      step,
      placeholder,
      onChange: (event) => onChange(name, event.target.value)
    })
  );
}

function SelectField({ label, name, value, options, onChange, className = "" }) {
  return h("div", { className: `field ${className}`.trim() },
    h("label", { htmlFor: name }, label),
    h("select", {
      id: name,
      name,
      value,
      onChange: (event) => onChange(name, event.target.value)
    },
      options.map((option) => {
        const optionValue = Array.isArray(option) ? option[0] : option;
        const optionLabel = Array.isArray(option) ? option[1] : option;
        return h("option", { key: optionValue, value: optionValue }, optionLabel);
      })
    )
  );
}

function TextAreaField({ label, name, value, onChange, placeholder = "", className = "" }) {
  return h("div", { className: `field ${className}`.trim() },
    h("label", { htmlFor: name }, label),
    h("textarea", {
      id: name,
      name,
      value,
      placeholder,
      onChange: (event) => onChange(name, event.target.value)
    })
  );
}

function ToastArea({ toast }) {
  if (!toast) {
    return null;
  }

  return h("div", { className: "toast-area" },
    h("div", { className: `toast ${toast.type || "success"}` },
      h("strong", null, toast.title),
      h("p", null, toast.message)
    )
  );
}

function buildExpenseSummary(expenses) {
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const average = expenses.length ? total / expenses.length : 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const thisMonth = expenses.reduce((sum, expense) => {
    const date = parseLocalDate(expense.date);

    if (date.getFullYear() === currentYear && date.getMonth() === currentMonth) {
      return sum + Number(expense.amount || 0);
    }

    return sum;
  }, 0);

  return {
    total,
    average,
    thisMonth,
    count: expenses.length
  };
}

function buildCategorySummary(expenses) {
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const grouped = expenses.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + Number(expense.amount || 0);
    return acc;
  }, {});

  return Object.entries(grouped)
    .sort((a, b) => b[1] - a[1])
    .map(([category, value]) => ({
      category,
      total: value,
      percentage: total ? (value / total) * 100 : 0
    }));
}

function validateExpenseForm(form) {
  if (!form.title || form.title.trim().length < 2) {
    return "Title must be at least 2 characters long.";
  }

  if (!form.category || form.category.trim().length < 2) {
    return "Category must be at least 2 characters long.";
  }

  if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) {
    return "Amount must be a valid number greater than 0.";
  }

  if (!form.date) {
    return "Date is required.";
  }

  return "";
}

function parseLocalDate(dateString) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatDate(dateString) {
  const date = parseLocalDate(dateString);
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function getTodayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
