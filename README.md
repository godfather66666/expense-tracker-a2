# Expense Tracker A2

## Project Overview

Expense Tracker A2 is an advanced single-page web application for managing personal expenses with authentication, role-based administration, per-user expense views, live search, spending-over-time charts, and audit logging.

The project extends the Assignment 1 expense dashboard into an Assignment 2 system with three database-backed conceptual entities:

- `user`: registration, login, profile update, and admin user management.
- `expense_item`: authenticated expense CRUD with category filtering and live search.
- `user_activity`: automatic and manual audit logs with admin CRUD tools.

The application remains a single-page experience. React dynamically rewrites the interface after login, CRUD operations, filtering, searching, and admin actions without navigating to another HTML page.

## Problem Solved

Basic expense trackers often only store spending records. This version supports a more realistic multi-user workflow:

- Users can safely register and log in.
- Members can manage their own expenses.
- Admins can manage user accounts and review activity history.
- Admins can switch between users before reviewing expense summaries, so user data is not mixed together by default.
- Search, user filtering, category filtering, and sorting help users find expense records immediately.
- Audit logs make important actions visible for accountability.

## Technical Stack

### Frontend

- React 18 UMD build loaded in `index.html`
- React hooks: `useReducer`, `useState`, `useEffect`, `useMemo`
- HTML5 and CSS3
- Single-page application behaviour with one HTML file

### Backend

- Node.js
- Express.js
- REST API controllers and route modules
- PBKDF2 password hashing using Node `crypto`
- HS256 JWT authentication using Node `crypto`
- Role-based access control middleware

### Database

- MySQL
- Tables: `users`, `expenses`, `user_activities`

## Key Features

- Register and login with password hashing.
- JWT-protected API routes.
- First registered user automatically becomes `admin`.
- Member users can create, read, update, and delete their own expense items.
- Admin users can review expenses by selected user, with an optional all-user overview.
- Live search filters expense items as the user types.
- Category filter and sorting by date, amount, title, and owner.
- Summary cards for total spending, current month spending, record count, and average spending.
- Category breakdown with percentage bars for the selected visible expense set.
- Spending-over-time chart grouped by expense date.
- Admin user CRUD: create, read, update, delete users.
- Admin activity CRUD: create notes, read activity logs, update review status/details, delete logs.
- Login, logout, profile updates, expense actions, user actions, and activity updates are written to `user_activities`.
- Responsive dashboard layout for desktop and mobile.
- Clear error handling for invalid forms, API errors, and expired sessions.

## CRUD Coverage

| Entity | Create | Read | Update | Delete |
| --- | --- | --- | --- | --- |
| `user` | Register or admin create user | Current user and admin user list | Profile update or admin edit | Admin delete user |
| `expense_item` | Add expense | Expense dashboard | Edit expense | Delete expense |
| `user_activity` | Automatic log or admin note | Admin activity log | Mark reviewed or edit details | Delete activity |

## Project Structure

```text
31748/
|-- README.md
|-- package.json
|-- package-lock.json
|-- .env.example
|-- .gitignore
|-- schema.sql
|-- config.js
|-- db.js
|-- server.js
|-- index.html
|-- style.css
|-- script.js
|-- middleware/
|   `-- auth.js
|-- routes/
|   |-- auth.js
|   |-- expenses.js
|   |-- users.js
|   `-- activities.js
|-- controllers/
|   |-- authController.js
|   |-- expensesController.js
|   |-- usersController.js
|   `-- activitiesController.js
|-- utils/
|   `-- security.js
`-- node_modules/
```

## File and Folder Description

- `index.html`: the only HTML page used by the single-page application.
- `script.js`: React frontend, including authentication screens, expense dashboard, per-user admin filtering, spending-over-time chart, live search, modals, admin user management, and activity log UI.
- `style.css`: responsive visual design and component styling.
- `server.js`: Express entry point, static file serving, API route mounting, and startup logic.
- `config.js`: loads `.env` values and centralises database/JWT settings.
- `db.js`: MySQL connection pool and schema initialisation checks.
- `schema.sql`: database export/setup file for submission.
- `middleware/auth.js`: JWT authentication and admin role guard.
- `utils/security.js`: password hashing, password verification, JWT signing, JWT verification, and safe user formatting.
- `controllers/`: business logic for auth, expenses, users, and activities.
- `routes/`: RESTful route definitions.



## How to Run

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Open the app:

```text
http://localhost:3000
```

Run syntax checks:

```bash
npm run check
```

## First Login

The first user who registers through the browser is automatically assigned the `admin` role. Later registered users become `member` users by default.

This avoids hardcoded admin credentials while still making the project easy to demonstrate.

## API Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/auth/me`
- `POST /api/auth/logout`

### Expense Items

- `GET /api/expenses`
- `POST /api/expenses`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`

### Users

- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`

### User Activities

- `GET /api/activities`
- `POST /api/activities`
- `PUT /api/activities/:id`
- `DELETE /api/activities/:id`

## Design Rationale

- `useReducer` is used for global app state because authentication, tab state, expense data, user data, activity data, filters, loading, and toast messages are connected.
- `useState` is used for local form state because form inputs are isolated to their components.
- `useMemo` is used for live search, user filtering, sorting, category options, time chart data, summaries, and filtered admin lists to keep repeated UI calculations predictable.
- Admin expense views default to the signed-in admin's own records and provide a user selector before summaries and expense items are shown.
- JWT middleware protects private routes, while `requireAdmin` separates member and admin permissions.
- Passwords are stored as PBKDF2 hashes rather than plain text.
- The UI stays within one page and uses modals/tabs instead of browser navigation.

