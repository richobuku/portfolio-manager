# PRUDEV II Portfolio Manager — System Rules & Invariants

This document establishes the mandatory architectural rules, security constraints, and operational guardrails for the PRUDEV II Portfolio Manager codebase. All agents and developers must strictly adhere to these rules without exception.

---

## 1. Security & Role-Based Access Control (RBAC)

### 1.1 User Roles & Access Hierarchy
The system recognizes four distinct user roles:

1. **`admin` (Superuser)**:
   - Unrestricted access to all data, management endpoints, and system settings.
   - Authorized to provision users, delete records, override contract statuses, and trigger bulk operations.
2. **`programme_manager` (GOPA Pro / GIZ Managers)**:
   - Full read/write access to MSMEs, BGEs, Work Orders, and Reports.
   - Authorized to issue work orders, approve/reject Enterprise Improvement Plans (TBIP), endorse visit reports, and export executive analytics.
   - Forbidden from deleting system audit logs or modifying database migrations.
3. **`bge` (Business Growth Expert)**:
   - **Strict Data Boundary**: May only access MSMEs assigned to their profile (`msme.assigned_expert == request.user.bge_profile`).
   - May only draft, edit, and view their own Work Orders, Planned Visits, Visit Reports, and TBIPs.
   - May countersign work orders issued to them, submit TBIPs for PM review, and download their own timesheets/invoices.
   - Forbidden from accessing other BGEs' contract rates, bank details, or reports.
4. **`viewer` (External Observers / Auditors)**:
   - Read-only access to aggregated analytics, approved reports, and high-level dashboards.
   - Forbidden from initiating any state-changing operations (`POST`, `PUT`, `PATCH`, `DELETE`).

