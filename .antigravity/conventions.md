# PRUDEV II Portfolio Manager — Development Conventions & Guidelines

This document outlines the coding style, component design patterns, data handling conventions, and verification workflows for the PRUDEV II Portfolio Manager platform.

---

## 1. Python & Django Backend Conventions

### 1.1 Coding Style & Structure
- Follow **PEP 8** style guidelines (4 spaces indentation, snake_case functions/variables, PascalCase classes).
- Use descriptive function and variable names reflecting the development cooperation domain (e.g., `calculate_diagnostic`, `normalize_answer`, `bge_support_days`).
- Add docstrings to all public methods, serializers, and viewsets explaining purpose, inputs, and outputs.

### 1.2 Database Query Optimization (No N+1 Queries)
- **Foreign Keys**: Always apply `select_related` on single-valued relationships when rendering list views or serializing nested fields:
  ```python
  # Good:
  queryset = EnterpriseImprovementPlan.objects.select_related('msme', 'bge', 'reviewed_by').all()
  ```
- **Many-to-Many / Reverse Relations**: Always apply `prefetch_related` on multi-valued relationships:
  ```python
  # Good:
  queryset = WorkOrder.objects.prefetch_related('submissions', 'payments', 'attachments').all()
  ```
- Avoid executing database queries inside Python loops. Leverage `bulk_create` and `bulk_update` for multi-record operations.

### 1.3 Django REST Framework (DRF) Conventions
- **Serializers**:
  - Prefer explicit tuples for `fields` rather than `'__all__'`.
  - Use `SerializerMethodField` for computed properties (e.g. `bge_name`, `msme_district`, `readiness_score`).
  - Validate input thoroughly in `validate_<field>` methods and raise `serializers.ValidationError`.
- **Views & ViewSets**:
  - Inherit from `viewsets.ModelViewSet` for standard CRUD resources.
  - Inherit from `APIView` for custom actions (e.g. `/submit/`, `/approve/`, `/export_pdf/`).
  - Use standard DRF `Response(data, status=status.HTTP_...)` objects.
  - Wrap database mutations in `@transaction.atomic` where multiple models are updated concurrently.

### 1.4 Logging & Error Handling
- Use Python's standard `logging` module:
  ```python
  import logging
  logger = logging.getLogger(__name__)
  ```
- Log caught exceptions with `logger.exception("Descriptive message")` to preserve full tracebacks.
- Never let unhandled exceptions surface as raw 500 HTML pages; catch exceptions and return a JSON error response with an informative message.

---

## 2. JavaScript & React Frontend Conventions

### 2.1 Component Structure
- Use **React 18 functional components** with hooks. Class components are strictly prohibited.
- Keep components focused and modular. Extract complex dialogs, tables, and forms into dedicated files in `frontend/src/components/`.
- Component file names must be PascalCase (e.g., `EnterpriseImprovementPlanDialog.js`, `BGEDashboard.js`).

### 2.2 React Hooks & State Management
- Group hooks logically at the top of the component:
  1. `useState` hooks.
  2. `useMemo` and `useCallback` hooks.
  3. `useEffect` hooks for data fetching and side effects.
- Clean up side effects (e.g., intervals, timers, event listeners) in `useEffect` return functions.
- Avoid unnecessary re-renders: wrap expensive data aggregations or filter calculations in `useMemo`.

### 2.3 API Requests with Axios
- Always handle API calls using `async/await` enclosed in `try / catch / finally` blocks.
- Manage loading states explicitly to provide visual feedback (`CircularProgress`, skeleton loaders, or disabled buttons).
- Pass authentication tokens in the `Authorization` header:
  ```javascript
  const headers = { Authorization: `Token ${token}` };
  ```
- Example Data Fetching Pattern:
  ```javascript
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.ENTERPRISE_IMPROVEMENT_PLANS, {
        headers: { Authorization: `Token ${token}` }
      });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load data:', err);
      notify?.(err.response?.data?.detail || 'Failed to fetch records.', 'error');
    } finally {
      setLoading(false);
    }
  };
  ```

---

## 3. Material-UI (MUI v5) Styling Conventions

### 3.1 Use of the `sx` Prop & Brand Palette
- Use MUI's `sx` prop for component styling. Avoid external CSS classes or inline `style={{}}` attributes where possible.
- Always import and reference the `BRAND` token palette from `../theme`:
  ```javascript
  import { BRAND } from '../theme';

  // Example Button Styling:
  <Button
    variant="contained"
    sx={{
      bgcolor: BRAND.primaryMain,
      color: '#FFFFFF',
      fontWeight: 700,
      textTransform: 'none',
      borderRadius: 2,
      '&:hover': { bgcolor: BRAND.primaryDark },
    }}
  >
    Save Changes
  </Button>
  ```

### 3.2 Responsive Design Standards
- Ensure all dialogs, tables, and form layouts are responsive across desktop, tablet, and mobile displays.
- Use MUI Grid with responsive breakpoint props:
  ```javascript
  <Grid container spacing={2}>
    <Grid item xs={12} sm={6} md={4}>
      {/* Component */}
    </Grid>
  </Grid>
  ```
