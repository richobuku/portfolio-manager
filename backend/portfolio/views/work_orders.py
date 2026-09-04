import logging
import os
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone

# Plain admin email address (for BCC/CC on outgoing WO emails).
# ADMIN_EMAIL is set in Render env vars and is a bare address like foo@bar.com.
# We deliberately do NOT use DEFAULT_FROM_EMAIL here — that is the formatted
# "Name <addr>" sender string, not a valid inbound recipient address.
_ADMIN_NOTIFY_EMAIL = os.environ.get('ADMIN_EMAIL', '').strip()

from ..models import WorkOrder, WorkOrderSubmission, WorkOrderPayment, WorkOrderAttachment
from ..serializers import (
    WorkOrderSerializer, WorkOrderSubmissionSerializer, WorkOrderPaymentSerializer,
    WorkOrderAttachmentSerializer,
)
from .mixins import (
    ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin,
    _managed_groups, _is_viewer, _safe_filename,
)

logger = logging.getLogger(__name__)


class WorkOrderViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """Work Order management.

    Visibility:
    - Admins see all work orders (any status).
    - BGEs see only their own work orders with status 'issued' or 'signed'.

    Mutation:
    - Create / update: admins AND Programme Managers.
    - Delete / issue / withdraw: admins only.
    - BGEs and viewers have read-only access.
    """
    serializer_class = WorkOrderSerializer
    permission_classes = [IsAuthenticated]

    def _is_admin(self):
        u = self.request.user
        return u.is_staff or u.is_superuser

    def _can_manage_wo(self):
        """Admins AND Programme Managers can create/edit work orders."""
        u = self.request.user
        return u.is_staff or u.is_superuser or _managed_groups(u) is not None

    def _require_admin_or_pm(self):
        if not self._can_manage_wo():
            raise PermissionDenied("Work order management requires administrator or Programme Manager access.")

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
        self._require_admin_or_pm()
        data = serializer.validated_data
        if not self.request.data.get('allow_overlap'):
            self._check_date_overlap(
                bge_id=data.get('bge').pk if data.get('bge') else None,
                start_date=data.get('start_date'),
                end_date=data.get('end_date'),
            )
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self._require_admin_or_pm()
        data = serializer.validated_data
        instance = self.get_object()
        bge = data.get('bge', instance.bge)
        if not self.request.data.get('allow_overlap'):
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

    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        """Create the same work order content for multiple BGEs in one request.

        POST body: all normal work order fields, PLUS:
          bge_ids    list[int]   required — BGE IDs to create WOs for
          allow_overlap bool     optional — skip date-overlap check (default False)

        Returns:
          created       int             how many WOs were created
          work_orders   list[WOdata]    serialized created WOs
          errors        list[{bge_id, bge, error}]  per-BGE failures
        """
        self._require_admin_or_pm()

        bge_ids = request.data.get('bge_ids', [])
        if not bge_ids or not isinstance(bge_ids, list):
            raise ValidationError("bge_ids must be a non-empty list of BGE IDs.")

        allow_overlap = request.data.get('allow_overlap', False)
        created_data = []
        errors = []

        # Build the shared field payload (everything except bge_ids)
        shared_fields = {k: v for k, v in request.data.items() if k not in ('bge_ids', 'allow_overlap')}

        for bge_id in bge_ids:
            per_bge_data = {**shared_fields, 'bge': bge_id}
            serializer = self.get_serializer(data=per_bge_data)
            try:
                serializer.is_valid(raise_exception=True)
                if not allow_overlap:
                    d = serializer.validated_data
                    self._check_date_overlap(
                        bge_id=d.get('bge').pk if d.get('bge') else None,
                        start_date=d.get('start_date'),
                        end_date=d.get('end_date'),
                    )
                serializer.save(created_by=request.user)
                created_data.append(serializer.data)
            except Exception as exc:
                from ..models import BusinessGrowthExpert as _BGE
                try:
                    bge_name = _BGE.objects.get(pk=bge_id).name
                except Exception:
                    bge_name = f'BGE #{bge_id}'
                detail = getattr(exc, 'detail', None)
                if detail is None:
                    detail = str(exc)
                elif hasattr(detail, 'items'):
                    detail = '; '.join(f'{k}: {v}' for k, v in detail.items())
                else:
                    detail = str(detail)
                errors.append({'bge_id': bge_id, 'bge': bge_name, 'error': detail})

        resp_status = status.HTTP_201_CREATED if created_data else status.HTTP_400_BAD_REQUEST
        return Response({
            'created': len(created_data),
            'work_orders': created_data,
            'errors': errors,
        }, status=resp_status)

    @action(detail=True, methods=['post'], url_path='sign')
    def sign(self, request, pk=None):
        """BGE confirms acceptance: marks work order as signed with today's date."""
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
            from ..pdf_reports import render_work_order
            from django.core.files.base import ContentFile
            pdf_bytes = render_work_order(work_order).read()
            fname = f'WO_{(work_order.work_order_number or str(work_order.id)).replace(" ", "_")}_signed.pdf'
            work_order.signed_pdf.save(fname, ContentFile(pdf_bytes), save=False)
            # Store bytes in DB so the signed copy survives Render filesystem wipes
            work_order.signed_pdf_data = pdf_bytes
            work_order.save(update_fields=['signed_pdf', 'signed_pdf_data'])
        except Exception as e:
            logger.error('Failed to store signed work order PDF (wo id=%s): %s', work_order.id, e)
            # Signing is complete; PDF storage failure is non-fatal

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
        fname = _safe_filename(f'WorkOrder_{(work_order.work_order_number or str(work_order.id)).replace(" ", "_")}.pdf')
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
        from ..pdf_reports import render_work_order
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
        # Snapshot the BGE's current MSME assignments so co-deployment overlap
        # can be detected even after MSMEs are later re-assigned to other BGEs.
        bge_msme_ids = list(
            work_order.bge.assigned_msmes.values_list('id', flat=True)
        )
        work_order.msme_ids_snapshot = bge_msme_ids
        work_order.save(update_fields=['status', 'msme_ids_snapshot'])

        # Generate PDF
        from ..pdf_reports import render_work_order
        pdf_buf = render_work_order(work_order)
        pdf_bytes = pdf_buf.read()

        bge = work_order.bge
        recipient_email = bge.email or ''
        admin_email = _ADMIN_NOTIFY_EMAIL
        recipients = [r for r in [recipient_email, admin_email] if r]

        if recipients:
            # Check for other BGEs with overlapping date ranges AND shared MSMEs
            co_text = ''
            if work_order.start_date and work_order.end_date:
                from ..models import WorkOrder as _WO2
                from .bge import BusinessGrowthExpertViewSet
                overlapping = _WO2.objects.filter(
                    status__in=['issued', 'signed'],
                    start_date__lte=work_order.end_date,
                    end_date__gte=work_order.start_date,
                ).exclude(bge=bge).exclude(id=work_order.id).select_related('bge')
                # Union snapshot with current (handles both new and legacy work orders)
                my_set = set(bge_msme_ids) | BusinessGrowthExpertViewSet._bge_all_msme_ids(bge)
                aa_lines = []
                seen_bges = set()
                for owo in overlapping:
                    if owo.bge_id in seen_bges:
                        continue
                    other_current = BusinessGrowthExpertViewSet._bge_all_msme_ids(owo.bge)
                    other_ids = set(owo.msme_ids_snapshot or []) | other_current
                    if not (my_set & other_ids):
                        continue  # no shared MSMEs — skip
                    seen_bges.add(owo.bge_id)
                    obj = (owo.objective or owo.bge.deployment_objectives or '').strip()
                    snippet = (obj[:250] + '…') if len(obj) > 250 else obj
                    aa_lines.append(
                        f"  BGE:        {owo.bge.name} ({owo.bge.bge_code or 'No code'})"
                        + (f"\n  Work Order: {owo.work_order_number}")
                        + (f"\n  Phone:      {owo.bge.phone}" if owo.bge.phone else '')
                        + (f"\n  Objectives: {snippet}" if snippet else '')
                    )
                if aa_lines:
                    co_text = (
                        "\n\nPLEASE NOTE — ANOTHER BGE ALREADY ASSIGNED\n"
                        + "─" * 40 + "\n"
                        + "Another BGE has already been assigned to work with some of the same "
                        + "MSMEs during this period. Please coordinate accordingly:\n\n"
                        + "\n\n".join(aa_lines)
                    )

            subject = f'Work Order Issued — {work_order.work_order_number}'
            body = (
                f'Dear {bge.name},\n\n'
                f'Please find attached your work order ({work_order.work_order_number}) '
                f'for the PRUDEV II programme.\n\n'
                f'Work Order Type: {work_order.get_work_order_type_display()}\n'
                f'Issue Date: {work_order.issue_date}\n'
                f'Period: {work_order.start_date or "TBD"} to {work_order.end_date or "TBD"}\n'
                f'Net Payable: UGX {work_order.rate_per_day * work_order.max_days - int(work_order.rate_per_day * work_order.max_days * 0.06):,}\n'
                f'{co_text}\n\n'
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
        admin_email = _ADMIN_NOTIFY_EMAIL
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

    # ── Data-update auto-distribution ─────────────────────────────────────────

    @action(detail=False, methods=['get', 'post'], url_path='auto-create-data-updates')
    def auto_create_data_updates(self, request):
        """
        GET  → preview the proposed distribution (no writes).
        POST → create draft msme_data_update work orders and update assigned_bge.

        Qualifying MSMEs: active, with at least one of:
          - any MSMEReport filed
          - any MSMEGrowthSnapshot recorded
          - diagnostic baseline imported (diag_imported_at set)

        Distribution: round-robin across approved BGEs sorted alphabetically,
        MSMEs sorted by district then business name for geographic clustering.

        POST body (all optional):
          start_date   YYYY-MM-DD   (default: first day of current month)
          end_date     YYYY-MM-DD   (default: last day of current month)
          max_days     int          (default: 4)
          rate_per_day int          (default: 60000)
          update_assignments bool   (default: true — update assigned_bge on MSMEs)
        """
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can create bulk data-update work orders.")

        from ..models import MSME, BusinessGrowthExpert, MSMEGrowthSnapshot
        from django.db.models import Q, Exists, OuterRef
        import datetime, math

        # ── 1. Qualifying MSMEs ────────────────────────────────────────────
        from ..models import MSMEReport as _R, MSMEGrowthSnapshot as _S
        qualifying_qs = (
            MSME.objects.filter(is_active=True)
            .filter(
                Q(reports__isnull=False) |
                Q(growth_snapshots__isnull=False) |
                Q(diag_imported_at__isnull=False)
            )
            .distinct()
            .order_by('district', 'business_name')
        )
        msmes = list(qualifying_qs.values('id', 'business_name', 'district', 'assigned_bge_id'))

        # ── 2. Active BGEs ─────────────────────────────────────────────────
        bges = list(
            BusinessGrowthExpert.objects.filter(status='approved')
            .order_by('name')
            .values('id', 'name', 'bge_code')
        )

        if not bges:
            return Response({'error': 'No approved BGEs found.'}, status=status.HTTP_400_BAD_REQUEST)
        if not msmes:
            return Response({'error': 'No qualifying MSMEs found.'}, status=status.HTTP_400_BAD_REQUEST)

        # ── 3. Round-robin distribution ────────────────────────────────────
        n_bges  = len(bges)
        n_msmes = len(msmes)
        per_bge = math.ceil(n_msmes / n_bges)

        # Build: bge_id → list of msme dicts
        distribution = {b['id']: [] for b in bges}
        for i, msme in enumerate(msmes):
            bge_id = bges[i % n_bges]['id']
            distribution[bge_id].append(msme)

        # ── 4. Preview payload ─────────────────────────────────────────────
        preview_rows = []
        for b in bges:
            assigned = distribution[b['id']]
            preview_rows.append({
                'bge_id':   b['id'],
                'bge_name': b['name'],
                'bge_code': b['bge_code'],
                'count':    len(assigned),
                'msmes':    [{'id': m['id'], 'name': m['business_name'], 'district': m['district']} for m in assigned],
            })

        summary = {
            'total_qualifying_msmes': n_msmes,
            'total_bges':             n_bges,
            'per_bge_target':         per_bge,
            'distribution':           preview_rows,
        }

        if request.method == 'GET':
            return Response(summary)

        # ── 5. POST: create work orders ────────────────────────────────────
        today = timezone.now().date()
        first_of_month = today.replace(day=1)
        # last day of month
        if first_of_month.month == 12:
            last_of_month = first_of_month.replace(year=first_of_month.year + 1, month=1, day=1) - datetime.timedelta(days=1)
        else:
            last_of_month = first_of_month.replace(month=first_of_month.month + 1, day=1) - datetime.timedelta(days=1)

        start_date   = request.data.get('start_date') or str(first_of_month)
        end_date     = request.data.get('end_date')   or str(last_of_month)
        max_days     = int(request.data.get('max_days', 4))
        rate_per_day = int(request.data.get('rate_per_day', 60000))
        update_assign = str(request.data.get('update_assignments', 'true')).lower() != 'false'

        OBJECTIVE = (
            "Conduct data verification and business performance update visits to assigned MSMEs. "
            "Collect current operational and financial data to update the programme's MSME database, "
            "track business growth, and inform ongoing support planning."
        )
        KEY_TASKS = (
            "Visit each assigned MSME and collect updated business data\n"
            "Record current revenue, costs, assets, and liabilities\n"
            "Update employment figures (full-time and part-time, male and female)\n"
            "Document any changes in products, services, or operations\n"
            "Verify and update owner contact information\n"
            "Note challenges or support needs and provide appropriate guidance\n"
            "Submit a completed Data Collection Visit report for each MSME via the Portfolio BDS system"
        )

        created_wos = []
        errors = []

        for b in bges:
            assigned = distribution[b['id']]
            if not assigned:
                continue
            msme_ids = [m['id'] for m in assigned]

            try:
                wo = WorkOrder.objects.create(
                    bge_id           = b['id'],
                    work_order_type  = 'msme_data_update',
                    issue_date       = today,
                    start_date       = start_date,
                    end_date         = end_date,
                    max_days         = max_days,
                    rate_per_day     = rate_per_day,
                    objective        = OBJECTIVE,
                    key_tasks        = KEY_TASKS,
                    msme_ids_snapshot = msme_ids,
                    deliverables_json = [
                        {'task_num': '1', 'description': f'Updated data records for all {len(msme_ids)} assigned MSMEs', 'due_date': end_date},
                        {'task_num': '2', 'description': 'Data Collection Visit report submitted for each MSME', 'due_date': end_date},
                    ],
                    created_by = request.user,
                    status = 'draft',
                )
                created_wos.append({
                    'work_order_id':     wo.id,
                    'work_order_number': wo.work_order_number,
                    'bge_id':            b['id'],
                    'bge_name':          b['name'],
                    'msme_count':        len(msme_ids),
                })

                # Optionally update assigned_bge on MSMEs
                if update_assign:
                    MSME.objects.filter(id__in=msme_ids).update(
                        assigned_bge_id=b['id'],
                        assignment_date=today,
                    )
            except Exception as exc:
                errors.append({'bge': b['name'], 'error': str(exc)})

        return Response({
            'created':  len(created_wos),
            'errors':   errors,
            'work_orders': created_wos,
            'summary':  summary,
        }, status=status.HTTP_201_CREATED)

    # ── Permanent-Assignee Thematic Support Bulk Distribution ─────────────────

    @action(detail=False, methods=['get', 'post'], url_path='auto-create-permanent-assignee-wos')
    def auto_create_permanent_assignee_wos(self, request):
        """
        GET  → preview proposed Permanent Assignee Support work orders for all approved/active BGEs
               with their permanently assigned MSMEs (min 3 visits/month).
        POST → create draft permanent_assignee_support work orders in bulk for all BGEs
               with their assigned MSMEs populated in msme_ids_snapshot.

        POST body (all optional):
          start_date   YYYY-MM-DD   (default: first day of current month)
          end_date     YYYY-MM-DD   (default: last day of current month)
          max_days     int          (default: 12)
          rate_per_day int          (default: 60000)
          allow_empty  bool         (default: false — skip BGEs with 0 assigned MSMEs)
        """
        if not (request.user.is_staff or request.user.is_superuser or _managed_groups(request.user) is not None):
            raise PermissionDenied("Only admins and programme managers can create bulk permanent assignee work orders.")

        from ..models import MSME, BusinessGrowthExpert
        from django.db.models import Q
        import datetime

        # 1. Active / Approved BGEs
        bges = list(
            BusinessGrowthExpert.objects.filter(status__in=['approved', 'active'])
            .order_by('name')
            .values('id', 'name', 'bge_code', 'email', 'phone')
        )

        if not bges:
            return Response({'error': 'No active or approved BGEs found.'}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Map each BGE's assigned MSMEs
        preview_rows = []
        total_assigned_msmes = set()

        for b in bges:
            b_id = b['id']
            msmes = list(
                MSME.objects.filter(
                    Q(assigned_bge_id=b_id) |
                    Q(co_assigned_bges__id=b_id) |
                    Q(assigned_group__members__id=b_id),
                    is_active=True
                )
                .distinct()
                .order_by('district', 'business_name')
                .values('id', 'business_name', 'district', 'owner_name', 'phone')
            )
            for m in msmes:
                total_assigned_msmes.add(m['id'])

            preview_rows.append({
                'bge_id':    b_id,
                'bge_name':  b['name'],
                'bge_code':  b['bge_code'],
                'bge_email': b['email'],
                'bge_phone': b['phone'],
                'count':     len(msmes),
                'msmes':     msmes,
            })

        summary = {
            'total_bges': len(bges),
            'total_assigned_msmes': len(total_assigned_msmes),
            'bges_with_assignees': sum(1 for r in preview_rows if r['count'] > 0),
            'distribution': preview_rows,
        }

        if request.method == 'GET':
            return Response(summary)

        # 3. POST: create work orders
        today = timezone.now().date()
        first_of_month = today.replace(day=1)
        if first_of_month.month == 12:
            last_of_month = first_of_month.replace(year=first_of_month.year + 1, month=1, day=1) - datetime.timedelta(days=1)
        else:
            last_of_month = first_of_month.replace(month=first_of_month.month + 1, day=1) - datetime.timedelta(days=1)

        start_date   = request.data.get('start_date') or str(first_of_month)
        end_date     = request.data.get('end_date')   or str(last_of_month)
        max_days     = int(request.data.get('max_days', 12))
        rate_per_day = int(request.data.get('rate_per_day', 60000))
        allow_empty  = str(request.data.get('allow_empty', 'false')).lower() == 'true'

        OBJECTIVE = (
            "To deliver structured, high-touch thematic business development support to permanently assigned MSMEs "
            "through a minimum of three (3) on-site coaching visits per MSME per month. The assignment focuses on "
            "transforming every visit into measurable business growth by passing 'The Acid Test' (ensuring the enterprise "
            "owner can name and execute at least one concrete operational change per visit), delivering practical on-the-spot "
            "advisory rather than mere diagnosis, driving enterprise formalization (URSB registration and TIN acquisition), "
            "establishing transparent daily financial management and record-keeping (ISM Standard/Pro, One Tap POS, or structured cashbooks), "
            "unlocking revenue opportunities, and anchoring field engagements with professional visit planning and GPS mapping."
        )

        KEY_TASKS = (
            "1. Schedule all monthly visits in advance using the PRUDEV II Visit Planner and synchronize dates with Google Calendar, avoiding scheduling conflicts and unscheduled retrospective logging.\n"
            "2. Conduct a minimum of three (3) physical, on-site coaching visits per calendar month to each permanently assigned MSME. Engagements must strictly take place at the MSME business premises; meeting in town solely to sign timesheets is strictly prohibited.\n"
            "3. Open every visit with a mutually stated purpose agreed with the MSME owner, setting clear, non-administrative expectations for the session.\n"
            "4. Execute structured 'Diagnose AND Advise' coaching during every visit: immediately pair every gap or challenge identified with on-the-spot practical guidance, financial calculation, or operational demonstration.\n"
            "5. Apply 'The Acid Test' at the conclusion of each visit, verifying that the MSME owner can articulate in their own words at least one concrete action they will execute differently starting immediately.\n"
            "6. Close every visit with an agreed, visible next step, ensuring the automated SMS Action Handout is dispatched to the MSME owner's mobile phone upon visit report submission.\n"
            "7. Support enterprise formalization and regulatory compliance: guide and facilitate URSB business registration and URA Tax Identification Number (TIN) acquisition for the entity and proprietor.\n"
            "8. Onboard and entrench daily usage of digital bookkeeping and inventory tools (ISM Standard/Pro, One Tap POS, Zoho, or physical structured cashbooks) to establish transparent business records.\n"
            "9. Drive revenue enhancement, cost control, and operational efficiency: work directly with the proprietor to assess sales channels, customer retention, and expense management.\n"
            "10. Record the enterprise base GPS coordinates ('set my GPS pin') and keep MSME operational statuses (Active, Inactive, Closed, Unreachable) updated in the system for GIZ and Ministry of Trade mapping.\n"
            "11. Proactively discuss the commercial value of advisory services with MSME owners and document any client service fees or cost-sharing contributions generated.\n"
            "12. Submit an individual detailed visit report for every single session in the PRUDEV II portal within 48 hours, alongside client-signed timesheets and photo documentation."
        )

        DELIVERABLES_JSON = [
            {
                'task_num': 1,
                'description': 'Planned Visit Schedule & Calendar Synchronization — Monthly Visit Plan logged in the PRUDEV II Visit Planner and synchronized with Google Calendar covering all permanently assigned MSMEs (min 3 visits/MSME).',
                'due_date': 'Within first 3 days of work order',
                'quantitative_result': '100% of planned visits scheduled in Visit Planner across all assigned MSMEs.',
                'qualitative_result': 'Visit plan is logically sequenced, realistic, and avoids calendar conflicts.',
                'means_of_verification': 'Visit Planner records in PRUDEV II system and Google Calendar sync status.',
                'unit_rate': '',
                'payment_condition': 'Prerequisite milestone for field travel.',
            },
            {
                'task_num': 2,
                'description': 'On-Site Coaching Visits & Field Reports (Min 3 visits/MSME) — Individual field visit reports submitted in PRUDEV II portal for every on-site coaching session (minimum 3 visits per assigned MSME).',
                'due_date': 'Rolling — within 48 hours of each visit',
                'quantitative_result': 'Minimum 3 verified on-site visit reports submitted per assigned MSME.',
                'qualitative_result': 'Every report reflects the 4 Reflection Standards: stated opening purpose, diagnose & advise coaching cues, the Acid Test concrete change, and visible agreed next step. All visits conducted on-premise (no town form-signing).',
                'means_of_verification': 'Approved PRUDEV II visit reports with GPS timestamps and automated SMS Action Handout delivery logs.',
                'unit_rate': '',
                'payment_condition': 'Payable upon verification of minimum 3 visits per MSME.',
            },
            {
                'task_num': 3,
                'description': 'Enterprise Formalization & Compliance Support — Assisting assigned MSMEs with formal business registration applications/certificates (URSB) and Tax Identification Number (TIN) acquisition for the business and proprietors.',
                'due_date': 'Rolling across work order period',
                'quantitative_result': 'Formalization and compliance progress records submitted for assigned MSMEs.',
                'qualitative_result': 'Businesses supported to secure valid URSB certificates, TINs, or formal operating status.',
                'means_of_verification': 'Uploaded URSB certificates, TIN registration slips, or formal application documentation.',
                'unit_rate': '',
                'payment_condition': 'Required milestone deliverable.',
            },
            {
                'task_num': 4,
                'description': 'Digital Tool Adoption & Financial Management — Guiding assigned MSMEs on active daily usage of bookkeeping and sales management tools (ISM Standard/Pro, One Tap POS, Zoho, or structured cashbooks) to establish transparent business records.',
                'due_date': 'Rolling across work order period',
                'quantitative_result': 'Verified digital or structured record-keeping established for 100% of active assigned MSMEs.',
                'qualitative_result': 'Enterprises actively record daily transactions, monitor cash flow, and track sales revenue accurately.',
                'means_of_verification': 'System logs of ISM/POS accounts or photo verification of active structured cashbooks.',
                'unit_rate': '',
                'payment_condition': 'Included in monthly deliverable approval.',
            },
            {
                'task_num': 5,
                'description': 'GPS Base Pinning & SME Operational Status Verification — Base GPS pinned coordinates and operational status verification for all assigned MSMEs to support national BDS mapping.',
                'due_date': 'End of Week 2',
                'quantitative_result': 'Base GPS coordinates recorded and current operational status (Active/Inactive/Closed/Unreachable) verified for 100% of assigned MSMEs.',
                'qualitative_result': 'Coordinates match physical enterprise location; operational status verified by on-site inspection.',
                'means_of_verification': 'System geolocation records and updated SME directory status.',
                'unit_rate': '',
                'payment_condition': 'Required deliverable for GIZ & Ministry of Trade mapping.',
            },
            {
                'task_num': 6,
                'description': 'End-of-Month Performance Summary, Signed Timesheets & Invoices — Consolidated monthly thematic performance report, client-signed timesheets verifying on-premise delivery, BDS service fee records, and approved invoice.',
                'due_date': 'Last working day of the work order month',
                'quantitative_result': '1 comprehensive monthly summary report, 1 client-signed timesheet covering all visits, BDS fee collection summary, and 1 invoice.',
                'qualitative_result': 'Timesheets countersigned on-premise by MSME proprietors; report clearly highlights enterprise revenue/operational progress and BDS commercial value.',
                'means_of_verification': 'Countersigned timesheet, submitted summary report, and approved invoice.',
                'unit_rate': '',
                'payment_condition': 'Final monthly payment processed upon approval by BDS Expert and Team Leader.',
            },
        ]

        created_wos = []
        errors = []

        for row in preview_rows:
            b_id = row['bge_id']
            msme_ids = [m['id'] for m in row['msmes']]
            if not msme_ids and not allow_empty:
                continue

            try:
                wo = WorkOrder.objects.create(
                    bge_id               = b_id,
                    work_order_type      = 'permanent_assignee_support',
                    project_name         = 'Promoting Rural Development II (PRUDEV II)',
                    location             = 'Northern Uganda (Gulu, Lira, Kitgum, Oyam, Omoro, Amuru, Adjumani)',
                    duration             = '1 Month (Min 3 visits/MSME)',
                    issue_date           = today,
                    start_date           = start_date,
                    end_date             = end_date,
                    max_days             = max_days,
                    rate_per_day         = rate_per_day,
                    transport_reimbursed = True,
                    team_leader_name     = 'Stephen Maxi Opwonya',
                    team_leader_position = 'Team Leader',
                    objective            = OBJECTIVE,
                    key_tasks            = KEY_TASKS,
                    deliverables_json    = DELIVERABLES_JSON,
                    msme_ids_snapshot    = msme_ids,
                    created_by           = request.user,
                    status               = 'draft',
                )
                created_wos.append({
                    'work_order_id':     wo.id,
                    'work_order_number': wo.work_order_number,
                    'bge_id':            b_id,
                    'bge_name':          row['bge_name'],
                    'bge_code':          row['bge_code'],
                    'msme_count':        len(msme_ids),
                })
            except Exception as exc:
                errors.append({'bge': row['bge_name'], 'error': str(exc)})

        return Response({
            'created':     len(created_wos),
            'errors':      errors,
            'work_orders': created_wos,
            'summary':     summary,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='submit-for-payment')
    def submit_for_payment(self, request, pk=None):
        """Admin action: Mark a work order as submitted for payment."""
        user = request.user
        if not (user.is_staff or user.is_superuser or _managed_groups(user) is not None):
            raise PermissionDenied("Only admins and programme managers can submit work orders for payment.")

        wo = self.get_object()
        ref = request.data.get('payment_reference', '').strip()
        new_status = request.data.get('payment_status', 'submitted_for_payment')
        notes = request.data.get('payment_notes', '').strip()

        wo.payment_status = new_status
        wo.payment_submitted_at = timezone.now()
        wo.payment_submitted_by = user
        if ref:
            wo.payment_reference = ref
        if notes:
            wo.payment_notes = f"{wo.payment_notes}\n[Payment Notes]: {notes}".strip()
        wo.save(update_fields=['payment_status', 'payment_submitted_at', 'payment_submitted_by', 'payment_reference', 'payment_notes'])

        return Response(self.get_serializer(wo).data)

    @action(detail=True, methods=['post'], url_path='confirm-payment')
    def confirm_payment(self, request, pk=None):
        """BGE action: Confirm receipt of payment against a work order."""
        wo = self.get_object()
        user = request.user
        is_admin = user.is_staff or user.is_superuser or _managed_groups(user) is not None

        if not is_admin:
            try:
                bge = user.bge_profile
                if bge.id != wo.bge_id and not wo.co_bges.filter(id=bge.id).exists():
                    raise PermissionDenied("Only the assigned BGE can confirm payment receipt.")
            except Exception:
                raise PermissionDenied("No BGE profile linked to this account.")

        now = timezone.now()
        wo.payment_status = 'payment_confirmed'
        wo.payment_confirmed_by_bge = True
        wo.payment_confirmed_at = now
        notes = request.data.get('notes', '').strip()
        ref = request.data.get('reference', '').strip()
        if ref:
            wo.payment_reference = f"{wo.payment_reference} (Confirmed Ref: {ref})".strip()
        if notes:
            wo.payment_notes = f"{wo.payment_notes}\n[BGE Confirmation]: {notes}".strip()
        wo.save(update_fields=['payment_status', 'payment_confirmed_by_bge', 'payment_confirmed_at', 'payment_reference', 'payment_notes'])

        # Notify Admin via Email
        notify_email = getattr(settings, 'PAYMENT_CONFIRMATION_NOTIFY_EMAIL', 'richobuku@gmail.com')
        if notify_email:
            try:
                gross = wo.rate_per_day * wo.max_days
                net_amount = gross - int(gross * 0.06)
                subject = f"Payment Confirmed — Work Order {wo.work_order_number} ({wo.bge.name})"
                body = (
                    f"Dear Admin,\n\n"
                    f"BGE {wo.bge.name} has confirmed receipt of payment for Work Order {wo.work_order_number}:\n\n"
                    f"  • BGE: {wo.bge.name} ({wo.bge.bge_code or 'No Code'})\n"
                    f"  • Work Order: {wo.work_order_number}\n"
                    f"  • Type: {wo.get_work_order_type_display()}\n"
                    f"  • Net Amount: UGX {net_amount:,.0f}\n"
                    f"  • Reference: {wo.payment_reference or 'N/A'}\n"
                    f"  • Confirmed At: {now.strftime('%Y-%m-%d %H:%M')}\n"
                    f"{f'  • BGE Remarks: {notes}' if notes else ''}\n\n"
                    f"You can view this work order in the Admin Dashboard under Work Orders.\n\n"
                    f"Regards,\nPRUDEV II BDS Platform"
                )
                msg = EmailMultiAlternatives(
                    subject, body,
                    getattr(settings, 'DEFAULT_FROM_EMAIL', 'richobuku@gmail.com'),
                    [notify_email],
                )
                msg.send(fail_silently=True)
            except Exception as e:
                logger.warning("Failed to send work order payment confirmation email: %s", e)

        return Response(self.get_serializer(wo).data)

    @action(detail=False, methods=['get'], url_path='confirmed-payments')
    def confirmed_payments(self, request):
        """Admin overview endpoint for recent payment confirmations across work orders and reports."""
        user = request.user
        if not (user.is_staff or user.is_superuser or _managed_groups(user) is not None):
            raise PermissionDenied("Only admins and managers can view confirmed payments summary.")

        # Work Orders confirmed
        wo_qs = WorkOrder.objects.filter(payment_confirmed_by_bge=True).select_related('bge').order_by('-payment_confirmed_at')[:20]
        # Reports confirmed
        r_qs = MSMEReport.objects.filter(payment_confirmed_by_bge=True).select_related('msme', 'bge').order_by('-payment_confirmed_at')[:20]
        # Group reports confirmed
        gr_qs = GroupReport.objects.filter(payment_confirmed_by_bge=True).select_related('group', 'team_lead').order_by('-payment_confirmed_at')[:20]

        items = []
        for wo in wo_qs:
            gross = wo.rate_per_day * wo.max_days
            items.append({
                'type': 'work_order',
                'id': wo.id,
                'title': f"Work Order {wo.work_order_number}",
                'bge_name': wo.bge.name,
                'bge_code': wo.bge.bge_code,
                'amount': gross - int(gross * 0.06),
                'reference': wo.payment_reference,
                'confirmed_at': wo.payment_confirmed_at,
            })
        for r in r_qs:
            items.append({
                'type': 'visit_report',
                'id': r.id,
                'title': f"Visit Report — {r.msme.business_name}",
                'bge_name': r.bge.name,
                'bge_code': r.bge.bge_code,
                'amount': None,
                'reference': r.payment_reference,
                'confirmed_at': r.payment_confirmed_at,
            })
        for gr in gr_qs:
            items.append({
                'type': 'group_report',
                'id': gr.id,
                'title': f"Group Report — {gr.group.name}",
                'bge_name': gr.team_lead.name if gr.team_lead else "Team Lead",
                'bge_code': gr.team_lead.bge_code if gr.team_lead else "",
                'amount': None,
                'reference': gr.payment_reference,
                'confirmed_at': gr.payment_confirmed_at,
            })

        items.sort(key=lambda x: x['confirmed_at'] or timezone.now(), reverse=True)
        return Response({'confirmed_payments': items[:30]})


class WorkOrderSubmissionViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """BGE timesheet & invoice (Excel) uploads against a work order.

    BGEs upload for their own work orders (or work orders they're co-assigned
    to). Admins/programme managers/viewers see everything, organised per BGE
    via the ``?bge=`` filter, and can download any file.
    """
    serializer_class = WorkOrderSubmissionSerializer
    permission_classes = [IsAuthenticated]

    ALLOWED_EXTENSIONS = ('.xlsx', '.xls')
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

    def _is_admin(self):
        u = self.request.user
        return u.is_staff or u.is_superuser or _managed_groups(u) is not None

    def get_queryset(self):
        user = self.request.user
        qs = WorkOrderSubmission.objects.select_related('work_order', 'bge', 'uploaded_by')
        bge_id = self.request.query_params.get('bge')
        wo_id = self.request.query_params.get('work_order')
        if self._is_admin() or _is_viewer(user):
            if bge_id:
                qs = qs.filter(bge_id=bge_id)
            if wo_id:
                qs = qs.filter(work_order_id=wo_id)
            return qs
        try:
            bge = user.bge_profile
        except Exception:
            return qs.none()
        qs = qs.filter(bge=bge)
        if wo_id:
            qs = qs.filter(work_order_id=wo_id)
        return qs

    # XLSX files are ZIP archives (PK\x03\x04); legacy XLS files are OLE2
    # compound documents (D0 CF 11 E0 A1 B1 1A E1).
    _XLSX_MAGIC = b'PK\x03\x04'
    _XLS_MAGIC = b'\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1'

    def _validate_file(self, f, label):
        if f is None:
            return
        name = (f.name or '').lower()
        if not name.endswith(self.ALLOWED_EXTENSIONS):
            raise ValidationError(f'{label} must be an Excel file (.xlsx or .xls).')
        if f.size > self.MAX_FILE_SIZE:
            raise ValidationError(f'{label} must be under 10 MB.')
        header = f.read(8)
        f.seek(0)
        if not (header.startswith(self._XLSX_MAGIC) or header.startswith(self._XLS_MAGIC)):
            raise ValidationError(f'{label} does not look like a valid Excel file.')

    def _resolve_bge(self, work_order):
        user = self.request.user
        if self._is_admin():
            return work_order.bge
        try:
            bge = user.bge_profile
        except Exception:
            raise PermissionDenied("Only BGEs or admins can upload timesheets/invoices.")
        if bge.id != work_order.bge_id and not work_order.co_bges.filter(id=bge.id).exists():
            raise PermissionDenied("You can only upload documents for your own work orders.")
        return bge

    def _apply_files(self, instance, timesheet, invoice):
        from django.core.files.base import ContentFile
        update_fields = []
        if timesheet:
            data = timesheet.read()
            instance.timesheet_data = data
            instance.timesheet_filename = timesheet.name
            instance.timesheet_file.save(timesheet.name, ContentFile(data), save=False)
            update_fields += ['timesheet_data', 'timesheet_filename', 'timesheet_file']
        if invoice:
            data = invoice.read()
            instance.invoice_data = data
            instance.invoice_filename = invoice.name
            instance.invoice_file.save(invoice.name, ContentFile(data), save=False)
            update_fields += ['invoice_data', 'invoice_filename', 'invoice_file']
        if update_fields:
            instance.save(update_fields=update_fields)

    def perform_create(self, serializer):
        work_order = serializer.validated_data.get('work_order')
        bge = self._resolve_bge(work_order)
        timesheet = serializer.validated_data.pop('timesheet', None)
        invoice = serializer.validated_data.pop('invoice', None)
        self._validate_file(timesheet, 'Timesheet')
        self._validate_file(invoice, 'Invoice')
        if not timesheet and not invoice:
            raise ValidationError("Upload at least a timesheet or an invoice file.")
        instance = serializer.save(bge=bge, uploaded_by=self.request.user)
        self._apply_files(instance, timesheet, invoice)

    def _check_owner_or_admin(self, instance):
        user = self.request.user
        is_owner = hasattr(user, 'bge_profile') and user.bge_profile_id == instance.bge_id
        if not (self._is_admin() or is_owner):
            raise PermissionDenied("You can only manage your own submissions.")

    def perform_update(self, serializer):
        self._check_owner_or_admin(serializer.instance)
        timesheet = serializer.validated_data.pop('timesheet', None)
        invoice = serializer.validated_data.pop('invoice', None)
        self._validate_file(timesheet, 'Timesheet')
        self._validate_file(invoice, 'Invoice')
        instance = serializer.save()
        self._apply_files(instance, timesheet, invoice)

    def destroy(self, request, *args, **kwargs):
        self._check_owner_or_admin(self.get_object())
        return super().destroy(request, *args, **kwargs)

    def _serve_file(self, instance, kind):
        data = getattr(instance, f'{kind}_data')
        fname = _safe_filename(getattr(instance, f'{kind}_filename') or f'{kind}.xlsx')
        if not data:
            return Response({'error': f'No {kind} uploaded for this submission.'}, status=status.HTTP_404_NOT_FOUND)
        content_type = (
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            if fname.lower().endswith('.xlsx') else 'application/vnd.ms-excel'
        )
        resp = HttpResponse(bytes(data), content_type=content_type)
        resp['Content-Disposition'] = f'attachment; filename="{fname}"'
        return resp

    @action(detail=True, methods=['get'], url_path='download-timesheet')
    def download_timesheet(self, request, pk=None):
        return self._serve_file(self.get_object(), 'timesheet')

    @action(detail=True, methods=['get'], url_path='download-invoice')
    def download_invoice(self, request, pk=None):
        return self._serve_file(self.get_object(), 'invoice')


class WorkOrderPaymentViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """Payment log against work orders.

    Admins record/edit/delete payments. BGEs and viewers have read-only
    access, scoped (for BGEs) to payments against their own work orders.
    """
    serializer_class = WorkOrderPaymentSerializer
    permission_classes = [IsAuthenticated]

    def _is_admin(self):
        u = self.request.user
        return u.is_staff or u.is_superuser or _managed_groups(u) is not None

    def get_queryset(self):
        user = self.request.user
        qs = WorkOrderPayment.objects.select_related('work_order', 'work_order__bge', 'recorded_by')
        wo_id = self.request.query_params.get('work_order')
        if wo_id:
            qs = qs.filter(work_order_id=wo_id)
        if self._is_admin() or _is_viewer(user):
            return qs
        try:
            bge = user.bge_profile
        except Exception:
            return qs.none()
        return qs.filter(work_order__bge=bge)

    def perform_create(self, serializer):
        user = self.request.user
        if self._is_admin():
            serializer.save(recorded_by=user)
        else:
            # BGEs record payments they received against their own work orders
            try:
                bge = user.bge_profile
            except Exception:
                raise PermissionDenied("You must be a registered BGE to record payments.")
            work_order = serializer.validated_data.get('work_order')
            if not work_order or work_order.bge_id != bge.id:
                raise PermissionDenied("You can only record payments for your own work orders.")
            serializer.save(
                recorded_by=user,
                confirmed_by_bge=True,
                confirmed_at=timezone.now(),
            )

    def perform_update(self, serializer):
        if not self._is_admin():
            raise PermissionDenied("Only admins can edit payments.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        if not self._is_admin():
            raise PermissionDenied("Only admins can delete payments.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='notify')
    def notify(self, request, pk=None):
        """Admin-only: email the BGE that a payment has been recorded."""
        if not self._is_admin():
            raise PermissionDenied("Only admins can notify BGEs about payments.")
        payment = self.get_object()
        work_order = payment.work_order
        bge = work_order.bge
        recipient_email = (bge.email or '').strip()
        if not recipient_email:
            raise ValidationError("This BGE has no email address on file.")

        notes_line = f'\nNotes: {payment.notes}\n' if payment.notes else ''
        reference_line = f'Reference: {payment.reference}\n' if payment.reference else ''
        subject = f'Payment Recorded — {work_order.work_order_number}'
        body = (
            f'Dear {bge.name},\n\n'
            f'A payment has been recorded against your work order ({work_order.work_order_number}):\n\n'
            f'Date: {payment.payment_date}\n'
            f'Amount: UGX {payment.amount:,.0f}\n'
            f'{reference_line}'
            f'{notes_line}\n'
            f'Please log in to confirm receipt of this payment.\n\n'
            f'Regards,\nPRUDEV II BDS Team\nGOPA AFC / GIZ'
        )
        try:
            msg = EmailMultiAlternatives(
                subject, body,
                getattr(settings, 'DEFAULT_FROM_EMAIL', ''),
                [recipient_email],
            )
            msg.send(fail_silently=True)
        except Exception:
            pass

        payment.notified_at = timezone.now()
        payment.save(update_fields=['notified_at'])
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm(self, request, pk=None):
        """BGE-only: confirm receipt of a logged payment, notifying admin by email."""
        payment = self.get_object()
        work_order = payment.work_order
        user = request.user
        if not self._is_admin():
            try:
                bge = user.bge_profile
            except Exception:
                raise PermissionDenied("Only the BGE on this work order can confirm receipt.")
            if bge.id != work_order.bge_id and not work_order.co_bges.filter(id=bge.id).exists():
                raise PermissionDenied("Only the BGE on this work order can confirm receipt.")

        payment.confirmed_by_bge = True
        payment.confirmed_at = timezone.now()
        payment.save(update_fields=['confirmed_by_bge', 'confirmed_at'])

        notify_email = getattr(settings, 'PAYMENT_CONFIRMATION_NOTIFY_EMAIL', '')
        if notify_email:
            notes_line = f'\nNotes: {payment.notes}\n' if payment.notes else ''
            reference_line = f'Reference: {payment.reference}\n' if payment.reference else ''
            subject = f'Payment Receipt Confirmed — {work_order.work_order_number}'
            body = (
                f'{work_order.bge.name} has confirmed receipt of a payment against '
                f'work order {work_order.work_order_number}:\n\n'
                f'Date: {payment.payment_date}\n'
                f'Amount: UGX {payment.amount:,.0f}\n'
                f'{reference_line}'
                f'{notes_line}\n'
                f'Confirmed at: {payment.confirmed_at:%Y-%m-%d %H:%M}\n\n'
                f'Regards,\nPRUDEV II BDS Team\nGOPA AFC / GIZ'
            )
            try:
                msg = EmailMultiAlternatives(
                    subject, body,
                    getattr(settings, 'DEFAULT_FROM_EMAIL', ''),
                    [notify_email],
                )
                msg.send(fail_silently=True)
            except Exception:
                pass

        return Response(self.get_serializer(payment).data)


class WorkOrderAttachmentViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """Supporting documents (photos, PDFs) uploaded by BGEs against a work order."""
    serializer_class = WorkOrderAttachmentSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    ALLOWED_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf')
    MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

    def _is_admin(self):
        u = self.request.user
        return u.is_staff or u.is_superuser or _managed_groups(u) is not None

    def get_queryset(self):
        user = self.request.user
        qs = WorkOrderAttachment.objects.select_related(
            'work_order', 'work_order__bge', 'uploaded_by'
        )
        wo_id = self.request.query_params.get('work_order')
        if self._is_admin() or _is_viewer(user):
            if wo_id:
                qs = qs.filter(work_order_id=wo_id)
            return qs
        try:
            bge = user.bge_profile
        except Exception:
            return qs.none()
        qs = qs.filter(work_order__bge=bge)
        if wo_id:
            qs = qs.filter(work_order_id=wo_id)
        return qs

    def _validate_file(self, f):
        name = (f.name or '').lower()
        if not any(name.endswith(ext) for ext in self.ALLOWED_EXTENSIONS):
            raise ValidationError('Attachments must be images (JPG, PNG, GIF, WebP) or PDF files.')
        if f.size > self.MAX_FILE_SIZE:
            raise ValidationError('File must be under 20 MB.')

    def _check_access(self, work_order):
        if self._is_admin():
            return
        try:
            bge = self.request.user.bge_profile
        except Exception:
            raise PermissionDenied("Only BGEs or admins can upload attachments.")
        if bge.id != work_order.bge_id and not work_order.co_bges.filter(id=bge.id).exists():
            raise PermissionDenied("You can only upload attachments for your own work orders.")

    def perform_create(self, serializer):
        from django.core.files.base import ContentFile
        work_order = serializer.validated_data.get('work_order')
        self._check_access(work_order)
        f = serializer.validated_data.pop('file_upload')
        self._validate_file(f)
        data = f.read()
        instance = serializer.save(
            uploaded_by=self.request.user,
            filename=f.name,
            file_data=data,
        )
        instance.file.save(f.name, ContentFile(data), save=True)

        # Real-time background upload to Google Drive ('PRUDEV II - BGE Photos/{BGE}/')
        fname_lower = (f.name or '').lower()
        is_image = any(fname_lower.endswith(ext) for ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif'))
        if is_image and work_order.bge:
            try:
                from ..google_drive_service import async_upload_bge_photo
                prefix = f"WO_{work_order.work_order_number}"
                async_upload_bge_photo(
                    bge=work_order.bge,
                    filename=f.name,
                    data_bytes=data,
                    prefix=prefix,
                )
            except Exception as drive_err:
                logger.warning(f"Could not queue Google Drive photo upload: {drive_err}")

    def destroy(self, request, *args, **kwargs):
        if not self._is_admin():
            raise PermissionDenied("Only admins can delete attachments.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        instance = self.get_object()
        if not instance.file_data:
            return Response({'error': 'File not found.'}, status=status.HTTP_404_NOT_FOUND)
        name = (instance.filename or '').lower()
        if name.endswith(('.jpg', '.jpeg')):
            ct = 'image/jpeg'
        elif name.endswith('.png'):
            ct = 'image/png'
        elif name.endswith('.gif'):
            ct = 'image/gif'
        elif name.endswith('.webp'):
            ct = 'image/webp'
        elif name.endswith('.pdf'):
            ct = 'application/pdf'
        else:
            ct = 'application/octet-stream'
        fname = _safe_filename(instance.filename or 'attachment')
        resp = HttpResponse(bytes(instance.file_data), content_type=ct)
        disp = 'attachment' if request.query_params.get('dl') else 'inline'
        resp['Content-Disposition'] = f'{disp}; filename="{fname}"'
        return resp
