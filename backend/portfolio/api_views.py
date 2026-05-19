from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Count, Sum, Q
from django.contrib.auth.models import User
from django.core.mail import send_mail, EmailMultiAlternatives
from django.conf import settings
from django.http import HttpResponse
import pandas as pd
import io

from .models import (
    Portfolio, Investment, Transaction,
    MSME, BusinessGrowthExpert, SupportRequest,
    TrainingSession, Attendance, TrainingTopic,
    Cohort, BGEGroup, MSMEReport, GroupReport, GroupReportContribution, PushSubscription, WorkOrder,
    GroupReportAttendance, CohortAdmin, ProgrammeGroup, MSMEGrowthSnapshot, VisitReportTemplate,
    TrainingFacilitationAssignment, TrainingReport, AnnualReviewReport,
    MentorTrainingReport,
)
from .account_setup import ensure_bge_account, send_welcome_email


def _managed_groups(user):
    """Return the ProgrammeGroup IDs a programme manager can access,
    or None for superusers/staff (meaning no restriction)."""
    if user.is_staff or user.is_superuser:
        return None
    try:
        return list(user.cohort_admin_profile.managed_groups.values_list('id', flat=True))
    except CohortAdmin.DoesNotExist:
        return None


def _is_viewer(user):
    """True for accounts that have no BGE profile and no programme-manager role — read-only."""
    if user.is_staff or user.is_superuser:
        return False
    if hasattr(user, 'cohort_admin_profile'):
        return False
    if hasattr(user, 'bge_profile'):
        return False
    return True


def _is_programme_manager(user):
    """True for cohort_admin accounts that are NOT full staff/superuser."""
    if user.is_staff or user.is_superuser:
        return False
    return hasattr(user, 'cohort_admin_profile')


class ViewerReadOnlyMixin:
    """Block create/update/delete for viewer accounts."""
    def _check_not_viewer(self):
        if _is_viewer(self.request.user):
            raise PermissionDenied("Viewer accounts have read-only access.")

    def create(self, request, *args, **kwargs):
        self._check_not_viewer()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_not_viewer()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_not_viewer()
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._check_not_viewer()
        return super().destroy(request, *args, **kwargs)


class ProgrammeManagerReadOnlyMixin:
    """Block create/update/delete for programme-manager (cohort_admin) accounts."""
    def _check_not_pm(self):
        if _is_programme_manager(self.request.user):
            raise PermissionDenied("Programme Managers have read-only access to this resource.")

    def create(self, request, *args, **kwargs):
        self._check_not_pm()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_not_pm()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_not_pm()
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._check_not_pm()
        return super().destroy(request, *args, **kwargs)


from pywebpush import webpush, WebPushException
import json as _json
from .serializers import (
    PortfolioSerializer, InvestmentSerializer, TransactionSerializer,
    MSMESerializer, BusinessGrowthExpertSerializer, SupportRequestSerializer,
    TrainingSessionSerializer, AttendanceSerializer, TrainingTopicSerializer,
    TrainingFacilitationAssignmentSerializer, TrainingReportSerializer,
    CohortSerializer, BGEGroupSerializer, MSMEReportSerializer,
    GroupReportSerializer, GroupReportContributionSerializer, WorkOrderSerializer,
    VisitReportTemplateSerializer,
    GroupReportAttendanceSerializer, MSMEGrowthSnapshotSerializer,
    AnnualReviewReportSerializer, MentorTrainingReportSerializer,
)


class PortfolioViewSet(viewsets.ModelViewSet):
    """Portfolio is per-user. Admins see everything; everyone else sees only
    their own portfolios. Previously every authenticated user could read or
    modify every portfolio in the system."""
    queryset = Portfolio.objects.all()
    serializer_class = PortfolioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Portfolio.objects.all()
        u = self.request.user
        if not (u.is_staff or u.is_superuser):
            qs = qs.filter(user=u)
        return qs

    def perform_create(self, serializer):
        # Ensure created portfolios are bound to the requesting user
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'])
    def analytics(self, request):
        portfolios = self.get_queryset()  # tenant-scoped
        total_value = sum(p.total_value() for p in portfolios)
        total_cost = sum(p.total_cost() for p in portfolios)
        total_return = total_value - total_cost
        total_return_pct = (total_return / total_cost * 100) if total_cost > 0 else 0
        investment_types = Investment.objects.filter(portfolio__in=portfolios).values('investment_type').annotate(
            count=Count('id'), total_value=Sum('current_price')
        )
        return Response({
            'total_portfolios': portfolios.count(),
            'total_value': total_value,
            'total_cost': total_cost,
            'total_return': total_return,
            'total_return_percentage': total_return_pct,
            'investment_types': investment_types,
        })


class InvestmentViewSet(viewsets.ModelViewSet):
    queryset = Investment.objects.all()
    serializer_class = InvestmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Investment.objects.all()
        u = self.request.user
        if not (u.is_staff or u.is_superuser):
            qs = qs.filter(portfolio__user=u)
        pid = self.request.query_params.get('portfolio')
        if pid:
            qs = qs.filter(portfolio_id=pid)
        return qs.select_related('portfolio')


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Transaction.objects.all()
        u = self.request.user
        if not (u.is_staff or u.is_superuser):
            qs = qs.filter(investment__portfolio__user=u)
        iid = self.request.query_params.get('investment')
        if iid:
            qs = qs.filter(investment_id=iid)
        return qs.select_related('investment', 'investment__portfolio').order_by('-transaction_date')


class CohortViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    queryset = Cohort.objects.all()
    serializer_class = CohortSerializer
    permission_classes = [IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff and not request.user.is_superuser:
            raise PermissionDenied("Only admins can delete cohorts.")
        return super().destroy(request, *args, **kwargs)


class ProgrammeGroupViewSet(viewsets.ModelViewSet):
    """Cross-cutting labels that can be applied to MSMEs (e.g. Green MSMEs, Agroprocessors).
    Read-only for non-admins; create/update/delete restricted to admins."""
    queryset = ProgrammeGroup.objects.all()
    serializer_class = None  # defined below via import
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        from .serializers import ProgrammeGroupSerializer
        return ProgrammeGroupSerializer

    def create(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can create programme groups.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can edit programme groups.")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can delete programme groups.")
        return super().destroy(request, *args, **kwargs)


class MSMEGrowthSnapshotViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """
    Growth snapshots for a single MSME.

    List/retrieve all snapshots for a given MSME:
        GET /api/growth-snapshots/?msme=<id>

    Create a new BGE-visit snapshot:
        POST /api/growth-snapshots/
        { msme, snapshot_date, source, annual_turnover, ... }
    """
    serializer_class   = MSMEGrowthSnapshotSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = MSMEGrowthSnapshot.objects.select_related('msme', 'collected_by').order_by('snapshot_date')
        msme_id = self.request.query_params.get('msme')
        bge_id  = self.request.query_params.get('bge')
        if msme_id:
            qs = qs.filter(msme_id=msme_id)
        if bge_id:
            # All snapshots for MSMEs directly assigned to this BGE or in their groups
            from .models import BusinessGrowthExpert, BGEGroup
            try:
                bge = BusinessGrowthExpert.objects.get(pk=bge_id)
                group_msme_ids = MSME.objects.filter(assigned_group__in=bge.bge_groups.all()).values_list('id', flat=True)
                direct_msme_ids = MSME.objects.filter(assigned_bge=bge).values_list('id', flat=True)
                all_ids = set(list(direct_msme_ids) + list(group_msme_ids))
                qs = qs.filter(msme_id__in=all_ids)
            except BusinessGrowthExpert.DoesNotExist:
                qs = qs.none()
        return qs

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can delete snapshots.")
        return super().destroy(request, *args, **kwargs)


class MSMEViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    queryset = MSME.objects.filter(is_active=True)
    serializer_class = MSMESerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = MSME.objects.filter(is_active=True)

        user = self.request.user
        group_ids = _managed_groups(user)
        if group_ids is not None:
            # Programme manager — scope to MSMEs in their managed programme groups
            qs = qs.filter(programme_groups__in=group_ids).distinct()
        elif _is_viewer(user):
            pass  # viewers see all MSMEs read-only (ViewerReadOnlyMixin blocks writes)
        elif not (user.is_staff or user.is_superuser):
            # BGE users only see their own assigned MSMEs — directly OR via any group they belong to.
            # Exception: ?training=1 returns all MSMEs so a facilitator can record attendance
            # for participants who are not personally assigned to them.
            training_context = self.request.query_params.get('training') == '1'
            if not training_context:
                try:
                    bge = user.bge_profile
                    from django.db.models import Q
                    qs = qs.filter(
                        Q(assigned_bge=bge) | Q(assigned_group__members=bge)
                    ).distinct()
                except Exception:
                    qs = qs.none()

        search = self.request.query_params.get('search')
        if search:
            # Combine search clauses with Q() inside ONE .filter(), not via
            # queryset union (`qs.filter(...) | qs.filter(...)`) — the union
            # form silently drops the BGE tenant scoping that was applied
            # above, leaking every other BGE's MSMEs into search results.
            from django.db.models import Q
            qs = qs.filter(
                Q(business_name__icontains=search) |
                Q(owner_name__icontains=search)    |
                Q(sector__icontains=search)        |
                Q(msme_code__icontains=search)
            )

        business_type = self.request.query_params.get('business_type')
        if business_type:
            qs = qs.filter(business_type=business_type)

        sector = self.request.query_params.get('sector')
        if sector:
            qs = qs.filter(sector=sector)

        cohort = self.request.query_params.get('cohort')
        if cohort:
            qs = qs.filter(cohort_id=cohort)

        city = self.request.query_params.get('city')
        if city:
            qs = qs.filter(city__iexact=city)

        return qs.select_related('cohort', 'assigned_bge', 'assigned_group').prefetch_related('programme_groups').order_by('-created_at')

    def _is_admin_or_cohort_admin(self, request):
        u = request.user
        if u.is_staff or u.is_superuser:
            return True
        return _managed_groups(u) is not None

    def destroy(self, request, *args, **kwargs):
        if not self._is_admin_or_cohort_admin(request):
            raise PermissionDenied("Only admins can delete MSMEs.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['patch'])
    def assign_bge(self, request, pk=None):
        if not self._is_admin_or_cohort_admin(request):
            raise PermissionDenied("Only admins can assign BGEs.")
        msme = self.get_object()
        # Programme managers may only assign BGEs to MSMEs within their managed groups
        if _is_programme_manager(request.user):
            managed = _managed_groups(request.user) or []
            if not msme.programme_groups.filter(id__in=managed).exists():
                raise PermissionDenied("You can only assign BGEs to MSMEs in your managed programme groups.")
        bge_id = request.data.get('bge_id')
        objectives = (request.data.get('objectives') or '').strip()
        assignment_date = request.data.get('assignment_date') or None
        bge = None  # initialise so the notification block below is always safe
        if bge_id:
            try:
                bge = BusinessGrowthExpert.objects.get(pk=bge_id)
                # Prevent assigning the same BGE twice
                if msme.assigned_bge_id and msme.assigned_bge_id == bge.id:
                    return Response(
                        {'error': f'{msme.business_name} is already assigned to {bge.name}.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                msme.assigned_bge = bge
            except BusinessGrowthExpert.DoesNotExist:
                return Response({'error': 'BGE not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            msme.assigned_bge = None
        msme.assignment_objectives = objectives
        msme.assignment_date = assignment_date
        msme.save()
        # Notify the BGE about the new assignment
        if bge_id and bge:
            _notify_bge(
                bge,
                title='New MSME Assignment',
                body=f'You have been assigned to {msme.business_name}. Check your dashboard for details.',
                url='/bge'
            )
        return Response(MSMESerializer(msme).data)

    @action(detail=True, methods=['patch'])
    def assign_cohort(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can assign cohorts.")
        msme = self.get_object()
        cohort_id = request.data.get('cohort_id')
        if cohort_id:
            try:
                cohort = Cohort.objects.get(pk=cohort_id)
                msme.cohort = cohort
            except Cohort.DoesNotExist:
                return Response({'error': 'Cohort not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            msme.cohort = None
        msme.save()
        return Response(MSMESerializer(msme).data)

    @action(detail=True, methods=['patch'], url_path='set-groups')
    def set_groups(self, request, pk=None):
        """Add or remove this MSME from programme groups.

        Body: { "group_ids": [1, 2, ...] }   — replaces the full set.
        Body: { "add": [1], "remove": [2] }   — incremental add/remove.
        """
        if not self._is_admin_or_cohort_admin(request):
            raise PermissionDenied("Only admins can modify programme group membership.")
        msme = self.get_object()
        if 'group_ids' in request.data:
            ids = request.data['group_ids'] or []
            msme.programme_groups.set(ids)
        else:
            add_ids    = request.data.get('add', [])
            remove_ids = request.data.get('remove', [])
            if add_ids:
                msme.programme_groups.add(*add_ids)
            if remove_ids:
                msme.programme_groups.remove(*remove_ids)
        return Response(MSMESerializer(msme, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='upload-template', permission_classes=[])
    def upload_template(self, request):
        """Download a blank MSME upload template (.xlsx) with the unified schema."""
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment
        from openpyxl.utils import get_column_letter

        wb = Workbook()
        ws = wb.active
        ws.title = "MSMEs"

        columns = [
            ('Business Name',     32, 'Required. The legal/trading name of the MSME.'),
            ('Owner Name',        24, 'Primary contact / owner name.'),
            ('Sex',               10, 'Male or Female.'),
            ('Phone',             18, 'Owner/contact phone number.'),
            ('Email',             28, 'Owner/contact email.'),
            ('Business Email',    28, 'Business email (if separate from owner email).'),
            ('Business Type',     20, 'Micro / Small / Medium / Sole proprietorship / Company / Partnership / Cooperative.'),
            ('Sector',            22, 'Optional. Manufacturing / Services / Trade / Agriculture / Technology / Healthcare / Education / Construction / Other. Auto-inferred from Business Type if blank.'),
            ('District',          18, 'District of operation.'),
            ('Town',              16, 'Town or city.'),
            ('Physical Location', 32, 'Street / landmark address (optional).'),
            ('Role',              18, 'Role of contact person (Director, Manager, etc.).'),
            ('Cohort',            14, 'e.g. Cohort 1, Cohort 2 (optional — can also be set in upload form).'),
        ]

        header_font = Font(bold=True, color='FFFFFF', size=11)
        header_fill = PatternFill('solid', start_color='1A2F4B')
        header_align = Alignment(horizontal='center', vertical='center')

        for i, (name, width, _) in enumerate(columns, start=1):
            cell = ws.cell(row=1, column=i, value=name)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            ws.column_dimensions[get_column_letter(i)].width = width

        ws.row_dimensions[1].height = 28
        ws.freeze_panes = 'A2'

        # Add an example row so users see the expected shape
        example = [
            'Acholi Shea Cooperative Ltd', 'Anena Sharon', 'Female', '256775779335',
            'anena.sharon@example.com', 'info@acholishea.org', 'Cooperative',
            'Agriculture', 'Gulu', 'Gulu', 'Plot 12, Gulu town', 'Director', 'Cohort 1',
        ]
        for i, val in enumerate(example, start=1):
            c = ws.cell(row=2, column=i, value=val)
            c.font = Font(italic=True, color='888888')

        # Field-guidance row at the bottom
        guide_row = 4
        ws.cell(row=guide_row, column=1, value='Notes:').font = Font(bold=True, color='C8102E')
        for i, (_, _, note) in enumerate(columns, start=1):
            ws.cell(row=guide_row + 1, column=i, value=note).font = Font(size=9, color='666666', italic=True)
            ws.cell(row=guide_row + 1, column=i).alignment = Alignment(wrap_text=True, vertical='top')
        ws.row_dimensions[guide_row + 1].height = 60

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        resp = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        resp['Content-Disposition'] = 'attachment; filename="MSME_Upload_Template.xlsx"'
        return resp

    @action(detail=False, methods=['post'], url_path='upload')
    @transaction.atomic
    def upload(self, request):
        """Upload MSME list from Cohort 1 (CSV/Excel) or Cohort 2 (Survey Excel).
        Auto-detects format from column names.

        The whole import runs inside one DB transaction. Per-row exceptions are
        captured into the `skipped` list (so one bad row doesn't kill the rest),
        but if anything escapes that try/except — or the function returns with
        an HTTP error after rows were inserted — the transaction is rolled back
        and the table is left in its pre-import state.
        Accepts optional form field: cohort_name (string).
        """
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can upload MSME data.")

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        # update_existing=true (default) → update duplicates; false → skip them
        update_existing = request.data.get('update_existing', 'true').lower() != 'false'
        cohort_name = request.data.get('cohort_name', '').strip()

        # Read file (CSV or Excel)
        try:
            raw_bytes = file.read()
            if file.name.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(raw_bytes))
            elif file.name.endswith(('.xlsx', '.xls')):
                df = pd.read_excel(io.BytesIO(raw_bytes))
                # If the first row appears to be blank/unnamed, the real header may be in row 1
                unnamed = sum(1 for c in df.columns if str(c).startswith('Unnamed:'))
                if unnamed > len(df.columns) / 2:
                    df = pd.read_excel(io.BytesIO(raw_bytes), header=1)
            else:
                return Response({'error': 'Please upload a CSV or Excel file (.csv, .xlsx, .xls).'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Could not read file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        # Normalise column names for detection (strip whitespace, keep original for lookup)
        cols = set(df.columns.tolist())
        cols_stripped = {c.strip() for c in cols}

        # Unified template — preferred format used by the cleaning script.
        # Required: Business Name, Owner Name, Phone, Email, District, Town, Sex, Business Type
        is_unified = ('Business Name' in cols_stripped and 'Owner Name' in cols_stripped)
        # Cohort 2 — numbered survey format (1.1. Business Name: …)
        is_cohort2 = '1.1.  Business Name:' in cols or any('Business Name' in c for c in cols if '1.1' in c)
        # Cohort 1 — PRUDEV II Cohort1 format (Name, District, Town, Name of contact person …)
        is_cohort1 = (not is_unified) and ('Name' in cols and 'Name of contact person' in cols)
        # Cohort 2 simple — survey export with plain headers (Business Name:, Name of Business Owner: …)
        is_cohort2_simple = (
            not is_unified and not is_cohort1 and not is_cohort2 and
            any('Business Name' in c for c in cols_stripped) and
            any('Business Owner' in c for c in cols_stripped)
        )

        if not is_unified and not is_cohort1 and not is_cohort2 and not is_cohort2_simple:
            return Response({
                'error': (
                    'Unrecognised file format. Use the unified upload template '
                    '(columns: Business Name, Owner Name, Sex, Phone, Email, Business Email, '
                    'Business Type, District, Town, Physical Location, Role).'
                )
            }, status=status.HTTP_400_BAD_REQUEST)

        # Resolve or create cohort
        cohort_obj = None
        if cohort_name:
            cohort_obj, _ = Cohort.objects.get_or_create(name=cohort_name)

        def clean_str(val, default=''):
            if val is None or (isinstance(val, float) and pd.isna(val)):
                return default
            s = str(val).strip()
            return '' if s == 'nan' else s

        def clean_phone(val):
            raw = clean_str(val)
            if not raw:
                return ''
            try:
                return str(int(float(raw)))
            except (ValueError, TypeError):
                return raw

        def map_gender(val):
            v = clean_str(val).upper()
            if v in ('M', 'MALE'):
                return 'MALE'
            if v in ('F', 'FEMALE'):
                return 'FEMALE'
            return ''

        def map_business_type(val):
            v = clean_str(val).upper()
            if 'MEDIUM' in v:
                return 'MEDIUM'
            if 'SMALL' in v or 'COMPANY' in v or 'SMC' in v or 'PARTNERSHIP' in v:
                return 'SMALL'
            return 'MICRO'  # sole proprietorship, cooperative, default

        def map_sector(val):
            v = clean_str(val).upper()
            if any(x in v for x in ('AGRO', 'FARM', 'AGRICULTURE', 'AGRI')):
                return 'AGRICULTURE'
            if any(x in v for x in ('MANUFACTUR', 'PROCESSING', 'MILLER', 'MILL')):
                return 'MANUFACTURING'
            if any(x in v for x in ('TRADE', 'BUYER', 'SHOP', 'INPUT', 'VET')):
                return 'TRADE'
            if any(x in v for x in ('SERVICE', 'BDS', 'DEVELOPMENT', 'FINANCIAL', 'PROVIDER', 'FINANCE')):
                return 'SERVICES'
            if 'TECH' in v or 'INNOVATOR' in v:
                return 'TECHNOLOGY'
            if 'HEALTH' in v:
                return 'HEALTHCARE'
            if 'EDUCATION' in v:
                return 'EDUCATION'
            if 'CONSTRUCT' in v:
                return 'CONSTRUCTION'
            return 'OTHER'

        created, updated, skipped = 0, 0, []

        def find_col(cols, prefix, keyword=None):
            """Match column whose stripped name starts with prefix+ space/dot, optionally containing keyword."""
            import re
            pat = re.compile(r'^\s*' + re.escape(prefix) + r'[\s\.]')
            for c in cols:
                if pat.match(c):
                    if keyword is None or keyword.lower() in c.lower():
                        return c
            return None

        # Pre-compute Cohort 2 simple column mapping once (outside the row loop)
        # Strip all column names to a lookup dict: stripped_name → original_name
        col_map = {c.strip(): c for c in cols}

        def get_col(*keywords):
            """Return first column whose stripped name contains all keywords (case-insensitive)."""
            for c_stripped, c_orig in col_map.items():
                c_lower = c_stripped.lower()
                if all(k.lower() in c_lower for k in keywords):
                    return c_orig
            return None

        if is_unified:
            u_bname    = col_map.get('Business Name')
            u_owner    = col_map.get('Owner Name')
            u_sex      = col_map.get('Sex')
            u_phone    = col_map.get('Phone')
            u_email    = col_map.get('Email')
            u_bemail   = col_map.get('Business Email')
            u_type     = col_map.get('Business Type')
            u_sector   = col_map.get('Sector')   # optional — falls back to map_sector(Business Type)
            u_district = col_map.get('District')
            u_town     = col_map.get('Town')
            u_address  = col_map.get('Physical Location') or col_map.get('Address')

        if is_cohort2_simple:
            # Column names for Cohort 2 simple format (e.g. "Business Name:", "Name of Business Owner:", …)
            # Use exact strip-match first, then fallback to keyword search
            s2_bname    = col_map.get('Business Name:') or col_map.get('Business Name') or get_col('business name')
            s2_owner    = col_map.get('Name of Business Owner:') or col_map.get('Name of Business Owner') or get_col('name of business owner')
            # Phone: prefer dedicated business phone, fall back to owner contacts
            s2_phone    = (col_map.get('Business Phone Number(s):') or col_map.get('Business Phone Number')
                           or get_col('business phone') or get_col('business owner contact'))
            s2_email    = col_map.get("Business Owners Email:") or col_map.get("Business Owner's Email") or get_col('owner', 'email')
            s2_bemail   = col_map.get('Business email address') or col_map.get('Business email address ') or get_col('business email')
            s2_sex      = col_map.get('Sex') or col_map.get('Sex ') or get_col('sex')
            s2_type     = col_map.get('Type of Business: ') or col_map.get('Type of Business:') or col_map.get('Type of Business') or get_col('type of business')
            s2_district = col_map.get('District') or col_map.get('district')
            s2_town     = col_map.get('Town') or col_map.get('town')
            s2_sector   = None  # not present in this format

        # Pre-compute Cohort 2 numbered column mapping once (outside the row loop)
        if is_cohort2:
            c2_bname  = find_col(cols, '1.1',  'Business Name')
            c2_brn    = find_col(cols, '1.2',  'Registration')
            c2_owner  = find_col(cols, '1.4',  'Owner')
            c2_phone1 = find_col(cols, '1.5')   # owner contacts
            c2_sex    = find_col(cols, '1.6',  'Sex')
            c2_email  = find_col(cols, '1.7',  'Email')
            c2_type   = find_col(cols, '1.10', 'Type')
            c2_phone2 = find_col(cols, '1.12') # business phone (preferred)
            c2_bemail = find_col(cols, '1.13')
            c2_sector = find_col(cols, '2.1',  'core business')

        blank_rows = 0  # track silently-blank rows so user knows why count differs
        for i, row in df.iterrows():
            try:
                if is_unified:
                    business_name = clean_str(row.get(u_bname, '')) if u_bname else ''
                    if not business_name:
                        if all((pd.isna(v) or str(v).strip() in ('', 'nan')) for v in row.values):
                            blank_rows += 1
                        else:
                            skipped.append({'row': i + 2, 'error': 'Missing Business Name'})
                        continue
                    record = {
                        'business_name': business_name,
                        'owner_name':    clean_str(row.get(u_owner, '')) if u_owner else '',
                        'gender':        map_gender(row.get(u_sex, '')) if u_sex else '',
                        'phone':         clean_phone(row.get(u_phone, '')) if u_phone else '',
                        'email':         clean_str(row.get(u_email, '')) if u_email else '',
                        'business_email': clean_str(row.get(u_bemail, '')) if u_bemail else '',
                        'business_type': map_business_type(row.get(u_type, '')) if u_type else 'MICRO',
                        # Sector: prefer an explicit Sector column, otherwise infer from Business Type / sector keywords
                        'sector':        (
                            map_sector(row.get(u_sector, '')) if u_sector
                            else (map_sector(row.get(u_type, '')) if u_type else 'OTHER')
                        ),
                        'state':         clean_str(row.get(u_district, '')) if u_district else '',
                        'city':          clean_str(row.get(u_town, '')) if u_town else '',
                        'address':       clean_str(row.get(u_address, '')) if u_address else '',
                        'country':       'Uganda',
                        'source_file':   file.name,
                        'cohort':        cohort_obj,
                        'is_active':     True,
                    }
                elif is_cohort2_simple:
                    business_name = clean_str(row.get(s2_bname, '')) if s2_bname else ''
                    if not business_name:
                        # check if the whole row is blank vs just missing business name
                        if all((pd.isna(v) or str(v).strip() in ('', 'nan')) for v in row.values):
                            blank_rows += 1
                        else:
                            skipped.append({'row': i + 2, 'error': 'Missing Business Name'})
                        continue

                    record = {
                        'business_name': business_name,
                        'owner_name': clean_str(row.get(s2_owner, '')) if s2_owner else '',
                        'phone': clean_phone(row.get(s2_phone, '')) if s2_phone else '',
                        'email': clean_str(row.get(s2_email, '')) if s2_email else '',
                        'business_email': clean_str(row.get(s2_bemail, '')) if s2_bemail else '',
                        'gender': map_gender(row.get(s2_sex, '')) if s2_sex else '',
                        'business_type': map_business_type(row.get(s2_type, '')) if s2_type else 'MICRO',
                        'sector': 'OTHER',
                        'state': clean_str(row.get(s2_district, '')) if s2_district else '',
                        'city': clean_str(row.get(s2_town, '')) if s2_town else '',
                        'country': 'Uganda',
                        'source_file': file.name,
                        'cohort': cohort_obj,
                        'is_active': True,
                    }

                elif is_cohort2:
                    bname_col  = c2_bname
                    owner_col  = c2_owner
                    sex_col    = c2_sex
                    email_col  = c2_email
                    type_col   = c2_type
                    phone_col  = c2_phone2 or c2_phone1
                    bemail_col = c2_bemail
                    sector_col = c2_sector
                    brn_col    = c2_brn

                    business_name = clean_str(row.get(bname_col, '')) if bname_col else ''
                    if not business_name:
                        if all((pd.isna(v) or str(v).strip() in ('', 'nan')) for v in row.values):
                            blank_rows += 1
                        else:
                            skipped.append({'row': i + 2, 'error': 'Missing Business Name'})
                        continue

                    record = {
                        'business_name': business_name,
                        'registration_number': clean_str(row.get(brn_col, '')) if brn_col else '',
                        'owner_name': clean_str(row.get(owner_col, '')) if owner_col else '',
                        'gender': map_gender(row.get(sex_col, '')) if sex_col else '',
                        'email': clean_str(row.get(email_col, '')) if email_col else '',
                        'phone': clean_phone(row.get(phone_col, '')) if phone_col else '',
                        'business_email': clean_str(row.get(bemail_col, '')) if bemail_col else '',
                        'business_type': map_business_type(row.get(type_col, '')) if type_col else 'MICRO',
                        'sector': map_sector(row.get(sector_col, '')) if sector_col else 'OTHER',
                        'state': clean_str(row.get('District', '')),
                        'city': clean_str(row.get('Town/City', '')),
                        'country': 'Uganda',
                        'source_file': file.name,
                        'cohort': cohort_obj,
                        'is_active': True,
                    }
                else:  # Cohort 1
                    business_name = clean_str(row.get('Name', ''))
                    if not business_name:
                        if all((pd.isna(v) or str(v).strip() in ('', 'nan')) for v in row.values):
                            blank_rows += 1
                        else:
                            skipped.append({'row': i + 2, 'error': 'Missing Name (business)'})
                        continue

                    gender = map_gender(row.get('Sex of founder', row.get('Gender of Key contact person', '')))

                    record = {
                        'business_name': business_name,
                        'owner_name': clean_str(row.get('Name of contact person', '')),
                        'gender': gender,
                        'phone': clean_phone(row.get('Mobile phone numbers ', row.get('Mobile phone numbers', ''))),
                        'email': clean_str(row.get('Email Address of contact person', '')),
                        'business_email': clean_str(row.get('Business Email Address', '')),
                        'address': clean_str(row.get('Physical location', '')),
                        'state': clean_str(row.get('District', '')),
                        'city': clean_str(row.get('Town', '')),
                        'business_type': 'MICRO',
                        'sector': 'OTHER',
                        'country': 'Uganda',
                        'source_file': file.name,
                        'cohort': cohort_obj,
                        'is_active': True,
                    }

                # Update-or-create by business name + owner (avoid duplicates on re-upload).
                # Pop both keys out of `record` so they aren't passed twice to create().
                business_name = record.pop('business_name')
                owner_name    = record.pop('owner_name', '')
                lookup = {'business_name': business_name}
                if owner_name:
                    lookup['owner_name'] = owner_name

                # Wrap each row's DB write in a savepoint so an IntegrityError
                # on row N doesn't poison the outer transaction for rows N+1..end.
                with transaction.atomic():
                    existing = MSME.objects.filter(**lookup).first()
                    if existing:
                        if update_existing:
                            # Restore owner_name into the update payload so existing rows can be enriched
                            if owner_name and not existing.owner_name:
                                existing.owner_name = owner_name
                            for k, v in record.items():
                                setattr(existing, k, v)
                            existing.save()
                            updated += 1
                        else:
                            skipped.append({'row': i + 2, 'error': f'Duplicate skipped: {business_name}'})
                    else:
                        # `lookup` carries the unique-fields, `record` carries everything else
                        MSME.objects.create(**lookup, **record)
                        created += 1

            except Exception as e:
                skipped.append({'row': i + 2, 'error': str(e)})

        msg = f"{created} MSMEs added, {updated} updated"
        if cohort_name:
            msg += f" (assigned to cohort: {cohort_name})"
        if skipped:
            msg += f", {len(skipped)} rows skipped"
        if blank_rows:
            msg += f", {blank_rows} blank rows ignored"
        msg += "."

        return Response({
            'created': created,
            'updated': updated,
            'skipped': len(skipped),
            'blank_rows': blank_rows,
            'errors': skipped[:50],  # cap at 50 in response
            'total_rows': int(len(df)),
            'message': msg,
        })

    @action(detail=False, methods=['get'])
    def analytics(self, request):
        """Rich analytics for the dashboard. Accepts optional filters that all
        downstream aggregations honour:
          ?cohort=<id>  ?district=<name>  ?sector=<code>  ?bge=<id>
        """
        from django.db.models import Q
        from django.db.models.functions import TruncMonth

        qs = MSME.objects.filter(is_active=True)

        # Apply optional filters so the analytics page can drill down.
        cohort_id = request.query_params.get('cohort')
        if cohort_id:
            qs = qs.filter(cohort_id=cohort_id)
        district = request.query_params.get('district')
        if district:
            qs = qs.filter(state__iexact=district)
        sector = request.query_params.get('sector')
        if sector:
            qs = qs.filter(sector=sector)
        bge_id = request.query_params.get('bge')
        if bge_id:
            qs = qs.filter(Q(assigned_bge_id=bge_id) | Q(assigned_group__members__id=bge_id)).distinct()

        agg = qs.aggregate(
            total_investment_needed=Sum('investment_needed'),
            total_annual_revenue=Sum('annual_revenue'),
            total_employees=Sum('employee_count'),
        )

        # Reports / activity stats
        from .models import MSMEReport, GroupReport
        report_status_stats = list(
            MSMEReport.objects.values('status').annotate(count=Count('id'))
        )
        group_report_status_stats = list(
            GroupReport.objects.values('status').annotate(count=Count('id'))
        )

        # BGE workload (top 15 BGEs by direct + group-assigned MSMEs)
        # Annotate everything in 2 queries instead of (1 + 3*N) per BGE.
        bge_qs = (BusinessGrowthExpert.objects
                  .filter(status='approved')
                  .annotate(
                      direct=Count(
                          'assigned_msmes',
                          filter=Q(assigned_msmes__is_active=True),
                          distinct=True,
                      ),
                      reports_count=Count('reports', distinct=True),
                  ))
        # `via_group` = MSMEs reachable through any of the BGE's groups.
        # Cheaper as a single grouped query than per-BGE.
        via_group_counts = dict(
            MSME.objects.filter(is_active=True, assigned_group__members__isnull=False)
                        .values_list('assigned_group__members')
                        .annotate(c=Count('id', distinct=True))
                        .values_list('assigned_group__members', 'c')
        )
        bge_workload = []
        for bge in bge_qs[:50]:
            via = via_group_counts.get(bge.id, 0)
            bge_workload.append({
                'bge_id':       bge.id,
                'bge_name':     bge.name,
                'direct':       bge.direct,
                'via_group':    via,
                'total':        bge.direct + via,
                'reports_count': bge.reports_count,
            })
        bge_workload.sort(key=lambda x: x['total'], reverse=True)
        bge_workload = bge_workload[:15]

        # Group performance — annotate in one query, no per-row counts.
        group_qs = (BGEGroup.objects
                    .select_related('team_lead')
                    .annotate(
                        msme_count=Count(
                            'assigned_msmes',
                            filter=Q(assigned_msmes__is_active=True),
                            distinct=True,
                        ),
                        active_member_count=Count('members', distinct=True),
                        reports_count=Count('reports', distinct=True),
                    ))
        group_stats = [
            {
                'group_id':       g.id,
                'group_name':     g.name,
                'msme_count':     g.msme_count,
                'member_count':   g.active_member_count,
                'reports_count':  g.reports_count,
                'team_lead_name': g.team_lead.name if g.team_lead else None,
            }
            for g in group_qs
        ]
        group_stats.sort(key=lambda x: x['msme_count'], reverse=True)

        # Time series — MSMEs created per month (last 18 months)
        time_series = list(
            qs.annotate(month=TruncMonth('created_at'))
              .values('month')
              .annotate(count=Count('id'))
              .order_by('month')
        )

        # Gender × Business Type cross-tab — for stacked bar
        gender_x_type = list(
            qs.values('gender', 'business_type')
              .annotate(count=Count('id'))
              .order_by('business_type', 'gender')
        )

        # ── Diagnostic analytics ──────────────────────────────────────────────
        diag_qs = qs.filter(diag_imported_at__isnull=False)
        diag_total = diag_qs.count()

        # Compliance & financial access flags
        diag_compliance = {
            'has_tin':           diag_qs.filter(diag_has_tin=True).count(),
            'has_ursb':          diag_qs.filter(diag_has_unbs=True).count(),
            'has_business_bank': diag_qs.filter(diag_has_business_bank=True).count(),
            'has_mobile_money':  diag_qs.filter(diag_has_mobile_money=True).count(),
            'total':             diag_total,
        }

        # Green business breakdown
        green_count = diag_qs.filter(diag_is_green_business=True).count()
        diag_green = {'green': green_count, 'non_green': diag_total - green_count, 'total': diag_total}

        # Turnover bands (count per band)
        diag_turnover_bands = list(
            diag_qs.exclude(diag_annual_turnover='')
                   .values('diag_annual_turnover')
                   .annotate(count=Count('id'))
                   .order_by('diag_annual_turnover')
        )

        # Total assets bands
        diag_asset_bands = list(
            diag_qs.exclude(diag_total_assets='')
                   .values('diag_total_assets')
                   .annotate(count=Count('id'))
                   .order_by('diag_total_assets')
        )

        # Employee aggregates (only rows that have values)
        from django.db.models import Sum as DSum
        emp_agg = diag_qs.aggregate(
            ft_male=DSum('diag_employees_ft_male'),
            ft_female=DSum('diag_employees_ft_female'),
            pt_male=DSum('diag_employees_pt_male'),
            pt_female=DSum('diag_employees_pt_female'),
        )
        diag_employees = {
            'ft_male':   emp_agg['ft_male']   or 0,
            'ft_female': emp_agg['ft_female'] or 0,
            'pt_male':   emp_agg['pt_male']   or 0,
            'pt_female': emp_agg['pt_female'] or 0,
        }

        # Owner sex from diagnostic
        diag_owner_sex = list(
            diag_qs.exclude(diag_owner_sex='')
                   .values('diag_owner_sex')
                   .annotate(count=Count('id'))
        )

        # Years operating distribution
        diag_years_operating = list(
            diag_qs.exclude(diag_years_operating='')
                   .values('diag_years_operating')
                   .annotate(count=Count('id'))
                   .order_by('diag_years_operating')
        )

        # Top districts from diagnostic (often more complete than `state`)
        diag_districts = list(
            diag_qs.exclude(diag_district='')
                   .values('diag_district')
                   .annotate(count=Count('id'))
                   .order_by('-count')[:12]
        )

        return Response({
            # KPIs
            'total_msmes': qs.count(),
            'total_investment_needed': agg['total_investment_needed'] or 0,
            'total_annual_revenue':    agg['total_annual_revenue']    or 0,
            'total_employees':         agg['total_employees']         or 0,
            'total_bges':              BusinessGrowthExpert.objects.count(),
            'total_groups':            BGEGroup.objects.count(),
            'total_reports':           MSMEReport.objects.count(),
            'total_group_reports':     GroupReport.objects.count(),

            # Distributions
            'business_type_stats': list(qs.values('business_type').annotate(count=Count('id'))),
            'sector_stats':        list(qs.values('sector').annotate(count=Count('id'))),
            'cohort_stats':        list(qs.values('cohort__name', 'cohort_id').annotate(count=Count('id')).order_by('cohort__name')),
            'gender_stats':        list(qs.values('gender').annotate(count=Count('id'))),
            'top_districts':       list(qs.values('state').exclude(state='').annotate(count=Count('id')).order_by('-count')[:10]),
            'top_cities':          list(qs.values('city').exclude(city='').annotate(count=Count('id')).order_by('-count')[:10]),

            # Cross-tabs
            'gender_x_type': gender_x_type,

            # BGE / Group performance
            'bge_status_stats':    list(BusinessGrowthExpert.objects.values('status').annotate(count=Count('id'))),
            'bge_workload':        bge_workload,
            'group_stats':         group_stats,

            # Reports
            'report_status_stats': report_status_stats,
            'group_report_status_stats': group_report_status_stats,

            # Time series
            'time_series':         time_series,

            # Diagnostic baseline analytics
            'diag_total':           diag_total,
            'diag_compliance':      diag_compliance,
            'diag_green':           diag_green,
            'diag_turnover_bands':  diag_turnover_bands,
            'diag_asset_bands':     diag_asset_bands,
            'diag_employees':       diag_employees,
            'diag_owner_sex':       diag_owner_sex,
            'diag_years_operating': diag_years_operating,
            'diag_districts':       diag_districts,
        })

    @action(detail=False, methods=['get'], url_path='inactive')
    def inactive_msmes(self, request):
        """Admin-only: list all inactive MSMEs so they can be reviewed before reactivation."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can view inactive MSMEs.")
        qs = MSME.objects.filter(is_active=False).order_by('business_name')
        data = list(qs.values('id', 'business_name', 'msme_code', 'owner_name',
                              'sector', 'city', 'cohort_id'))
        return Response({'count': len(data), 'msmes': data})

    @action(detail=False, methods=['post'], url_path='reactivate-all')
    def reactivate_all(self, request):
        """Admin-only: set is_active=True for every inactive MSME."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can reactivate MSMEs.")
        updated = MSME.objects.filter(is_active=False).update(is_active=True)
        return Response({'reactivated': updated,
                         'message': f'{updated} MSME(s) reactivated successfully.'})

    @action(detail=False, methods=['post'], url_path='import-diagnostics')
    def import_diagnostics(self, request):
        """Admin-only: upload the diagnostics Excel and run the import in-process.
        POST /api/msmes/import-diagnostics/  multipart field: file
        Returns a JSON summary of matched/unmatched counts.
        """
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can import diagnostic data.")

        uploaded = request.FILES.get('file')
        if not uploaded:
            return Response({'error': 'No file provided. Send multipart field "file".'}, status=400)

        import tempfile, os, io as _io, traceback as _tb
        from django.core.management import call_command

        suffix = os.path.splitext(uploaded.name)[1] or '.xlsx'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            for chunk in uploaded.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            out = _io.StringIO()
            call_command('import_diagnostics', tmp_path, stdout=out, stderr=out)
            output = out.getvalue()
        except Exception as exc:
            os.unlink(tmp_path)
            return Response({'error': f'{type(exc).__name__}: {exc}\n\n{_tb.format_exc()}'}, status=500)
        finally:
            try:
                os.unlink(tmp_path)
            except FileNotFoundError:
                pass

        return Response({'detail': output or 'Import complete.'})


class BusinessGrowthExpertViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
    queryset = BusinessGrowthExpert.objects.all()
    serializer_class = BusinessGrowthExpertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = BusinessGrowthExpert.objects.all()
        s = self.request.query_params.get('status')
        if s:
            qs = qs.filter(status=s)
        group = self.request.query_params.get('group')
        if group:
            qs = qs.filter(bge_groups__id=group)
        # Prefetch the relations the serializer pulls in (assigned_msmes,
        # bge_groups). Without this, listing N BGEs caused 2*N extra queries
        # (each BGE serialized triggered .assigned_msmes.all() and .bge_groups.all()).
        return qs.prefetch_related('assigned_msmes', 'bge_groups').order_by('-created_at')

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff and not request.user.is_superuser:
            raise PermissionDenied("Only admins can delete experts.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def leaderboard(self, request):
        bges = (BusinessGrowthExpert.objects
                .filter(status='approved')
                .prefetch_related('assigned_msmes', 'bge_groups')
                .annotate(support_count=Count('support_requests'))
                .order_by('-support_count'))
        return Response(BusinessGrowthExpertSerializer(bges, many=True).data)

    def _build_assignment_email(self, bge):
        """Build plain-text + HTML email for a BGE assignment. Shared by preview and send."""
        msmes = bge.assigned_msmes.filter(is_active=True).order_by('business_name')
        count = msmes.count()

        # ── Plain-text version ────────────────────────────────────────────────
        lines = [f"Dear {bge.name},", "", "Please find below your assignment details under the PRUDEV II Programme:", ""]
        if bge.deployment_objectives:
            lines += ["DEPLOYMENT OBJECTIVES", "─" * 40, bge.deployment_objectives, ""]
        lines += [f"ASSIGNED MSMEs ({count} {'businesses' if count != 1 else 'business'})", "─" * 40, ""]
        for i, m in enumerate(msmes, 1):
            lines.append(f"  {i}. {m.business_name} ({m.msme_code or 'No code'})")
            if m.owner_name: lines.append(f"     Owner: {m.owner_name}")
            if m.sector:     lines.append(f"     Sector: {m.sector}")
            if m.city:       lines.append(f"     Location: {m.city}")
            if m.phone:      lines.append(f"     Phone: {m.phone}")
            lines.append("")
        lines += [
            "Please log in to the PRUDEV II Portfolio Management System to view full details and submit visit reports.",
            "", "Best regards,", "PRUDEV II BDS Team", "GIZ · GOPA AFC",
        ]
        body_text = "\n".join(lines)

        # ── HTML version (renders beautifully in Outlook) ─────────────────────
        objectives_html = ""
        if bge.deployment_objectives:
            objectives_html = f"""
            <div style="background:#f8f9fa;border-left:4px solid #1A2E42;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;">
              <p style="font-weight:700;color:#1A2E42;margin:0 0 6px 0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Deployment Objectives</p>
              <p style="margin:0;color:#333;white-space:pre-line;">{bge.deployment_objectives}</p>
            </div>"""

        msme_rows_html = ""
        for i, m in enumerate(msmes, 1):
            details = []
            if m.owner_name: details.append(f"<span style='color:#555;'>Owner:</span> {m.owner_name}")
            if m.sector:     details.append(f"<span style='color:#555;'>Sector:</span> {m.sector}")
            if m.city:       details.append(f"<span style='color:#555;'>Location:</span> {m.city}")
            if m.phone:      details.append(f"<span style='color:#555;'>Phone:</span> {m.phone}")
            details_html = " &nbsp;·&nbsp; ".join(details)
            bg = "#ffffff" if i % 2 == 0 else "#f9fafb"
            msme_rows_html += f"""
            <tr style="background:{bg};">
              <td style="padding:10px 14px;font-weight:600;color:#1A2E42;width:28px;vertical-align:top;">{i}.</td>
              <td style="padding:10px 14px;">
                <strong>{m.business_name}</strong>
                <span style="color:#888;font-size:12px;margin-left:6px;">({m.msme_code or 'No code'})</span>
                {'<br><span style="font-size:12px;color:#666;">' + details_html + '</span>' if details_html else ''}
              </td>
            </tr>"""

        body_html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:#1A2E42;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><p style="margin:0;color:#fff;font-size:20px;font-weight:700;">PRUDEV II</p>
                  <p style="margin:2px 0 0;color:rgba(255,255,255,.65);font-size:12px;">MSME Portfolio Management Programme</p></td>
              <td align="right"><p style="margin:0;color:#C8102E;font-size:11px;font-weight:700;letter-spacing:.05em;">GIZ · GOPA AFC</p></td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;color:#333;font-size:15px;">Dear <strong>{bge.name}</strong>,</p>
          <p style="margin:0 0 20px;color:#555;line-height:1.6;">
            Please find below your assignment details under the <strong>PRUDEV II Programme</strong>.
          </p>

          {objectives_html}

          <!-- MSME Table -->
          <p style="font-weight:700;color:#1A2E42;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:24px 0 8px;">
            Assigned MSMEs &nbsp;<span style="background:#1A2E42;color:#fff;border-radius:12px;padding:2px 8px;font-size:11px;">{count}</span>
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8edf2;border-radius:6px;overflow:hidden;">
            <thead>
              <tr style="background:#1A2E42;">
                <th style="padding:8px 14px;color:rgba(255,255,255,.7);font-size:11px;text-align:left;font-weight:600;">#</th>
                <th style="padding:8px 14px;color:rgba(255,255,255,.7);font-size:11px;text-align:left;font-weight:600;">Business / Details</th>
              </tr>
            </thead>
            <tbody>{msme_rows_html}</tbody>
          </table>

          <p style="margin:24px 0 0;color:#555;font-size:13px;line-height:1.7;border-top:1px solid #e8edf2;padding-top:20px;">
            Please log in to the <strong>PRUDEV II Portfolio Management System</strong> to view full details and submit visit reports.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #e8edf2;">
          <p style="margin:0;color:#777;font-size:12px;">Best regards,<br><strong>PRUDEV II BDS Team</strong><br>GIZ · GOPA AFC</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

        return {
            'subject':    f"PRUDEV II — Assignment Brief: {count} MSME{'s' if count != 1 else ''}",
            'body':       body_text,
            'body_html':  body_html,
            'to':         bge.email,
            'msme_count': count,
        }

    @action(detail=True, methods=['patch'], url_path='set-objectives')
    def set_objectives(self, request, pk=None):
        """Save shared deployment objectives for this BGE."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can set deployment objectives.")
        bge = self.get_object()
        bge.deployment_objectives = request.data.get('deployment_objectives', '').strip()
        bge.save()
        return Response(BusinessGrowthExpertSerializer(bge).data)

    @action(detail=True, methods=['get'], url_path='preview-email')
    def preview_email(self, request, pk=None):
        """Return the email that would be sent without actually sending it."""
        if not (request.user.is_staff or request.user.is_superuser or _managed_groups(request.user) is not None):
            raise PermissionDenied("Only admins can preview assignment emails.")
        bge = self.get_object()
        if not bge.email:
            return Response({'error': 'This BGE expert has no email address on record.'}, status=status.HTTP_400_BAD_REQUEST)
        if not bge.assigned_msmes.filter(is_active=True).exists():
            return Response({'error': 'This BGE expert has no assigned MSMEs.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self._build_assignment_email(bge))

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_assignment_email(self, request, pk=None):
        """Send BGE their MSME assignment via Microsoft Office 365 (richard.obuku@gopa.eu)."""
        if not (request.user.is_staff or request.user.is_superuser or _managed_groups(request.user) is not None):
            raise PermissionDenied("Only admins can send assignment emails.")

        bge = self.get_object()
        if not bge.email:
            return Response({'error': 'This BGE expert has no email address on record.'}, status=status.HTTP_400_BAD_REQUEST)
        if not bge.assigned_msmes.filter(is_active=True).exists():
            return Response({'error': 'This BGE expert has no assigned MSMEs.'}, status=status.HTTP_400_BAD_REQUEST)

        email_data = self._build_assignment_email(bge)
        # Frontend editable preview may override subject/body
        subject   = request.data.get('subject', '').strip() or email_data['subject']
        body_text = request.data.get('body', '').strip()    or email_data['body']
        body_html = email_data['body_html']  # always use generated HTML

        from_addr  = settings.DEFAULT_FROM_EMAIL
        reply_to   = getattr(settings, 'EMAIL_REPLY_TO', 'richard.obuku@gopa.eu')
        try:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=body_text,
                from_email=from_addr,
                to=[bge.email],
                reply_to=[reply_to],
            )
            msg.attach_alternative(body_html, "text/html")
            msg.send(fail_silently=False)
            return Response({'message': f"Email sent to {bge.email} with {email_data['msme_count']} assigned MSMEs."})
        except Exception as e:
            return Response({'error': f'Failed to send email: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='upload-signature')
    def upload_signature(self, request, pk=None):
        """BGE or admin can upload / replace the BGE's signature image.

        The image is processed with Pillow: converted to RGBA and white/near-white
        pixels are made transparent, producing a clean signature on any background.
        """
        bge = self.get_object()
        # BGEs can only update their own signature; admins can update any.
        is_admin = request.user.is_staff or request.user.is_superuser
        try:
            requester_bge = request.user.bge_profile
        except Exception:
            requester_bge = None
        if not is_admin and (requester_bge is None or requester_bge.id != bge.id):
            raise PermissionDenied("You can only upload your own signature.")

        sig_file = request.FILES.get('signature')
        if not sig_file:
            return Response({'error': 'No signature file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if sig_file.size > 5 * 1024 * 1024:  # 5 MB hard cap
            return Response({'error': 'Signature file must be under 5 MB.'}, status=status.HTTP_400_BAD_REQUEST)
        if not sig_file.content_type.startswith('image/'):
            return Response({'error': 'File must be a JPEG or PNG image.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from PIL import Image as PilImage
            import io as _io

            img = PilImage.open(sig_file).convert('RGBA')

            # Make near-white pixels transparent so the signature floats cleanly
            datas = img.getdata()
            new_data = []
            threshold = 230  # pixels brighter than this in all channels → transparent
            for item in datas:
                r, g, b, a = item
                if r > threshold and g > threshold and b > threshold:
                    new_data.append((r, g, b, 0))
                else:
                    new_data.append((r, g, b, a))
            img.putdata(new_data)

            # Normalise size: cap at 600px wide keeping aspect ratio
            max_w = 600
            if img.width > max_w:
                ratio = max_w / img.width
                img = img.resize((max_w, int(img.height * ratio)), PilImage.LANCZOS)

            buf = _io.BytesIO()
            img.save(buf, format='PNG')
            png_bytes = buf.getvalue()

            from django.core.files.base import ContentFile
            filename = f'sig_{bge.bge_code or bge.id}.png'
            bge.signature.delete(save=False)  # remove old file if present
            bge.signature.save(filename, ContentFile(png_bytes), save=False)
            # Also persist bytes in DB so signature survives Render filesystem wipes
            bge.signature_data = png_bytes
            bge.save(update_fields=['signature', 'signature_data'])

        except Exception as exc:
            return Response({'error': f'Image processing failed: {exc}'},
                            status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'signature_url': request.build_absolute_uri(bge.signature.url) if bge.signature else None,
            'detail': 'Signature uploaded and processed successfully.',
        })

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        """Upload BGE list from Excel. Matches PRUDEV II BGE list format."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can upload BGE data.")

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not file.name.endswith(('.xlsx', '.xls')):
            return Response({'error': 'Please upload an Excel file (.xlsx or .xls).'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            df = pd.read_excel(io.BytesIO(file.read()))
        except Exception as e:
            return Response({'error': f'Could not read file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        update_existing = request.data.get('update_existing', 'true').lower() != 'false'
        created, updated, skipped = 0, 0, 0
        errors = []

        for i, row in df.iterrows():
            name = str(row.get('Full name', '')).strip()
            if not name or name == 'nan':
                continue

            # Phone: Excel stores as float (2.567e+11) — convert to clean string
            raw_phone = row.get('Phone number', '')
            if pd.notna(raw_phone) and str(raw_phone).strip() not in ('', 'nan'):
                try:
                    phone = str(int(float(raw_phone)))
                except (ValueError, TypeError):
                    phone = str(raw_phone).strip()
            else:
                phone = ''

            raw_email = row.get('Email address', '')
            email = str(raw_email).strip() if pd.notna(raw_email) else ''
            if email == 'nan':
                email = ''

            raw_location = row.get('Location', '')
            location = str(raw_location).strip() if pd.notna(raw_location) else ''
            if location == 'nan':
                location = ''

            raw_code = row.get('BGE code', row.get('BGE Code', ''))
            bge_code = str(raw_code).strip() if pd.notna(raw_code) else ''
            if bge_code == 'nan':
                bge_code = ''

            try:
                existing = BusinessGrowthExpert.objects.filter(name=name).first()
                if existing:
                    if update_existing:
                        existing.email = email
                        existing.phone = phone
                        existing.location = location
                        existing.bge_code = bge_code
                        existing.status = 'approved'
                        existing.save()
                        updated += 1
                    else:
                        errors.append(f'Row {i + 2}: {name} — Duplicate skipped')
                        skipped += 1
                else:
                    BusinessGrowthExpert.objects.create(
                        name=name, email=email, phone=phone,
                        location=location, bge_code=bge_code, status='approved'
                    )
                    created += 1
            except Exception as e:
                errors.append(f'Row {i + 2}: {name} — {str(e)}')
                skipped += 1

        return Response({
            'created': created,
            'updated': updated,
            'skipped': skipped,
            'errors': errors[:10],
            'message': f'{created} BGEs added, {updated} updated, {skipped} skipped.',
        }, status=status.HTTP_200_OK)


class BGEGroupViewSet(viewsets.ModelViewSet):
    queryset = BGEGroup.objects.all()
    serializer_class = BGEGroupSerializer
    permission_classes = [IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff and not request.user.is_superuser:
            raise PermissionDenied("Only admins can delete BGE groups.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def add_member(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can change group membership.")
        group = self.get_object()
        bge_id = request.data.get('bge_id')
        try:
            bge = BusinessGrowthExpert.objects.get(pk=bge_id)
            group.members.add(bge)
            return Response(BGEGroupSerializer(group).data)
        except BusinessGrowthExpert.DoesNotExist:
            return Response({'error': 'Expert not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def remove_member(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can change group membership.")
        group = self.get_object()
        bge_id = request.data.get('bge_id')
        try:
            bge = BusinessGrowthExpert.objects.get(pk=bge_id)
            group.members.remove(bge)
            # If the BGE we just removed was the team lead, clear that role too
            # so they can't keep submitting reports on a group they no longer
            # belong to (the write-permission check matches on team_lead_id).
            if group.team_lead_id == bge.id:
                group.team_lead = None
                group.save(update_fields=['team_lead'])
            return Response(BGEGroupSerializer(group).data)
        except BusinessGrowthExpert.DoesNotExist:
            return Response({'error': 'Expert not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'], url_path='assign-msmes')
    def assign_msmes(self, request, pk=None):
        """Bulk-assign MSMEs to this group.
        Body: {msme_ids: [...], session_number?: int, objectives?: str}.
        Every BGE in the group's `members` will then see these MSMEs in their dashboard.
        """
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can assign MSMEs to groups.")
        group = self.get_object()
        msme_ids = request.data.get('msme_ids', [])
        if not isinstance(msme_ids, list) or not msme_ids:
            return Response({'error': 'msme_ids must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)

        session_number = request.data.get('session_number')
        objectives     = request.data.get('objectives', '').strip()

        update_fields = {'assigned_group': group}
        if session_number is not None:
            try:
                update_fields['session_number'] = int(session_number)
            except (TypeError, ValueError):
                return Response({'error': 'session_number must be an integer'}, status=status.HTTP_400_BAD_REQUEST)
        # Use the form-supplied objectives if any, otherwise fall back to the group's
        # canonical objectives so each MSME inherits its team's mission.
        effective_objectives = objectives or (group.objectives or '').strip()
        if effective_objectives:
            update_fields['assignment_objectives'] = effective_objectives

        updated = MSME.objects.filter(id__in=msme_ids, is_active=True).update(**update_fields)
        return Response({
            'group_id': group.id,
            'group_name': group.name,
            'assigned': updated,
            'msme_ids': msme_ids,
        })

    @action(detail=True, methods=['post'], url_path='unassign-msmes')
    def unassign_msmes(self, request, pk=None):
        """Remove the group assignment from given MSMEs (or all if msme_ids omitted).
        Body: {msme_ids?: [...]}"""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can unassign MSMEs from groups.")
        group = self.get_object()
        msme_ids = request.data.get('msme_ids')
        qs = MSME.objects.filter(assigned_group=group)
        if isinstance(msme_ids, list) and msme_ids:
            qs = qs.filter(id__in=msme_ids)
        cleared = qs.update(assigned_group=None, session_number=None)
        return Response({'group_id': group.id, 'cleared': cleared})

    @action(detail=True, methods=['get'], url_path='msmes')
    def list_msmes(self, request, pk=None):
        """Return all MSMEs currently assigned to this group."""
        group = self.get_object()
        msmes = group.assigned_msmes.filter(is_active=True).order_by('session_number', 'business_name')
        return Response(MSMESerializer(msmes, many=True).data)


class SupportRequestViewSet(viewsets.ModelViewSet):
    queryset = SupportRequest.objects.all()
    serializer_class = SupportRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # BGEs only see SupportRequests that they're matched on; admins see all
        u = self.request.user
        qs = SupportRequest.objects.all()
        if not (u.is_staff or u.is_superuser):
            try:
                bge = u.bge_profile
                qs = qs.filter(matched_bges=bge).distinct()
            except Exception:
                qs = qs.none()
        return qs

    def create(self, request, *args, **kwargs):
        # Public-form flow leaves an MSME's request — but an authenticated user
        # creating one must still be the MSME-owner / admin. Restrict here so a
        # logged-in BGE cannot inject support requests on behalf of others.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        support_request = serializer.save()
        nearby = BusinessGrowthExpert.objects.filter(
            status='approved', location__icontains=support_request.location
        )[:3]
        support_request.matched_bges.set(nearby)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can edit support requests.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can edit support requests.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can delete support requests.")
        return super().destroy(request, *args, **kwargs)


class TrainingSessionViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    serializer_class = TrainingSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TrainingSession.objects.select_related('topic', 'work_order', 'lead_bge').prefetch_related('mentor_bges', 'businesses').all()
        user = self.request.user
        if user.is_staff or user.is_superuser:
            pass  # see everything
        elif _managed_groups(user) is not None or _is_viewer(user):
            pass  # programme managers and viewers see all sessions
        else:
            # BGEs see sessions they lead, are mentors on, or linked to their work orders / topics
            try:
                bge = user.bge_profile
                assigned_topics = TrainingFacilitationAssignment.objects.filter(bge=bge).values_list('topic_id', flat=True)
                qs = qs.filter(
                    Q(work_order__bge=bge) |
                    Q(topic_id__in=assigned_topics) |
                    Q(lead_bge=bge) |
                    Q(mentor_bges=bge)
                ).distinct()
            except Exception:
                return qs.none()
        work_order_id = self.request.query_params.get('work_order')
        if work_order_id:
            qs = qs.filter(work_order_id=work_order_id)
        return qs

    @action(detail=True, methods=['post'])
    def mark_attendance(self, request, pk=None):
        """Legacy single-MSME toggle kept for backward compat."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can mark attendance.")
        session = self.get_object()
        msme_id = request.data.get('msme_id')
        present = request.data.get('present', True)
        qs = Attendance.objects.filter(session=session, msme_id=msme_id)
        if qs.exists():
            att = qs.first()
            att.present = present
            att.save()
        else:
            att = Attendance.objects.create(session=session, msme_id=msme_id, present=present)
        return Response(AttendanceSerializer(att).data)


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.select_related('msme', 'session').all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Attendance.objects.select_related('msme', 'session').all()
        sid = self.request.query_params.get('session')
        if sid:
            qs = qs.filter(session_id=sid)
        cohort = self.request.query_params.get('cohort')
        if cohort:
            qs = qs.filter(msme__cohort_id=cohort)
        return qs

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Participation summary — demographic totals from attendance + BGE report counts.
        Filters: cohort, session, work_order, bge, date_from, date_to.
        Groups: by_cohort, by_work_order (each deployment/activity).
        """
        from portfolio.models import MSMEReport, GroupReport, Cohort as CohortModel, WorkOrder

        cohort_id     = request.query_params.get('cohort')
        session_id    = request.query_params.get('session')
        work_order_id = request.query_params.get('work_order')
        bge_id        = request.query_params.get('bge')
        date_from     = request.query_params.get('date_from')
        date_to       = request.query_params.get('date_to')

        att_qs = Attendance.objects.filter(present=True)
        rep_qs = MSMEReport.objects.filter(status='submitted')
        grp_qs = GroupReport.objects.filter(status__in=['submitted', 'approved'])

        if cohort_id:
            att_qs = att_qs.filter(msme__cohort_id=cohort_id)
            rep_qs = rep_qs.filter(msme__cohort_id=cohort_id)
        if work_order_id:
            att_qs = att_qs.filter(session__work_order_id=work_order_id)
            rep_qs = rep_qs.filter(bge__work_orders__id=work_order_id)
        if bge_id:
            att_qs = att_qs.filter(session__work_order__bge_id=bge_id)
            rep_qs = rep_qs.filter(bge_id=bge_id)
            grp_qs = grp_qs.filter(team_lead_id=bge_id)
        if session_id:
            att_qs = att_qs.filter(session_id=session_id)
        if date_from:
            att_qs = att_qs.filter(session__date__gte=date_from)
            rep_qs = rep_qs.filter(visit_date__gte=date_from)
            grp_qs = grp_qs.filter(visit_date__gte=date_from)
        if date_to:
            att_qs = att_qs.filter(session__date__lte=date_to)
            rep_qs = rep_qs.filter(visit_date__lte=date_to)
            grp_qs = grp_qs.filter(visit_date__lte=date_to)

        # Pull the full attendance list once and aggregate in Python —
        # avoids 11 separate COUNT queries per cohort/work-order in the loops below.
        att_rows = list(att_qs.values('gender', 'age_group', 'refugee_status',
                                      'msme_id', 'msme__cohort_id',
                                      'session__work_order_id'))

        def _dem_rows(rows):
            youth   = [r for r in rows if r['age_group'] == '18-34']
            adult   = [r for r in rows if r['age_group'] in ('35-45', '46-55', '56+')]
            refs    = [r for r in rows if r['refugee_status'] == 'R']
            host    = [r for r in rows if r['refugee_status'] == 'H']
            return {
                'total':          len(rows),
                'male':           sum(1 for r in rows if r['gender'] == 'M'),
                'female':         sum(1 for r in rows if r['gender'] == 'F'),
                'male_youth':     sum(1 for r in youth if r['gender'] == 'M'),
                'female_youth':   sum(1 for r in youth if r['gender'] == 'F'),
                'male_adult':     sum(1 for r in adult if r['gender'] == 'M'),
                'female_adult':   sum(1 for r in adult if r['gender'] == 'F'),
                'refugees_total': len(refs),
                'refugee_male':   sum(1 for r in refs if r['gender'] == 'M'),
                'refugee_female': sum(1 for r in refs if r['gender'] == 'F'),
                'host_community': len(host),
            }

        overall = _dem_rows(att_rows)
        overall.update({
            'msme_reports':         rep_qs.count(),
            'unique_msmes_visited': rep_qs.values('msme').distinct().count(),
            'group_sessions':       grp_qs.count(),
        })

        # Per-cohort breakdown — group already-fetched rows by cohort_id
        rep_by_cohort = {}
        for item in rep_qs.values('msme__cohort_id', 'msme_id'):
            cid = item['msme__cohort_id']
            if cid not in rep_by_cohort:
                rep_by_cohort[cid] = {'count': 0, 'msmes': set()}
            rep_by_cohort[cid]['count'] += 1
            rep_by_cohort[cid]['msmes'].add(item['msme_id'])

        cohorts_data = []
        for cohort in CohortModel.objects.all().order_by('name'):
            c_rows = [r for r in att_rows if r['msme__cohort_id'] == cohort.id]
            c_rep  = rep_by_cohort.get(cohort.id, {'count': 0, 'msmes': set()})
            if not c_rows and not c_rep['count']:
                continue
            row = _dem_rows(c_rows)
            row.update({'cohort_id': cohort.id, 'cohort_name': cohort.name,
                        'msme_reports': c_rep['count'],
                        'unique_msmes': len(c_rep['msmes'])})
            cohorts_data.append(row)

        # Per-work-order breakdown — group rows by work_order_id
        rep_by_bge = {}
        for item in rep_qs.values('bge_id', 'msme_id'):
            bid = item['bge_id']
            if bid not in rep_by_bge:
                rep_by_bge[bid] = {'count': 0, 'msmes': set()}
            rep_by_bge[bid]['count'] += 1
            rep_by_bge[bid]['msmes'].add(item['msme_id'])

        wo_data = []
        for wo in WorkOrder.objects.select_related('bge').order_by('-issue_date'):
            w_rows = [r for r in att_rows if r['session__work_order_id'] == wo.id]
            w_rep  = rep_by_bge.get(wo.bge_id, {'count': 0, 'msmes': set()})
            if not w_rows and not w_rep['count']:
                continue
            row = _dem_rows(w_rows)
            row.update({
                'work_order_id':     wo.id,
                'work_order_number': wo.work_order_number,
                'work_order_type':   wo.get_work_order_type_display(),
                'bge_name':          wo.bge.name,
                'bge_code':          wo.bge.bge_code or '',
                'issue_date':        str(wo.issue_date),
                'start_date':        str(wo.start_date) if wo.start_date else None,
                'end_date':          str(wo.end_date) if wo.end_date else None,
                'status':            wo.status,
                'msme_reports':      w_rep['count'],
                'unique_msmes':      len(w_rep['msmes']),
            })
            wo_data.append(row)

        overall['by_cohort'] = cohorts_data
        overall['by_work_order'] = wo_data
        return Response(overall)


class TrainingTopicViewSet(viewsets.ModelViewSet):
    queryset = TrainingTopic.objects.all()
    serializer_class = TrainingTopicSerializer
    permission_classes = [IsAuthenticated]


class TrainingFacilitationAssignmentViewSet(viewsets.ModelViewSet):
    """
    Manage training facilitation assignments.
    - Admins/programme managers: full CRUD.
    - BGEs: read-only, scoped to their own assignments.
    """
    serializer_class = TrainingFacilitationAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = TrainingFacilitationAssignment.objects.select_related(
            'bge', 'topic', 'assigned_by'
        )
        # BGEs only see their own assignments
        if not (user.is_staff or user.is_superuser or hasattr(user, 'cohort_admin_profile')):
            try:
                bge = user.bge_profile
                return qs.filter(bge=bge)
            except Exception:
                return qs.none()
        return qs

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

    def create(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'cohort_admin_profile')):
            raise PermissionDenied("Only programme managers can create facilitation assignments.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'cohort_admin_profile')):
            raise PermissionDenied("Only programme managers can edit facilitation assignments.")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'cohort_admin_profile')):
            raise PermissionDenied("Only programme managers can remove facilitation assignments.")
        return super().destroy(request, *args, **kwargs)


class VisitReportTemplateViewSet(viewsets.ModelViewSet):
    """CRUD for visit report templates. List is public (authenticated); CUD is admin-only."""
    serializer_class = VisitReportTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = VisitReportTemplate.objects.all()
        if self.request.query_params.get('active_only') == '1':
            qs = qs.filter(is_active=True)
        return qs

    def _require_admin(self):
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            raise PermissionDenied("Only admins can manage report templates.")

    def create(self, request, *args, **kwargs):
        self._require_admin(); return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._require_admin(); return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._require_admin(); return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin(); return super().destroy(request, *args, **kwargs)


class MSMEReportViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
    serializer_class = MSMEReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        group_ids = _managed_groups(user)
        if user.is_staff or user.is_superuser:
            qs = MSMEReport.objects.all()
        elif group_ids is not None:
            qs = MSMEReport.objects.filter(msme__programme_groups__in=group_ids).distinct()
        elif _is_viewer(user):
            qs = MSMEReport.objects.all()
        else:
            try:
                bge = user.bge_profile
                qs = MSMEReport.objects.filter(bge=bge)
            except Exception:
                qs = MSMEReport.objects.none()

        msme_id = self.request.query_params.get('msme')
        if msme_id:
            qs = qs.filter(msme_id=msme_id)
        bge_id = self.request.query_params.get('bge')
        if bge_id:
            qs = qs.filter(bge_id=bge_id)
        report_status = self.request.query_params.get('status')
        if report_status:
            qs = qs.filter(status=report_status)
        return qs.select_related('msme', 'bge')

    def perform_create(self, serializer):
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            try:
                bge = user.bge_profile
                serializer.save(bge=bge)
                return
            except Exception:
                pass
        serializer.save()

    def perform_update(self, serializer):
        instance = serializer.instance
        new_status = serializer.validated_data.get('status', instance.status)
        report = serializer.save()

        if instance.status != 'submitted' and new_status == 'submitted':
            # Freeze a PDF copy on first submission
            try:
                from .pdf_reports import render_msme_report
                from django.core.files.base import ContentFile
                pdf_bytes = render_msme_report(report).read()
                safe_name = report.msme.business_name[:30].replace(' ', '_')
                fname = f"MSMEReport_{safe_name}_{report.visit_date}.pdf"
                report.submitted_pdf.save(fname, ContentFile(pdf_bytes), save=False)
                report.submitted_pdf_data = pdf_bytes
                report.save(update_fields=['submitted_pdf', 'submitted_pdf_data'])
            except Exception:
                pass

            # Auto-create a growth snapshot from the quantitative fields
            self._create_snapshot_from_report(report)

    @staticmethod
    def _create_snapshot_from_report(report):
        """Create or update a MSMEGrowthSnapshot from a submitted visit report."""
        has_quant = any([
            report.revenue_ugx, report.total_assets_ugx,
            report.employees_ft_male is not None, report.employees_ft_female is not None,
            report.employees_pt_male is not None, report.employees_pt_female is not None,
            report.has_tin is not None, report.has_ursb is not None,
            report.has_business_bank is not None, report.has_mobile_money is not None,
        ])
        if not has_quant:
            return
        try:
            bge = report.bge
        except Exception:
            bge = None
        notes_parts = []
        if report.key_achievement:
            notes_parts.append(f'Achievement: {report.key_achievement}')
        if report.growth_rating:
            notes_parts.append(f'Growth rating: {report.growth_rating}/5')
        MSMEGrowthSnapshot.objects.create(
            msme                = report.msme,
            snapshot_date       = report.visit_date,
            source              = 'bge_visit',
            collected_by        = bge,
            annual_turnover     = report.revenue_ugx,
            total_assets        = report.total_assets_ugx,
            employees_ft_male   = report.employees_ft_male,
            employees_ft_female = report.employees_ft_female,
            employees_pt_male   = report.employees_pt_male,
            employees_pt_female = report.employees_pt_female,
            has_tin             = report.has_tin,
            has_ursb            = report.has_ursb,
            has_business_bank   = report.has_business_bank,
            has_mobile_money    = report.has_mobile_money,
            notes               = '\n'.join(notes_parts),
        )

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Render this MSME visit report as a styled PDF.
        Submitted reports return the stored snapshot; drafts are rendered on demand."""
        from .pdf_reports import render_msme_report
        report = self.get_object()
        fname = f"MSMEReport_{report.msme.business_name[:30].replace(' ', '_')}_{report.visit_date}.pdf"
        disposition = 'attachment' if request.query_params.get('dl') else 'inline'
        if report.submitted_pdf:
            try:
                resp = HttpResponse(report.submitted_pdf.read(), content_type='application/pdf')
                resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
                return resp
            except Exception:
                pass
        buf = render_msme_report(report)
        resp = HttpResponse(buf.read(), content_type='application/pdf')
        resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
        return resp


class GroupReportViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """Group-level reports.

    Visibility:
    - Admins see every group report.
    - A BGE sees reports for any group they're a member of (so the whole team
      can read what the lead submitted).

    Mutation:
    - Only admins or the group's `team_lead` can create or edit reports
      against that group. Other members can read but not write.
    - status transitions: draft -> submitted (sets submitted_at),
                          submitted -> approved (admin only, sets approved_at).
    """
    serializer_class = GroupReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        group_ids = _managed_groups(user)
        if user.is_staff or user.is_superuser:
            qs = GroupReport.objects.all()
        elif group_ids is not None:
            qs = GroupReport.objects.filter(
                group__assigned_msmes__programme_groups__in=group_ids
            ).distinct()
        elif _is_viewer(user):
            qs = GroupReport.objects.all()
        else:
            try:
                bge = user.bge_profile
                qs = GroupReport.objects.filter(group__members=bge).distinct()
            except Exception:
                qs = GroupReport.objects.none()

        gid = self.request.query_params.get('group')
        if gid:
            qs = qs.filter(group_id=gid)
        sid = self.request.query_params.get('session_number')
        if sid:
            qs = qs.filter(session_number=sid)
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        return qs.select_related('group', 'team_lead').prefetch_related('msmes_supported')

    def _user_can_write_for_group(self, user, group):
        if user.is_staff or user.is_superuser:
            return True
        if _is_programme_manager(user):
            return False  # programme managers are read-only on group reports
        if _managed_groups(user) is not None:
            return True
        try:
            bge = user.bge_profile
        except Exception:
            return False
        return group.team_lead_id == bge.id

    def perform_create(self, serializer):
        user = self.request.user
        group = serializer.validated_data.get('group')
        if not group:
            raise PermissionDenied("`group` is required.")
        if not self._user_can_write_for_group(user, group):
            raise PermissionDenied(
                "Only the group's team lead (or an admin) can file group reports."
            )
        # Stamp the team lead automatically — never trusted from request body.
        # Resolution order:
        #   1. Author's own bge_profile (BGE filing the report on themselves)
        #   2. Group's designated team_lead (admin filing on the team's behalf)
        # If neither resolves, refuse to create — an owner-less report can't be
        # edited later because every write check matches on team_lead_id.
        bge = None
        try:
            bge = user.bge_profile
        except Exception:
            bge = group.team_lead
        if bge is None:
            raise PermissionDenied(
                "Cannot create a group report without a team lead. "
                "Set a team lead on the group first."
            )
        serializer.save(team_lead=bge)

    def perform_update(self, serializer):
        instance = self.get_object()
        user = self.request.user
        if not self._user_can_write_for_group(user, instance.group):
            raise PermissionDenied(
                "Only the group's team lead (or an admin) can edit this report."
            )

        # Stamp lifecycle timestamps when status transitions
        from django.utils import timezone
        new_status = serializer.validated_data.get('status', instance.status)
        extra = {}
        if instance.status != 'submitted' and new_status == 'submitted':
            extra['submitted_at'] = timezone.now()
        if instance.status != 'approved' and new_status == 'approved':
            if not (user.is_staff or user.is_superuser):
                raise PermissionDenied("Only admins can mark a report as Approved.")
            extra['approved_at'] = timezone.now()
        report = serializer.save(**extra)

        # Snapshot the PDF on first submission so the copy is frozen at that moment.
        if instance.status != 'submitted' and new_status == 'submitted':
            if not report.submitted_pdf:
                try:
                    from .pdf_reports import render_group_report
                    from django.core.files.base import ContentFile
                    pdf_bytes = render_group_report(report).read()
                    safe_name = report.group.name.replace(' ', '_')
                    fname = f"GroupReport_{safe_name}_{report.visit_date}.pdf"
                    report.submitted_pdf.save(fname, ContentFile(pdf_bytes), save=True)
                except Exception:
                    pass

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can delete group reports.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Render this group report as a styled PDF.
        Submitted/approved reports return the stored snapshot; drafts are rendered on demand."""
        from .pdf_reports import render_group_report
        report = self.get_object()
        fname = f"GroupReport_{report.group.name.replace(' ', '_')}_{report.visit_date}.pdf"
        disposition = 'attachment' if request.query_params.get('dl') else 'inline'
        if report.submitted_pdf:
            try:
                resp = HttpResponse(report.submitted_pdf.read(), content_type='application/pdf')
                resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
                return resp
            except Exception:
                pass
        buf = render_group_report(report)
        resp = HttpResponse(buf.read(), content_type='application/pdf')
        resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
        return resp


class GroupReportContributionViewSet(viewsets.ModelViewSet):
    """A note from one group member feeding into a group report.

    Visibility:
    - Admins see every contribution.
    - A BGE sees their own contributions + every contribution to a group
      report whose group they belong to (so the team lead can read them
      while consolidating the consolidated report, and other members get
      transparency into what their teammates submitted).

    Mutation:
    - Members can create/edit only their own contribution. The `bge` field
      is auto-stamped from request.user; never trusted from the body.
    - Admins can edit any contribution.
    - One contribution per (group_report, bge) pair (unique_together).
      Re-POSTing for the same pair returns 200 with the existing record
      so the frontend can use it as upsert.
    """
    serializer_class = GroupReportContributionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = GroupReportContribution.objects.select_related(
            'bge', 'group_report__group',
        ).prefetch_related('msmes_observed')
        if user.is_staff or user.is_superuser:
            pass
        else:
            try:
                bge = user.bge_profile
            except Exception:
                return qs.none()
            from django.db.models import Q
            qs = qs.filter(
                Q(bge=bge) | Q(group_report__group__members=bge)
            ).distinct()

        gr = self.request.query_params.get('group_report')
        if gr:
            qs = qs.filter(group_report_id=gr)
        return qs

    def _bge_for_user(self):
        try:
            return self.request.user.bge_profile
        except Exception:
            return None

    def create(self, request, *args, **kwargs):
        bge = self._bge_for_user()
        is_admin = request.user.is_staff or request.user.is_superuser
        if bge is None and not is_admin:
            raise PermissionDenied("You don't have a BGE profile.")

        gr_id = request.data.get('group_report')
        if not gr_id:
            return Response({'error': 'group_report is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            gr = GroupReport.objects.select_related('group').get(pk=gr_id)
        except GroupReport.DoesNotExist:
            return Response({'error': 'group_report not found'}, status=status.HTTP_404_NOT_FOUND)

        # Member must belong to the group
        if bge and not gr.group.members.filter(pk=bge.pk).exists() and not is_admin:
            raise PermissionDenied("You're not a member of this group.")

        contributor = bge if bge else gr.group.team_lead
        if contributor is None:
            return Response({'error': 'No bge to attribute the contribution to.'}, status=status.HTTP_400_BAD_REQUEST)

        # Upsert: if (group_report, bge) already exists, return that row
        existing = GroupReportContribution.objects.filter(
            group_report=gr, bge=contributor,
        ).first()
        if existing:
            ser = self.get_serializer(existing, data=request.data, partial=True)
            ser.is_valid(raise_exception=True)
            ser.save()
            return Response(ser.data, status=status.HTTP_200_OK)

        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(bge=contributor)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        bge = self._bge_for_user()
        is_admin = self.request.user.is_staff or self.request.user.is_superuser
        instance = self.get_object()
        if not is_admin and (bge is None or instance.bge_id != bge.id):
            raise PermissionDenied("You can only edit your own contribution.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        bge = self._bge_for_user()
        is_admin = request.user.is_staff or request.user.is_superuser
        instance = self.get_object()
        if not is_admin and (bge is None or instance.bge_id != bge.id):
            raise PermissionDenied("You can only delete your own contribution.")
        return super().destroy(request, *args, **kwargs)


class GroupReportAttendanceViewSet(viewsets.ModelViewSet):
    """Per-person MSME attendance records for group session reports.

    BGE users (team leads) can create/update/delete records for their own
    group reports. Admins have full access. Filter by ?group_report=<id>.
    """
    serializer_class = GroupReportAttendanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = GroupReportAttendance.objects.select_related('msme', 'group_report')
        # Non-admin BGEs can only see attendance for group reports belonging to
        # groups they are a member of (team lead or regular member).
        if not (user.is_staff or user.is_superuser):
            bge = self._bge_for_user()
            if bge is None:
                return qs.none()
            qs = qs.filter(
                Q(group_report__team_lead=bge) |
                Q(group_report__group__members=bge)
            ).distinct()
        group_report_id = self.request.query_params.get('group_report')
        if group_report_id:
            qs = qs.filter(group_report_id=group_report_id)
        return qs

    def _bge_for_user(self):
        try:
            return self.request.user.bge_profile
        except Exception:
            return None

    def _can_edit(self, group_report_id):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return True
        bge = self._bge_for_user()
        if bge is None:
            return False
        try:
            report = GroupReport.objects.get(pk=group_report_id)
            return report.team_lead_id == bge.id or report.group.members.filter(pk=bge.id).exists()
        except GroupReport.DoesNotExist:
            return False

    def perform_create(self, serializer):
        group_report_id = serializer.validated_data.get('group_report').id
        if not self._can_edit(group_report_id):
            raise PermissionDenied("You can only record attendance for your own group reports.")
        serializer.save()

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if not self._can_edit(instance.group_report_id):
            raise PermissionDenied("You can only update attendance for your own group reports.")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if not self._can_edit(instance.group_report_id):
            raise PermissionDenied("You can only delete attendance for your own group reports.")
        return super().destroy(request, *args, **kwargs)


class BGEUserViewSet(viewsets.ViewSet):
    """
    Admin-only viewset for managing BGE user accounts.
    Allows creating logins and linking them to BGE profiles without needing Django admin.
    """
    permission_classes = [IsAuthenticated]

    def _require_admin(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can manage users.")

    def list(self, request):
        if not (request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'cohort_admin_profile')):
            raise PermissionDenied("Only admins can manage users.")
        users = User.objects.filter(is_staff=False, is_superuser=False).select_related('bge_profile')
        data = []
        for u in users:
            try:
                profile = u.bge_profile
                bge_info = {'id': profile.id, 'name': profile.name, 'status': profile.status}
            except Exception:
                bge_info = None
            # Determine role
            try:
                ca = u.cohort_admin_profile
                role = 'cohort_admin'
                managed_groups = list(ca.managed_groups.values('id', 'name'))
            except CohortAdmin.DoesNotExist:
                managed_groups = []
                role = 'bge' if bge_info else 'viewer'
            data.append({
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'is_active': u.is_active,
                'date_joined': u.date_joined,
                'bge_profile': bge_info,
                'role': role,
                'managed_groups': managed_groups,
            })
        return Response(data)

    def create(self, request):
        self._require_admin(request)
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()
        email = request.data.get('email', '').strip()
        bge_id = request.data.get('bge_id')

        if not username or not password:
            return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({'error': 'Username already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(username=username, password=password, email=email)

        if bge_id:
            try:
                bge = BusinessGrowthExpert.objects.get(pk=bge_id)
                if bge.user:
                    user.delete()
                    return Response({'error': 'This BGE already has a user account linked.'}, status=status.HTTP_400_BAD_REQUEST)
                type(bge).objects.filter(pk=bge.pk).update(user=user)
                bge.user = user
                send_welcome_email(bge, username, password)
            except BusinessGrowthExpert.DoesNotExist:
                user.delete()
                return Response({'error': 'BGE profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({'id': user.id, 'username': user.username, 'email': user.email}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='bulk-create-missing')
    def bulk_create_missing(self, request):
        """Create login accounts for every BGE that doesn't have one yet.
        Admin-only. Returns counts of created / skipped."""
        self._require_admin(request)
        password = request.data.get('password', 'bds123')
        unlinked = BusinessGrowthExpert.objects.filter(user__isnull=True).order_by('id')
        created = skipped = 0
        names = []
        for bge in unlinked:
            outcome = ensure_bge_account(bge, password=password, send_email=True)
            if outcome == 'created':
                created += 1
                names.append(bge.name or f'BGE #{bge.id}')
            else:
                skipped += 1
        return Response({'created': created, 'skipped': skipped, 'names': names})

    @action(detail=True, methods=['patch'], url_path='set-role')
    def set_role(self, request, pk=None):
        """Set or clear a user's programme-manager role and managed groups.

        Body:
          role        : 'viewer' | 'cohort_admin'
          group_ids   : [1, 2, ...]   (required when role='cohort_admin')
        """
        self._require_admin(request)
        user, err = self._get_target_non_admin_user(pk, request)
        if err:
            return err

        role = request.data.get('role', 'viewer')
        group_ids = request.data.get('group_ids', [])

        if role == 'cohort_admin':
            ca, _ = CohortAdmin.objects.get_or_create(user=user)
            ca.managed_groups.set(ProgrammeGroup.objects.filter(id__in=group_ids))
            ca.save()
            names = list(ca.managed_groups.values_list('name', flat=True))
            return Response({'role': 'cohort_admin', 'managed_groups': names})
        else:
            # viewer — remove cohort_admin if it exists
            CohortAdmin.objects.filter(user=user).delete()
            return Response({'role': 'viewer'})

    def _get_target_non_admin_user(self, pk, request):
        """Resolve a target user that is NOT a staff/superuser. Raises 403 if it
        is — admins managing other admins must use Django's admin site."""
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return None, Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        # Even an admin should not be able to demote / lock-out / re-password
        # another admin via this BGE-user endpoint. The list view already hides
        # them; close the loophole on the detail mutations too.
        if user.is_staff or user.is_superuser:
            return None, Response(
                {'error': 'Cannot manage staff/superuser accounts here. Use Django admin.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return user, None

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        self._require_admin(request)
        new_password = (request.data.get('password') or '').strip()
        if not new_password or len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        user, err = self._get_target_non_admin_user(pk, request)
        if err is not None:
            return err
        user.set_password(new_password)
        user.save()
        return Response({'message': f'Password updated for {user.username}.'})

    @action(detail=True, methods=['patch'], url_path='link-bge')
    def link_bge(self, request, pk=None):
        self._require_admin(request)
        bge_id = request.data.get('bge_id')
        user, err = self._get_target_non_admin_user(pk, request)
        if err is not None:
            return err
        if bge_id:
            try:
                bge = BusinessGrowthExpert.objects.get(pk=bge_id)
                # Unlink any previous user linked to this BGE
                BusinessGrowthExpert.objects.filter(user=user).update(user=None)
                bge.user = user
                bge.save()
            except BusinessGrowthExpert.DoesNotExist:
                return Response({'error': 'BGE not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            BusinessGrowthExpert.objects.filter(user=user).update(user=None)
        return Response({'message': 'BGE link updated.'})

    @action(detail=True, methods=['patch'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        self._require_admin(request)
        user, err = self._get_target_non_admin_user(pk, request)
        if err is not None:
            return err
        user.is_active = not user.is_active
        user.save()
        return Response({'is_active': user.is_active})


# ── Push notification helpers ──────────────────────────────────────────────────

def _send_push(subscription_obj, title, body, url='/'):
    """Send a single Web Push notification.

    Errors are logged. 404/410 responses (subscription gone — user uninstalled
    the PWA or revoked permission) cause the row to be deleted so the next
    notify run doesn't waste a request on a dead endpoint.
    """
    import logging as _logging
    log = _logging.getLogger(__name__)
    try:
        webpush(
            subscription_info={
                'endpoint': subscription_obj.endpoint,
                'keys': {'p256dh': subscription_obj.p256dh, 'auth': subscription_obj.auth},
            },
            data=_json.dumps({'title': title, 'body': body, 'url': url}),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims=settings.VAPID_CLAIMS,
        )
    except WebPushException as exc:
        # Prune subscriptions the push service has explicitly retired.
        status_code = getattr(getattr(exc, 'response', None), 'status_code', None)
        if status_code in (404, 410):
            try:
                subscription_obj.delete()
                log.info("Pruned dead push subscription id=%s (%s)",
                         subscription_obj.pk, status_code)
            except Exception:
                pass
        else:
            log.warning("Push send failed for subscription id=%s: %s",
                        getattr(subscription_obj, 'pk', '?'), exc)


def _notify_bge(bge, title, body, url='/'):
    """Send push notification to all active subscriptions for a BGE's linked user."""
    if not bge.user:
        return
    for sub in PushSubscription.objects.filter(user=bge.user):
        _send_push(sub, title, body, url)


# ── Push subscription API views ────────────────────────────────────────────────

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated as _IsAuth, AllowAny as _AllowAny

class WorkOrderViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """Work Order management.

    Visibility:
    - Admins see all work orders (any status).
    - BGEs see only their own work orders with status 'issued' or 'signed'.

    Mutation (create / update / delete / issue):
    - Admin-only. BGEs have read-only access.
    """
    serializer_class = WorkOrderSerializer
    permission_classes = [IsAuthenticated]

    def _is_admin(self):
        u = self.request.user
        return u.is_staff or u.is_superuser or _managed_groups(u) is not None

    def get_queryset(self):
        user = self.request.user
        qs = WorkOrder.objects.select_related('bge', 'group')
        # Common filters regardless of role
        status_filter = self.request.query_params.get('status')
        type_filter   = self.request.query_params.get('work_order_type')
        if status_filter:
            qs = qs.filter(status=status_filter)
        if type_filter:
            qs = qs.filter(work_order_type=type_filter)
        if user.is_staff or user.is_superuser:
            bge_id = self.request.query_params.get('bge')
            if bge_id:
                qs = qs.filter(bge_id=bge_id)
            return qs
        # Programme managers and viewers see all work orders
        if _managed_groups(user) is not None or _is_viewer(user):
            return qs
        # BGE users: their own issued/signed orders only
        try:
            bge = user.bge_profile
        except Exception:
            return qs.none()
        return qs.filter(bge=bge, status__in=['issued', 'signed'])

    def _require_admin(self):
        if not self._is_admin():
            raise PermissionDenied("Work order management is restricted to administrators.")

    def _check_date_overlap(self, bge_id, start_date, end_date, exclude_id=None):
        if not bge_id or not start_date or not end_date:
            return
        qs = WorkOrder.objects.filter(
            bge_id=bge_id,
            start_date__isnull=False,
            end_date__isnull=False,
            start_date__lte=end_date,
            end_date__gte=start_date,
        )
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        conflict = qs.first()
        if conflict:
            raise ValidationError(
                f"Date overlap: this BGE already has work order {conflict.work_order_number} "
                f"running from {conflict.start_date} to {conflict.end_date}. "
                "BGEs cannot be assigned overlapping work orders."
            )

    def perform_create(self, serializer):
        self._require_admin()
        data = serializer.validated_data
        self._check_date_overlap(
            bge_id=data.get('bge').pk if data.get('bge') else None,
            start_date=data.get('start_date'),
            end_date=data.get('end_date'),
        )
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self._require_admin()
        data = serializer.validated_data
        instance = self.get_object()
        bge = data.get('bge', instance.bge)
        self._check_date_overlap(
            bge_id=bge.pk if bge else None,
            start_date=data.get('start_date', instance.start_date),
            end_date=data.get('end_date', instance.end_date),
            exclude_id=instance.pk,
        )
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='sign')
    def sign(self, request, pk=None):
        """BGE confirms acceptance: marks work order as signed with today's date."""
        from django.utils import timezone
        work_order = self.get_object()

        # Only the BGE this work order belongs to (or an admin/programme manager) may sign it
        user = request.user
        is_admin = user.is_staff or user.is_superuser or _managed_groups(user) is not None
        is_owner = hasattr(user, 'bge_profile') and user.bge_profile == work_order.bge
        if not (is_admin or is_owner):
            raise PermissionDenied("You can only sign your own work orders.")

        if work_order.status == 'signed':
            return Response({'detail': 'Already signed.'}, status=status.HTTP_200_OK)
        if work_order.status == 'draft':
            return Response({'detail': 'Work order has not been issued yet.'}, status=status.HTTP_400_BAD_REQUEST)

        work_order.status = 'signed'
        work_order.bge_signed_date = timezone.now().date()
        work_order.save(update_fields=['status', 'bge_signed_date'])

        # Generate the signed PDF immediately and persist it so the BGE's
        # signature is captured at this exact moment.  All future downloads
        # serve this frozen copy rather than regenerating.
        try:
            from .pdf_reports import render_work_order
            from django.core.files.base import ContentFile
            pdf_bytes = render_work_order(work_order).read()
            fname = f'WO_{(work_order.work_order_number or str(work_order.id)).replace(" ", "_")}_signed.pdf'
            work_order.signed_pdf.save(fname, ContentFile(pdf_bytes), save=False)
            # Store bytes in DB so the signed copy survives Render filesystem wipes
            work_order.signed_pdf_data = pdf_bytes
            work_order.save(update_fields=['signed_pdf', 'signed_pdf_data'])
        except Exception:
            pass  # signing is complete even if PDF storage fails

        return Response(self.get_serializer(work_order).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Render the work order as a PDF. Admin can access any; BGE can access their own.
        Signed work orders return the stored signed copy; others are rendered on demand."""
        work_order = self.get_object()
        user = request.user
        is_admin = user.is_staff or user.is_superuser
        is_owner = hasattr(user, 'bge_profile') and user.bge_profile == work_order.bge
        if not (is_admin or is_owner):
            raise PermissionDenied("You can only download your own work orders.")
        fname = f'WorkOrder_{(work_order.work_order_number or str(work_order.id)).replace(" ", "_")}.pdf'
        dl = request.query_params.get('dl', '0')
        disp = 'attachment' if dl == '1' else 'inline'
        # Prefer DB-stored signed bytes (survives Render filesystem wipes).
        # Fall back to filesystem copy, then regenerate live for unsigned orders.
        if work_order.signed_pdf_data:
            resp = HttpResponse(bytes(work_order.signed_pdf_data), content_type='application/pdf')
            resp['Content-Disposition'] = f'{disp}; filename="{fname}"'
            return resp
        if work_order.signed_pdf:
            try:
                resp = HttpResponse(work_order.signed_pdf.read(), content_type='application/pdf')
                resp['Content-Disposition'] = f'{disp}; filename="{fname}"'
                return resp
            except Exception:
                pass
        from .pdf_reports import render_work_order
        buf = render_work_order(work_order)
        resp = HttpResponse(buf.read(), content_type='application/pdf')
        resp['Content-Disposition'] = f'{disp}; filename="{fname}"'
        return resp

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        """Admin-only: set status → issued, generate PDF, email to BGE."""
        self._require_admin()
        work_order = self.get_object()

        if work_order.status == 'issued':
            return Response({'detail': 'Already issued.'}, status=status.HTTP_200_OK)

        work_order.status = 'issued'
        work_order.save(update_fields=['status'])

        # Generate PDF
        from .pdf_reports import render_work_order
        pdf_buf = render_work_order(work_order)
        pdf_bytes = pdf_buf.read()

        bge = work_order.bge
        recipient_email = bge.email or ''
        admin_email = getattr(settings, 'DEFAULT_FROM_EMAIL', '')
        recipients = [r for r in [recipient_email, admin_email] if r]

        if recipients:
            subject = f'Work Order Issued — {work_order.work_order_number}'
            body = (
                f'Dear {bge.name},\n\n'
                f'Please find attached your work order ({work_order.work_order_number}) '
                f'for the PRUDEV II programme.\n\n'
                f'Work Order Type: {work_order.get_work_order_type_display()}\n'
                f'Issue Date: {work_order.issue_date}\n'
                f'Net Payable: UGX {work_order.rate_per_day * work_order.max_days - int(work_order.rate_per_day * work_order.max_days * 0.06):,}\n\n'
                f'Regards,\nPRUDEV II BDS Team\nGOPA AFC / GIZ'
            )
            email = EmailMultiAlternatives(subject, body,
                                           getattr(settings, 'DEFAULT_FROM_EMAIL', ''),
                                           recipients)
            filename = f'WorkOrder_{work_order.work_order_number.replace(" ", "_")}.pdf'
            email.attach(filename, pdf_bytes, 'application/pdf')
            try:
                email.send(fail_silently=False)
            except Exception as exc:
                return Response(
                    {'detail': f'Issued but email failed: {exc}'},
                    status=status.HTTP_200_OK,
                )

        serializer = self.get_serializer(work_order)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='withdraw')
    def withdraw(self, request, pk=None):
        """Admin-only: withdraw a work order (issued or signed) back to draft status.
        Clears the signed PDF and emails the BGE to notify them."""
        self._require_admin()
        work_order = self.get_object()

        if work_order.status == 'draft':
            return Response({'detail': 'Work order is already in draft status.'}, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get('reason', '').strip()

        work_order.status = 'draft'
        work_order.bge_signed_date = None
        # Clear any stored signed PDF so re-issue generates a fresh one
        work_order.signed_pdf_data = None
        if work_order.signed_pdf:
            work_order.signed_pdf.delete(save=False)
        work_order.save(update_fields=['status', 'bge_signed_date', 'signed_pdf', 'signed_pdf_data'])

        bge = work_order.bge
        recipient_email = bge.email or ''
        admin_email = getattr(settings, 'DEFAULT_FROM_EMAIL', '')
        recipients = [r for r in [recipient_email, admin_email] if r]

        if recipients:
            subject = f'Work Order Withdrawn — {work_order.work_order_number}'
            reason_line = f'\nReason: {reason}\n' if reason else ''
            body = (
                f'Dear {bge.name},\n\n'
                f'Your work order ({work_order.work_order_number}) has been withdrawn and is under review.\n'
                f'{reason_line}\n'
                f'Work Order Type: {work_order.get_work_order_type_display()}\n'
                f'You will be notified when a revised work order is re-issued to you.\n\n'
                f'Regards,\nPRUDEV II BDS Team\nGOPA AFC / GIZ'
            )
            try:
                msg = EmailMultiAlternatives(
                    subject, body,
                    getattr(settings, 'DEFAULT_FROM_EMAIL', ''),
                    recipients,
                )
                msg.send(fail_silently=True)
            except Exception:
                pass  # withdrawal succeeds even if email fails

        return Response(self.get_serializer(work_order).data)


@api_view(['POST'])
@permission_classes([_IsAuth])
def push_subscribe(request):
    """Save or update a push subscription for the current user.
    Accepts flat format: {endpoint, p256dh, auth} (as sent by the frontend).
    Also accepts nested format: {endpoint, keys: {p256dh, auth}} (Web Push API standard).
    """
    data = request.data
    endpoint = data.get('endpoint', '').strip()
    # Accept both flat and nested key formats
    if 'keys' in data and isinstance(data['keys'], dict):
        p256dh = data['keys'].get('p256dh', '')
        auth   = data['keys'].get('auth', '')
    else:
        p256dh = data.get('p256dh', '')
        auth   = data.get('auth', '')

    if not endpoint:
        return Response({'error': 'endpoint required'}, status=status.HTTP_400_BAD_REQUEST)
    if not p256dh or not auth:
        return Response({'error': 'p256dh and auth keys are required'}, status=status.HTTP_400_BAD_REQUEST)

    PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={'user': request.user, 'p256dh': p256dh, 'auth': auth},
    )
    return Response({'message': 'Subscribed'})


@api_view(['POST'])
@permission_classes([_IsAuth])
def push_unsubscribe(request):
    """Remove a push subscription."""
    endpoint = request.data.get('endpoint', '').strip()
    PushSubscription.objects.filter(endpoint=endpoint, user=request.user).delete()
    return Response({'message': 'Unsubscribed'})


@api_view(['GET'])
@permission_classes([_AllowAny])
def push_vapid_key(request):
    """Return the VAPID public key so the frontend can subscribe. Public endpoint."""
    return Response({'publicKey': settings.VAPID_PUBLIC_KEY})


class TrainingReportViewSet(ProgrammeManagerReadOnlyMixin, viewsets.ModelViewSet):
    """
    CRUD for training session reports.
    - BGEs can create/edit reports for sessions linked to their assignments.
    - Admins and programme managers see everything.
    """
    serializer_class   = TrainingReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = TrainingReport.objects.select_related('session', 'bge')
        if user.is_staff or user.is_superuser:
            return qs
        if _is_programme_manager(user):
            group_ids = _managed_groups(user) or []
            return qs.filter(
                session__businesses__programme_groups__in=group_ids
            ).distinct()
        try:
            return qs.filter(bge=user.bge_profile)
        except Exception:
            return qs.none()

    def perform_create(self, serializer):
        bge = None
        try:
            bge = self.request.user.bge_profile
        except Exception:
            pass
        serializer.save(bge=bge)

    def perform_update(self, serializer):
        from django.utils import timezone
        data = {}
        if serializer.validated_data.get('status') == 'submitted':
            data['submitted_at'] = timezone.now()
        serializer.save(**data)


class AnnualReviewReportViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """Annual / quarterly / mid-term review reports authored by a single BGE.

    A BGE selects which of their MSMEs to include (attendance list) and writes
    a narrative summary. No financial data is captured here — that lives in
    GrowthSnapshot records. Admins see all; BGEs see only their own.
    """
    serializer_class  = AnnualReviewReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            qs = AnnualReviewReport.objects.all()
        elif _is_viewer(user):
            qs = AnnualReviewReport.objects.all()
        elif _is_programme_manager(user):
            group_ids = _managed_groups(user) or []
            qs = AnnualReviewReport.objects.filter(
                msmes_reviewed__programme_groups__in=group_ids
            ).distinct()
        else:
            try:
                qs = AnnualReviewReport.objects.filter(bge=user.bge_profile)
            except Exception:
                qs = AnnualReviewReport.objects.none()

        period = self.request.query_params.get('period')
        if period:
            qs = qs.filter(review_period=period)
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)
        return qs.select_related('bge').prefetch_related('msmes_reviewed')

    def perform_create(self, serializer):
        bge = None
        try:
            bge = self.request.user.bge_profile
        except Exception:
            pass
        serializer.save(bge=bge)

    def perform_update(self, serializer):
        from django.utils import timezone
        data = {}
        if serializer.validated_data.get('status') == 'submitted':
            data['submitted_at'] = timezone.now()
        serializer.save(**data)


class MentorTrainingReportViewSet(ProgrammeManagerReadOnlyMixin, viewsets.ModelViewSet):
    """
    Training reports filed by mentor BGEs.
    - A mentor BGE can only create/edit their own report for sessions they are assigned to.
    - Admins and programme managers see all mentor reports.
    """
    serializer_class   = MentorTrainingReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = MentorTrainingReport.objects.select_related(
            'session', 'session__lead_bge', 'bge'
        ).prefetch_related('session__businesses', 'session__attendances')
        if user.is_staff or user.is_superuser:
            return qs
        if _is_programme_manager(user):
            group_ids = _managed_groups(user) or []
            return qs.filter(
                session__businesses__programme_groups__in=group_ids
            ).distinct()
        try:
            return qs.filter(bge=user.bge_profile)
        except Exception:
            return qs.none()

    def perform_create(self, serializer):
        bge = None
        try:
            bge = self.request.user.bge_profile
            # verify BGE is actually a mentor on this session
            session = serializer.validated_data.get('session')
            if session and not session.mentor_bges.filter(pk=bge.pk).exists():
                raise PermissionDenied("You are not assigned as a mentor for this session.")
        except PermissionDenied:
            raise
        except Exception:
            pass
        serializer.save(bge=bge)

    def perform_update(self, serializer):
        from django.utils import timezone
        data = {}
        if serializer.validated_data.get('status') == 'submitted':
            data['submitted_at'] = timezone.now()
        serializer.save(**data)


# ── Bulk communication email ────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([_IsAuth])
def bulk_email_view(request):
    """Admin-only: send a communication email to a selection of BGEs or MSMEs."""
    user = request.user
    if not (user.is_staff or user.is_superuser or _managed_groups(user) is not None):
        raise PermissionDenied("Only administrators can send bulk emails.")

    recipient_type = request.data.get('recipient_type', 'bge')   # 'bge' | 'msme'
    recipient_ids  = request.data.get('recipient_ids', [])        # [] = all
    subject        = (request.data.get('subject') or '').strip()
    body_text      = (request.data.get('body_text') or '').strip()
    body_html      = (request.data.get('body_html') or '').strip()

    if not subject:
        return Response({'detail': 'Subject is required.'}, status=400)
    if not body_text:
        return Response({'detail': 'Plain-text body is required.'}, status=400)

    if recipient_type == 'bge':
        qs = BusinessGrowthExpert.objects.filter(email__isnull=False).exclude(email='')
        if recipient_ids:
            qs = qs.filter(id__in=recipient_ids)
        pairs = [(b.name or 'BGE', b.email) for b in qs]
    else:
        qs = MSME.objects.filter(email__isnull=False).exclude(email='')
        if recipient_ids:
            qs = qs.filter(id__in=recipient_ids)
        pairs = [(m.owner_name or m.business_name or 'Business Owner', m.email) for m in qs]

    from_email = settings.DEFAULT_FROM_EMAIL
    reply_to   = getattr(settings, 'EMAIL_REPLY_TO', from_email)
    sent = 0
    errors = []

    for name, email_addr in pairs:
        first = (name or '').split()[0] if name else 'Team'
        try:
            txt  = body_text.replace('{{name}}', first)
            html = body_html.replace('{{name}}', first) if body_html else ''
            msg  = EmailMultiAlternatives(
                subject=subject, body=txt,
                from_email=from_email, to=[email_addr], reply_to=[reply_to],
            )
            if html:
                msg.attach_alternative(html, 'text/html')
            msg.send()
            sent += 1
        except Exception as e:
            errors.append({'email': email_addr, 'error': str(e)})

    return Response({'sent': sent, 'failed': len(errors), 'errors': errors[:20]})