- Dialogs must use `maxWidth="lg"` or `maxWidth="xl"` with `fullWidth` and scrollable contents (`DialogContent dividers`).

### 3.3 Status Badges & Chips
- Status representations must follow consistent color semantics:
  - **Draft / Pending**: Soft Gray or Muted Slate (`bgcolor: '#F1F5F9', color: '#475569'`).
  - **Needs Improvement**: GOPA Amber/Gold (`bgcolor: '#FEF3C7', color: '#92400E'`).
  - **Critical Gap / Rejected**: GIZ Soft Red (`bgcolor: '#FEE2E2', color: '#991B1B'`).
  - **Satisfactory / Approved**: Programme Green (`bgcolor: '#ECFDF5', color: '#065F46'`).

---

## 4. Diagnostic & Enterprise Improvement Plan (TBIP) Conventions

### 4.1 7-Pillar Schema Definitions
The diagnostic questions are grouped into 7 pillars across both backend and frontend:
1. `governance`: Governance & Strategy (`gov_1` – `gov_6`)
2. `finance`: Financial Management (`fin_1` – `fin_5`)
3. `hr`: Human Resources (HR) (`hr_1`, `hr_6`, `hr_2`, `hr_3`, `hr_4`, `hr_5`)
4. `marketing`: Marketing & Sales (`mkt_1` – `mkt_5`)
5. `digital`: Digital & Technology (`dig_1` – `dig_7`)
6. `env`: Environmental Sustainability (`env_1` – `env_5`)
7. `regulatory`: Regulatory Compliance & Quality (`reg_1` – `reg_4`)

### 4.2 Scoring & Normalization Logic
- Question answers must be normalized via `normalize_answer(ans)` into one of:
  - `'Available and complete'` (2 points)
  - `'Needs improvement'` (1 point)
  - `'Not available'` (0 points)
- Category score percentage:
  $$\text{Score \%} = \text{round}\left(\frac{\text{Earned Points}}{\text{Applicable Questions} \times 2} \times 100\right)$$
- Overall Priority Assignment:
  - `High`: Score $< 50\%$ or $\ge 6$ questions "Not available".
  - `Medium`: Score $< 75\%$ or $\ge 3$ questions "Not available" or $\ge 6$ questions "Needs improvement".
  - `Low`: All other cases.

### 4.3 1-Click BDS Auto-Detection
- When the user triggers "Auto-Detect from Diagnostic Gaps", inspect all 38 answers. For any question answered `"Not available"` or `"Needs improvement"`, query `QUESTION_HELP_MAP[q.id]` and append the corresponding technical assistance topic to `help_needed_areas` without duplicates.

### 4.4 Priority Actions Roadmap Schema
Roadmap action items stored in `priority_actions` JSONField must follow this structure:
```json
{
  "id": 1,
  "ranking": 1,
  "priority_level": "High",
  "action": "Description of the targeted business improvement intervention",
  "category": "Financial Management",
  "bge_support_days": 2.0,
  "means_of_verification": "Bank deposit slips and daily sales reconciliation ledger",
  "owner": "BGE Name / Business Owner",
  "timeline": "Within 30 days",
  "outcome": "Measurable operational or financial change",
  "status": "Pending"
}
```

---

## 5. Verification & Testing Protocols

### 5.1 Backend Verification
Before submitting or deploying backend code, execute the following commands in `/Users/RICHOBUKU/portfolio-manager/backend`:
1. **System Health Check**:
   ```bash
   /opt/miniconda3/bin/python manage.py check
   ```
   *Expected output*: `System check identified no issues (0 silenced).`
2. **Schema Migration Validation**:
   ```bash
   /opt/miniconda3/bin/python manage.py showmigrations
   ```
3. **Execute Unit Tests**:
   ```bash
   /opt/miniconda3/bin/python manage.py test portfolio
   ```

### 5.2 Frontend Verification
Before submitting or deploying frontend code, execute the following commands in `/Users/RICHOBUKU/portfolio-manager/frontend`:
1. **Production Build Validation**:
   ```bash
   npm run build
   ```
   *Expected output*: `Compiled successfully.` with 0 errors.

---

## 6. Git & Commit Message Conventions

### 6.1 Commit Structure
Use **Conventional Commits** format: `<type>(<scope>): <short imperative description>`:

- `feat(tbip)`: Adding new features or updating diagnostic logic.
- `fix(dashboard)`: Fixing UI rendering bugs or state issues.
- `docs(antigravity)`: Updating project documentation and conventions.
- `refactor(views)`: Reorganizing backend modules or cleaning up endpoints.
- `test(api)`: Adding or fixing test suites.

### 6.2 Pre-Push Checklist
- [ ] No hardcoded passwords, tokens, or private secrets.
- [ ] All 7 diagnostic pillars verified in backend and frontend.
- [ ] Django `check` passes with 0 issues.
- [ ] React `npm run build` compiles with 0 errors.
- [ ] Git commit message clearly summarizes changes.
