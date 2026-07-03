import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone

from ..models import WorkOrder, WorkOrderSubmission, WorkOrderPayment
from ..serializers import (
    WorkOrderSerializer, WorkOrderSubmissionSerializer, WorkOrderPaymentSerializer,
)
from .mixins import (
    ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin,
    _managed_groups, _is_viewer, _safe_filename,
)

logger = logging.getLogger(__name__)


class WorkOrderViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """Work Order management.

    Visibility:
    - Admins see all work orders (any status).
    - BGEs see only their own work orders with status 'issued' or 'signed'.

    Mutation (create / update / delete / issue):
    - Admin-only. BGEs, programme managers and viewers have read-only access.
    """
    serializer_class = WorkOrderSerializer
    permission_classes = [IsAuthenticated]

    def _is_admin(self):
        u = self.request.user
        return u.is_staff or u.is_superuser

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
        if not self.request.data.get('allow_overlap'):
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
        admin_email = getattr(settings, 'DEFAULT_FROM_EMAIL', '')
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
