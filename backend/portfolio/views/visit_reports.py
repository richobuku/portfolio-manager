import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q
from django.http import HttpResponse

from ..models import (
    MSMEReport, GroupReport, GroupReportContribution, GroupReportAttendance,
    MSMEGrowthSnapshot,
)
from ..serializers import (
    MSMEReportSerializer, GroupReportSerializer,
    GroupReportContributionSerializer, GroupReportAttendanceSerializer,
)
from .mixins import (
    ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin,
    _managed_groups, _is_viewer, _is_programme_manager, _safe_filename,
)

logger = logging.getLogger(__name__)


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
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from datetime import date as _date
        import math

        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            try:
                bge = user.bge_profile
            except Exception:
                raise PermissionDenied("No BGE profile associated with this account.")

            # Prevent a second BGE from filing an annual/quarterly review for an MSME
            # that another BGE has already covered in the same period.
            # The BGE who originally filed it can still edit/update their own report.
            msme       = serializer.validated_data.get('msme')
            visit_type = serializer.validated_data.get('visit_type', '')
            visit_date = serializer.validated_data.get('visit_date') or _date.today()

            if msme and visit_type in ('annual_review', 'quarterly_review'):
                qs = MSMEReport.objects.filter(
                    msme=msme,
                    visit_type=visit_type,
                    visit_date__year=visit_date.year,
                ).exclude(bge=bge)

                if visit_type == 'quarterly_review':
                    # Scope conflict to the same calendar quarter (Q1–Q4)
                    quarter = math.ceil(visit_date.month / 3)
                    quarter_start = ((quarter - 1) * 3) + 1
                    quarter_end   = quarter_start + 2
                    qs = qs.filter(
                        visit_date__month__gte=quarter_start,
                        visit_date__month__lte=quarter_end,
                    )

                conflict = qs.select_related('bge').first()
                if conflict:
                    period_label = (
                        f"Q{math.ceil(conflict.visit_date.month / 3)} {conflict.visit_date.year}"
                        if visit_type == 'quarterly_review'
                        else str(conflict.visit_date.year)
                    )
                    raise DRFValidationError(
                        f"An {'annual' if visit_type == 'annual_review' else 'quarterly'} review "
                        f"for this MSME has already been filed by {conflict.bge.name} "
                        f"({period_label}). Only one BGE can file this review per period."
                    )

            serializer.save(bge=bge)
            return
        serializer.save()

    def perform_update(self, serializer):
        instance = serializer.instance
        new_status = serializer.validated_data.get('status', instance.status)
        report = serializer.save()

        if instance.status != 'submitted' and new_status == 'submitted':
            # Freeze a PDF copy on first submission
            try:
                from ..pdf_reports import render_msme_report
                from django.core.files.base import ContentFile
                pdf_bytes = render_msme_report(report).read()
                safe_name = report.msme.business_name[:30].replace(' ', '_')
                fname = f"MSMEReport_{safe_name}_{report.visit_date}.pdf"
                report.submitted_pdf.save(fname, ContentFile(pdf_bytes), save=False)
                report.submitted_pdf_data = pdf_bytes
                report.save(update_fields=['submitted_pdf', 'submitted_pdf_data'])
            except Exception as e:
                logger.error('Failed to snapshot MSME report PDF (report id=%s): %s', report.id, e)

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

    def destroy(self, request, *args, **kwargs):
        report = self.get_object()
        user = request.user
        if user.is_staff or user.is_superuser:
            pass  # admins can delete any report
        else:
            if report.status != 'draft':
                raise PermissionDenied("You can only delete reports that are still in draft.")
            try:
                if report.bge != user.bge_profile:
                    raise PermissionDenied("You can only delete your own reports.")
            except Exception:
                raise PermissionDenied("No BGE profile associated with this account.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='bge-summary')
    def bge_summary(self, request):
        """Consolidated per-BGE summary of all reports in a date range.

        Query params:
          bge    — BGE id (optional; omit for all BGEs)
          start  — YYYY-MM-DD (optional)
          end    — YYYY-MM-DD (optional)
          status — filter by status (optional)
        """
        import datetime
        from collections import defaultdict, Counter
        from ..pdf_reports import VISIT_LABELS_Q

        start = request.query_params.get('start')
        end   = request.query_params.get('end')

        # Validate date params before touching the ORM — bad strings cause ORM ValidationError
        for param_name, param_val in [('start', start), ('end', end)]:
            if param_val:
                try:
                    datetime.date.fromisoformat(param_val)
                except ValueError:
                    return Response(
                        {'detail': f"Invalid '{param_name}' date — expected YYYY-MM-DD."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        qs = self.get_queryset().exclude(status='draft')
        if start:
            qs = qs.filter(visit_date__gte=start)
        if end:
            qs = qs.filter(visit_date__lte=end)

        # Group reports by BGE then by MSME
        by_bge = defaultdict(lambda: {'reports': [], 'msmes': {}})
        for r in qs.select_related('bge', 'msme').order_by('bge__name', 'msme__business_name', 'visit_date'):
            bge_key  = r.bge_id
            msme_key = r.msme_id
            by_bge[bge_key]['bge_id']   = r.bge_id
            by_bge[bge_key]['bge_name'] = r.bge.name
            by_bge[bge_key]['reports'].append(r)
            if msme_key not in by_bge[bge_key]['msmes']:
                by_bge[bge_key]['msmes'][msme_key] = {
                    'msme_id':   r.msme_id,
                    'msme_name': r.msme.business_name,
                    'msme_code': r.msme.msme_code if hasattr(r.msme, 'msme_code') else '',
                    'visits':    [],
                }
            by_bge[bge_key]['msmes'][msme_key]['visits'].append({
                'id':                    r.id,
                'visit_date':            str(r.visit_date) if r.visit_date else None,
                'visit_type':            r.visit_type,
                'visit_type_label':      VISIT_LABELS_Q.get(r.visit_type, r.visit_type),
                'status':                r.status,
                'support_provided':      r.support_provided or '',
                'key_achievement':       r.key_achievement or '',
                'challenges_identified': r.challenges_identified or '',
                'action_plan':           r.action_plan or '',
                'recommendations':       r.recommendations or '',
                'growth_rating':         r.growth_rating,
                # Use explicit None check so Decimal('0') is not coerced to null
                'revenue_ugx': str(r.revenue_ugx) if r.revenue_ugx is not None else None,
            })

        result = []
        for bge_data in sorted(by_bge.values(), key=lambda x: x['bge_name']):
            rpts = bge_data['reports']
            vt_counts = Counter(r.visit_type for r in rpts)
            result.append({
                'bge_id':        bge_data['bge_id'],
                'bge_name':      bge_data['bge_name'],
                'total_reports': len(rpts),
                'total_msmes':   len(bge_data['msmes']),
                'visit_type_breakdown': [
                    {'visit_type': vt, 'label': VISIT_LABELS_Q.get(vt, vt), 'count': cnt}
                    for vt, cnt in sorted(vt_counts.items(), key=lambda x: -x[1])
                ],
                'date_range': {
                    'start': str(min((r.visit_date for r in rpts if r.visit_date), default='')),
                    'end':   str(max((r.visit_date for r in rpts if r.visit_date), default='')),
                },
                'msmes': list(bge_data['msmes'].values()),
            })

        # Derive total_msmes from already-loaded data — avoids a second DB round-trip
        all_msme_ids = {mid for bd in by_bge.values() for mid in bd['msmes']}
        return Response({
            'total_bges':    len(result),
            'total_reports': sum(b['total_reports'] for b in result),
            'total_msmes':   len(all_msme_ids),
            'period_start':  start or '',
            'period_end':    end   or '',
            'bges':          result,
        })

    @action(detail=False, methods=['get'], url_path='quarterly-pdf')
    def quarterly_pdf(self, request):
        """Stream a quarterly summary PDF for a date range.

        Query params:
          start  — YYYY-MM-DD (required)
          end    — YYYY-MM-DD (required)
          label  — display label, e.g. 'Q2 2026' (optional)
          dl     — any value → Content-Disposition: attachment (optional)
        """
        import datetime
        import re
        from ..pdf_reports import render_quarterly_report

        start_str = request.query_params.get('start', '').strip()
        end_str   = request.query_params.get('end',   '').strip()
        label     = request.query_params.get('label', '').strip()

        # Validate dates before filtering — invalid strings would cause an ORM ValidationError 500
        start_date = end_date = None
        for param_name, param_val in [('start', start_str), ('end', end_str)]:
            if param_val:
                try:
                    parsed = datetime.date.fromisoformat(param_val)
                    if param_name == 'start':
                        start_date = parsed
                    else:
                        end_date = parsed
                except ValueError:
                    return Response(
                        {'detail': f"Invalid '{param_name}' date — expected YYYY-MM-DD."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        qs = self.get_queryset().exclude(status='draft')
        if start_date:
            qs = qs.filter(visit_date__gte=start_date)
        if end_date:
            qs = qs.filter(visit_date__lte=end_date)

        if not label and start_date and end_date:
            label = f'{start_date.strftime("%d %b %Y")} – {end_date.strftime("%d %b %Y")}'

        buf = render_quarterly_report(qs, start_date=start_date, end_date=end_date, label=label)

        # Strip any characters that could break the Content-Disposition header
        safe_label = re.sub(r'[^\w\-]', '_', label or 'period')
        fname = f'PRUDEV2_BGE_Summary_{safe_label}.pdf'
        disposition = 'attachment' if request.query_params.get('dl') else 'inline'
        resp = HttpResponse(buf.read(), content_type='application/pdf')
        resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
        return resp

    @action(detail=True, methods=['post'], url_path='revert')
    def revert(self, request, pk=None):
        """Admin-only: revert a submitted/reviewed report back to draft
        so the BGE can re-edit and resubmit."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can revert reports.")
        report = self.get_object()
        if report.status == 'draft':
            return Response({'detail': 'Report is already a draft.'}, status=status.HTTP_400_BAD_REQUEST)
        report.status = 'draft'
        if report.submitted_pdf:
            report.submitted_pdf.delete(save=False)
        report.submitted_pdf_data = None
        report.save(update_fields=['status', 'submitted_pdf', 'submitted_pdf_data'])
        from ..serializers import MSMEReportSerializer
        return Response(MSMEReportSerializer(report, context={'request': request}).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Render this MSME visit report as a styled PDF.
        Submitted reports return the stored snapshot; drafts are rendered on demand."""
        from ..pdf_reports import render_msme_report
        report = self.get_object()
        fname = _safe_filename(f"MSMEReport_{report.msme.business_name[:30].replace(' ', '_')}_{report.visit_date}.pdf")
        disposition = 'attachment' if request.query_params.get('dl') else 'inline'
        if report.submitted_pdf:
            try:
                resp = HttpResponse(report.submitted_pdf.read(), content_type='application/pdf')
                resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
                return resp
            except Exception as e:
                logger.warning('Stored MSME report PDF unreadable (report id=%s), regenerating: %s', report.id, e)
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
                    from ..pdf_reports import render_group_report
                    from django.core.files.base import ContentFile
                    pdf_bytes = render_group_report(report).read()
                    safe_name = report.group.name.replace(' ', '_')
                    fname = f"GroupReport_{safe_name}_{report.visit_date}.pdf"
                    report.submitted_pdf.save(fname, ContentFile(pdf_bytes), save=True)
                except Exception as e:
                    logger.error('Failed to snapshot group report PDF (report id=%s): %s', report.id, e)

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can delete group reports.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='revert')
    def revert(self, request, pk=None):
        """Admin-only: revert a submitted or approved group report back to draft."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can revert reports.")
        report = self.get_object()
        if report.status == 'draft':
            return Response({'detail': 'Report is already a draft.'}, status=status.HTTP_400_BAD_REQUEST)
        report.status = 'draft'
        report.submitted_at = None
        report.approved_at = None
        if report.submitted_pdf:
            report.submitted_pdf.delete(save=False)
        report.submitted_pdf_data = None
        report.save(update_fields=['status', 'submitted_at', 'approved_at', 'submitted_pdf', 'submitted_pdf_data'])
        from ..serializers import GroupReportSerializer
        return Response(GroupReportSerializer(report, context={'request': request}).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Render this group report as a styled PDF.
        Submitted/approved reports return the stored snapshot; drafts are rendered on demand."""
        from ..pdf_reports import render_group_report
        report = self.get_object()
        fname = _safe_filename(f"GroupReport_{report.group.name.replace(' ', '_')}_{report.visit_date}.pdf")
        disposition = 'attachment' if request.query_params.get('dl') else 'inline'
        if report.submitted_pdf:
            try:
                resp = HttpResponse(report.submitted_pdf.read(), content_type='application/pdf')
                resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
                return resp
            except Exception as e:
                logger.warning('Stored group report PDF unreadable (report id=%s), regenerating: %s', report.id, e)
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
