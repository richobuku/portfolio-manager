# PRUDEV II Portfolio Manager

A full-stack web application for managing the PRUDEV II programme — tracking MSMEs, Business Growth Experts (BGEs), group sessions, work orders, training, and field reporting.

## Live Deployment

- **Frontend**: [bds.glowi.africa](https://bds.glowi.africa) (Vercel)
- **Backend API**: Render (PostgreSQL in production)

---

## Features

### MSME Management
- Bulk import from Excel with auto-generated MSME codes (`PRUDEV2-GOPA-COHORT-XXX`)
- Search, filter, and paginate by business type, sector, city, cohort
- Assign MSMEs directly to BGEs or via BGE Groups
- Track **total support visits** and **last support date** per MSME
- Full CRUD with cohort grouping

### Business Growth Expert (BGE) Management
- BGE profiles with skills, location, and signature upload (max 5 MB, image-validated)
- Auto-create Django login account + send branded welcome email on every BGE save
- Admin BCC on all welcome emails for a paper trail
- BGE groups with team leads for coordinated field work
- Direct vs. via-group MSME assignment distinction on the BGE dashboard

### Work Orders
- Admin issues work orders (individual or group-based) with type, objectives, tasks, and deliverables
- Work order type auto-populates form fields as a starting template
- BGEs digitally sign work orders via in-browser signature pad; signed PDF emailed on issue
- PDF download available for BGEs at any time
- Bulk BGE account creator management command

### Field Reporting
- **Individual MSME Reports**: BGEs log visits per MSME with status, challenges, and next steps
- **Group Reports**: Team leads file group session reports covering multiple MSMEs
  - Per-person attendance list linked to MSME records (name, phone, gender, age group, refugee/host status, photo & contact consent)
  - Member contribution cards — each BGE in the group logs their own observations and MSMEs observed
  - Reports lock (grey out) once submitted/approved; clearly marked "Assignment completed ✓"
- **Training Sessions**: Attendance recording linked to work orders with per-session attendance tracking
- Draft → Submit workflow; submitted reports are read-only

### PDF Reports
- MSME visit reports and group session reports rendered as branded PDFs (ReportLab)
- Work order PDFs with BGE signature block
- Attendance demographic summary sheet (PRUDEV II template format)
- Print/download from admin and BGE dashboards

### Attendance & Demographics
- Attendance tracking across training sessions and group reports
- Demographic breakdown: gender, age group (youth 18–34 / adult 35+), refugee vs. host community
- Per-cohort and per-work-order breakdowns in the admin summary

### Authentication & Security
- Stateless JWT-style token authentication (`SimpleTokenAuthentication`)
- Google OAuth2 login with auto-link to BGE profile by email or name
- Stateless password reset via Django's `PasswordResetTokenGenerator` (survives restarts, works across workers)
- Rate limiting: login (10/min), password reset (5/hr), general anon (200/day), authenticated (2000/day)
- CORS locked to specific origins; Vercel preview URLs allowed via regex pattern
- `SECRET_KEY` required in production — raises `RuntimeError` at startup if missing

### Admin Dashboard
- Real-time statistics: MSME counts, BGE counts, support visits, session totals
- Manage cohorts, BGE groups, work orders, training topics, and support requests
- View, approve, and export all reports

### BGE Dashboard
- "My MSMEs" panel distinguishing directly assigned vs. via-group MSMEs
- Support count and last support date visible per MSME card
- Group report filing with attendance, contributions, and MSME linking
- Work order listing with training session attendance buttons
- Finalised reports greyed out and read-only

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Django 5.2.1 + Django REST Framework |
| Database | SQLite (dev) / PostgreSQL (production) |
| Frontend | React 18 + Material UI |
| Auth | Custom stateless tokens + Google OAuth2 |
| PDF generation | ReportLab |
| Email | Gmail SMTP via App Password |
| Static files | WhiteNoise |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Installation

### Backend

```bash
git clone https://github.com/richobuku/portfolio-manager.git
cd portfolio-manager/backend

python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env       # fill in your values (see Environment Variables below)
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend

```bash
cd ../frontend
npm install
npm start
```

Frontend runs at `http://localhost:3000` and proxies API calls to `http://localhost:8000`.

---

## Environment Variables

Create `backend/.env` with the following keys:

```env
# Django
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
FRONTEND_URL=http://localhost:3000

# Database (leave blank to use SQLite in dev)
DATABASE_URL=

# Email (Gmail SMTP)
GMAIL_HOST_USER=you@gmail.com
GMAIL_APP_PASSWORD=your-app-password
EMAIL_REPLY_TO=reply@yourdomain.com

# Optional: BCC admin on all BGE welcome emails
BGE_WELCOME_EMAIL_BCC=admin@yourdomain.com

# Google OAuth2 (optional — leave blank to disable Google login)
GOOGLE_CLIENT_ID=

# VAPID keys for Web Push (optional)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@yourdomain.org

# Extra CORS origins (comma-separated, optional)
CORS_EXTRA_ORIGINS=
```

In **production**, `SECRET_KEY` is required — the server will not start without it.

---

## API Overview

All endpoints are under `/api/`. Authentication uses a `Bearer <token>` header.

| Resource | Endpoint |
|---|---|
| Login / Logout / Google | `/api/auth/login/`, `/api/auth/logout/`, `/api/auth/google/` |
| Password reset | `/api/auth/password-reset/`, `/api/auth/password-reset/confirm/` |
| MSMEs | `/api/msmes/` |
| BGEs | `/api/experts/` |
| Cohorts | `/api/cohorts/` |
| BGE Groups | `/api/bge-groups/` |
| Work Orders | `/api/work-orders/` |
| MSME Reports | `/api/reports/` |
| Group Reports | `/api/group-reports/` |
| Group Report Contributions | `/api/group-report-contributions/` |
| Group Report Attendance | `/api/group-report-attendance/` |
| Training Sessions | `/api/training-sessions/` |
| Training Attendance | `/api/attendance/` |
| Training Topics | `/api/training-topics/` |
| Support Requests | `/api/support-requests/` |
| Push Notifications | `/api/push/subscribe/`, `/api/push/unsubscribe/`, `/api/push/vapid-key/` |

### Selected admin-only actions
- `POST /api/experts/{id}/upload_signature/` — upload BGE signature image
- `POST /api/work-orders/{id}/issue/` — issue work order and email PDF to BGE
- `GET /api/attendance/summary/` — attendance demographic summary with cohort/work-order breakdown

---

## Management Commands

```bash
# Bulk-create Django login accounts for all BGEs that don't have one
python manage.py create_bge_accounts

# Standard Django
python manage.py migrate
python manage.py createsuperuser
python manage.py collectstatic
```

---

## Project Structure

```
portfolio-manager/
├── backend/
│   ├── backend/            # Django settings, URLs, WSGI
│   └── portfolio/          # Main app
│       ├── models.py       # MSME, BGE, WorkOrder, GroupReport, Attendance, …
│       ├── api_views.py    # DRF ViewSets
│       ├── serializers.py
│       ├── auth_views.py   # Login, Google OAuth2, password reset
│       ├── pdf_reports.py  # ReportLab PDF generation
│       ├── api_urls.py
│       └── migrations/
└── frontend/
    └── src/
        └── components/
            ├── Dashboard.js      # Admin dashboard
            └── BGEDashboard.js   # BGE-facing dashboard
```

---

## License

This project is part of the PRUDEV II programme.

---

**PRUDEV II Portfolio Manager** — Empowering MSMEs through data-driven insights and expert matching.