### 1.2 Access Control Implementation Rules
- Every DRF view or viewset must declare explicit `permission_classes`. Never rely solely on default global settings.
- When querying records for BGEs, views must filter querysets using `bge=request.user.bge_profile` or `assigned_expert=request.user.bge_profile`.
- Use the permission mixins defined in [`backend/portfolio/views/mixins.py`](file:///Users/RICHOBUKU/portfolio-manager/backend/portfolio/views/mixins.py):
  - `ProgrammeManagerReadOnlyMixin`
  - `ViewerReadOnlyMixin`
  - Role helper functions: `_is_programme_manager(user)`, `_is_viewer(user)`, `_managed_groups(user)`.

### 1.3 Google OAuth Allowlist Invariants
- Users signing in via Google with email domains specified in `GOOGLE_LOGIN_ALLOWED_DOMAINS` (e.g. `gopa.eu`, `giz.de`) are automatically provisioned with read-only `viewer` access.
- Any Google sign-in from an unlisted domain that cannot be auto-linked to an existing BGE or manager profile must be created with `viewer_approved=False` and locked out until explicitly approved by an administrator in Django admin.

### 1.4 Secret Management
- **Never commit secrets** (API keys, passwords, private keys, database credentials) to git.
- Environment variables must be loaded via `python-dotenv` from `backend/.env` locally, and configured securely in the Render and Vercel dashboards for production.
- Default fallback keys are permitted *only* for local CLI testing with an explicit warning.

---

## 2. Database & Schema Migration Rules

### 2.1 Dual Database Compatibility (SQLite & PostgreSQL)
- Development runs on local SQLite (`db.sqlite3`); production runs on Managed PostgreSQL on Render.
- **ORM Strictness**: All Django ORM queries and model fields must be cross-compatible between SQLite and PostgreSQL:
  - Use `models.JSONField(default=dict, blank=True)` or `models.JSONField(default=list, blank=True)` with callable defaults.
  - Avoid raw SQL queries with database-specific functions (e.g., Postgres-specific regex operators or SQLite date syntax).
  - Use Django database abstraction functions (e.g., `TruncMonth`, `Count`, `F`, `Q`) for aggregations.

### 2.2 Migration Integrity
- Never modify or delete existing, committed migration files that have been deployed to production.
- Always generate a new numbered migration via `python manage.py makemigrations portfolio` when modifying `models.py`.
- Migration names must clearly describe the change (e.g., `0123_add_tbip_help_needed_fields.py`).
- Inspect migration files before committing to ensure no unintended field alterations or loss of data occurs.

---

## 3. API Contract Synchronization Rules

### 3.1 Endpoint Alignment
- Any newly created or modified API endpoint in `backend/portfolio/api_urls.py` **must immediately be added/updated** in [`frontend/src/config.js`](file:///Users/RICHOBUKU/portfolio-manager/frontend/src/config.js) under `API_ENDPOINTS` or helper URL functions.
- Never hardcode raw URL strings like `http://127.0.0.1:8000/api/...` inside React components. Always import from `config.js`.

### 3.2 Response Envelopes & HTTP Status Codes
- Return appropriate HTTP status codes:
  - `200 OK`: Successful read/update.
  - `201 Created`: Successful resource creation.
  - `400 Bad Request`: Validation failure (include informative dictionary `{"detail": "..."}` or `{"field_name": ["error message"]}`).
  - `401 Unauthorized`: Missing or invalid authentication token.
  - `403 Forbidden`: Authenticated user lacks sufficient role permissions.
  - `404 Not Found`: Resource does not exist.
- Standard error responses must include a human-readable `detail` or `error` key for frontend notification display.

---

## 4. Brand Design & Aesthetic Invariants

### 4.1 Strict Color Palette Adherence
The platform serves a formal development cooperation programme funded by the EU & BMZ, implemented by GIZ and GOPA Pro. **Arbitrary or generic primary colors (e.g. plain browser blue, generic green, default red) are strictly forbidden.**

All UI components must exclusively use the curated brand tokens from [`frontend/src/theme.js`](file:///Users/RICHOBUKU/portfolio-manager/frontend/src/theme.js):

| Token Name | Hex Code | Purpose & Context |
| :--- | :--- | :--- |
| `BRAND.primaryMain` | `#262523` | Warm Bronze-Charcoal for primary buttons, dark headers, active navigation, and modal titles. |
| `BRAND.primaryDark` | `#191817` | Deep espresso-charcoal for hover and active pressed states. |
| `BRAND.gopaGold` | `#F3BB36` | GOPA Pro official gold for secondary highlights, callout chips, and action badges. |
| `BRAND.gopaGoldDark` | `#D97706` | Accessible amber-gold for warning text and contrast buttons. |
| `BRAND.gopaGoldLight`| `#FEF3C7` | Soft background gold for alert banners and selection pills. |
| `BRAND.gizRed` | `#C8102E` | GIZ official red for critical alerts, gap badges, and delete actions. |
| `BRAND.programmeGreen`| `#009B62` | Agriculture growth green for satisfactory scores, completed tasks, and success alerts. |
| `BRAND.proSlate` | `#6A6E6B` | GOPA Pro brand slate gray for secondary labels, borders, and subtitle text. |

### 4.2 Typography & Iconography
- Typography must utilize the clean `"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif` font stack.
- Interactive elements must provide clear hover transitions (`transition: 'all 0.15s ease'`).

---

## 5. ReportLab PDF & XlsxWriter Reporting Rules

### 5.1 ReportLab Layout Math & Safety (`pdf_reports.py`)
- ColWidths in ReportLab `Table` objects must always sum to the printable page width:
  - Standard Portrait: `colWidths` sum must equal `PAGE_WIDTH - 2 * MARGIN`.
  - Standard Landscape: `colWidths` sum must equal `PAGE_HEIGHT - 2 * MARGIN`.
- **String Sanitization**: Any dynamic user input or database text rendered inside a ReportLab `Paragraph` **must** be escaped using `_safe_html(text)` to prevent XML parsing exceptions caused by unescaped `&`, `<`, or `>`.
- Keep table cell text wrapped in `Paragraph` objects rather than raw strings to ensure clean auto-wrapping.

### 5.2 XlsxWriter Formatting Rules (`excel_reports.py`)
- Workbook formatting objects (`workbook.add_format(...)`) must be created once during initialization and reused. Excel imposes a hard limit of 64,000 unique formats per file.
- Header rows must have freeze panes enabled where appropriate (`ws.freeze_panes(...)`) to support scanning large datasets.

---

## 6. Diagnostic & Enterprise Improvement Plan (TBIP) Invariants

### 6.1 Pillar Structure
- The diagnostic assessment consists of **7 fixed categories**:
  1. `Governance & Strategy` (6 questions)
  2. `Financial Management` (5 questions)
  3. `Human Resources (HR)` (6 questions — with "Are the contracts performance-based?" at position #2)
  4. `Marketing & Sales` (5 questions)
  5. `Digital & Technology` (7 questions)
  6. `Environmental Sustainability` (5 questions)
  7. `Regulatory Compliance & Quality` (4 questions)
- Total questions: **38 questions**.

### 6.2 Scoring & Priority Thresholds
- Answers evaluate to 3 standard weights:
  - `Available and complete`: 2 points
  - `Needs improvement`: 1 point
  - `Not available`: 0 points
- Category Status:
  - Score `>= 80%`: `Satisfactory`
  - Score `50% - 79%`: `Needs Improvement`
  - Score `< 50%`: `Critical Gap`
- Overall MSME Priority Calculation:
  - `High`: Overall score `< 50%` OR `total_not_available >= 6`
  - `Medium`: Overall score `< 75%` OR `total_not_available >= 3` OR `total_needs_improvement >= 6`
  - `Low`: All other cases

---

## 7. Production Deployment & DevOps Guardrails

1. **Render Web Service (`portfolio-manager-backend`)**:
   - Start command must always chain: `python manage.py collectstatic --noinput && python manage.py migrate && python manage.py init_admin && gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --max-requests 200 --max-requests-jitter 20 --timeout 90`
   - The `--timeout 90` is mandatory to accommodate heavy PDF generation and large analytical exports without premature worker termination.
2. **Static Asset Pipeline**:
   - Handled via WhiteNoise with `CompressedManifestStaticFilesStorage`. Never disable WhiteNoise in production.
3. **Automated Verification Before Commit**:
   - Always run `python manage.py check` in `backend/` to verify zero Django configuration issues.
   - Always run `npm run build` in `frontend/` to verify zero JSX, linting, or compilation errors.
