import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.http import HttpResponse
from django.utils import timezone

from ..models import TrainingReport, AnnualReviewReport, MentorTrainingReport
from ..serializers import (
    TrainingReportSerializer, AnnualReviewReportSerializer, MentorTrainingReportSerializer,
)
from .mixins import (
    ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin,
    _managed_groups, _is_viewer, _is_programme_manager, _safe_filename,
)

logger = logging.getLogger(__name__)


class TrainingReportViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
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
        data = {}
        if serializer.validated_data.get('status') == 'submitted':
            data['submitted_at'] = timezone.now()
        serializer.save(**data)

    @action(detail=True, methods=['post'], url_path='revert')
    def revert(self, request, pk=None):
        """Admin-only: revert a submitted training report back to draft."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can revert reports.")
        report = self.get_object()
        if report.status == 'draft':
            return Response({'detail': 'Report is already a draft.'}, status=status.HTTP_400_BAD_REQUEST)
        report.status = 'draft'
        report.submitted_at = None
        report.save(update_fields=['status', 'submitted_at'])
        return Response(TrainingReportSerializer(report, context={'request': request}).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Render this training report as a branded PDF."""
        from ..pdf_reports import render_training_report
        report = self.get_object()
        safe = report.session.title[:40].replace(' ', '_')
        fname = _safe_filename(f"TrainingReport_{safe}_{report.session.date}.pdf")
        dl = request.query_params.get('dl')
        buf = render_training_report(report)
        resp = HttpResponse(buf.read(), content_type='application/pdf')
        disposition = 'attachment' if dl else 'inline'
        resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
        return resp


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
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs.select_related('bge').prefetch_related('msmes_reviewed')

    def perform_create(self, serializer):
        bge = None
        try:
            bge = self.request.user.bge_profile
        except Exception:
            pass
        serializer.save(bge=bge)

    def perform_update(self, serializer):
        data = {}
        if serializer.validated_data.get('status') == 'submitted':
            data['submitted_at'] = timezone.now()
        serializer.save(**data)


class MentorTrainingReportViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
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
            'session', 'bge'
        ).prefetch_related(
            'session__businesses', 'session__attendances',
            'session__facilitation_assignments__bge',
        )
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
            if session and not session.facilitation_assignments.filter(bge=bge, role='mentor').exists():
                raise PermissionDenied("You are not assigned as a mentor for this session.")
        except PermissionDenied:
            raise
        except Exception:
            pass
        serializer.save(bge=bge)

    def perform_update(self, serializer):
        data = {}
        if serializer.validated_data.get('status') == 'submitted':
            data['submitted_at'] = timezone.now()
        serializer.save(**data)

    @action(detail=True, methods=['post'], url_path='revert')
    def revert(self, request, pk=None):
        """Admin-only: revert a submitted mentor report back to draft."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can revert reports.")
        report = self.get_object()
        if report.status == 'draft':
            return Response({'detail': 'Report is already a draft.'}, status=status.HTTP_400_BAD_REQUEST)
        report.status = 'draft'
        report.submitted_at = None
        report.save(update_fields=['status', 'submitted_at'])
        return Response(MentorTrainingReportSerializer(report, context={'request': request}).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Render this mentor training report as a branded PDF."""
        from ..pdf_reports import render_mentor_report
        report = self.get_object()
        safe = report.session.title[:40].replace(' ', '_')
        fname = _safe_filename(f"MentorReport_{safe}_{report.session.date}.pdf")
        dl = request.query_params.get('dl')
        buf = render_mentor_report(report)
        resp = HttpResponse(buf.read(), content_type='application/pdf')
        disposition = 'attachment' if dl else 'inline'
        resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
        return resp
