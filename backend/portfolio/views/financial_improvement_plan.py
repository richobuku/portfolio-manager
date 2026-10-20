import logging
import io
import datetime
from django.utils import timezone
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError

from ..models import FinancialImprovementActionPlan, MSME, BusinessGrowthExpert
from ..serializers.financial_improvement_plan import FinancialImprovementActionPlanSerializer
from .mixins import (
    ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin,
    _managed_groups, _is_viewer, _is_programme_manager, _safe_filename,
)
from ..pdf_reports import generate_financial_improvement_plan_pdf
from ..fiap_constants import FIAP_CATEGORIES, STANDARD_GAPS, STANDARD_FSPS, STANDARD_FACILITIES, STANDARD_ROADMAP_STEPS

logger = logging.getLogger(__name__)


class FinancialImprovementActionPlanViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """
    CRUD for MSME Financial Improvement Action Plans (Access to Finance).
    Conducted by BGEs for credit readiness diagnostic and phased roadmaps.
    """
    serializer_class = FinancialImprovementActionPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = FinancialImprovementActionPlan.objects.select_related('msme', 'bge').all()
        
        if user.is_staff or user.is_superuser:
            pass
        elif _is_programme_manager(user):
            group_ids = _managed_groups(user) or []
            qs = qs.filter(msme__programme_groups__in=group_ids).distinct()
        elif _is_viewer(user):
            pass
        else:
            try:
                bge = user.bge_profile
                qs = qs.filter(bge=bge)
            except Exception:
                return qs.none()

        msme_id = self.request.query_params.get('msme')
        if msme_id:
            qs = qs.filter(msme_id=msme_id)
        bge_id = self.request.query_params.get('bge')
        if bge_id:
            qs = qs.filter(bge_id=bge_id)
        cat = self.request.query_params.get('category')
        if cat:
            qs = qs.filter(category=cat)
        priority = self.request.query_params.get('priority')
        if priority:
            qs = qs.filter(support_priority=priority)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        bge = serializer.validated_data.get('bge')
        if not bge:
            try:
                bge = user.bge_profile
            except Exception:
                pass
        
        # If category chosen, auto-populate category_name and category_addresses if missing
        cat_id = serializer.validated_data.get('category')
        cat_meta = next((c for c in FIAP_CATEGORIES if c['id'] == cat_id), None)
        extra = {}
        if bge:
            extra['bge'] = bge
        if cat_meta:
            if not serializer.validated_data.get('category_name'):
                extra['category_name'] = cat_meta['name']
            if not serializer.validated_data.get('category_addresses'):
                extra['category_addresses'] = cat_meta['what_it_addresses']
        
        serializer.save(**extra)

    @action(detail=False, methods=['get'], url_path='templates')
    def templates(self, request):
        """
        Return standard categories, what they address, diagnostic gaps, and default action plan templates.
        """
        return Response({
            'categories': FIAP_CATEGORIES,
            'standard_gaps': STANDARD_GAPS,
            'standard_fsps': STANDARD_FSPS,
            'standard_facilities': STANDARD_FACILITIES,
            'standard_steps': STANDARD_ROADMAP_STEPS,
        })

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Aggregate portfolio summary of Financial Improvement Action Plans.
        Returns total count, distribution across the 9 categories, % of total, and priority breakdown.
        """
        qs = self.filter_queryset(self.get_queryset())
        total = qs.count()

        category_counts = []
        for cat in FIAP_CATEGORIES:
            cat_qs = qs.filter(category=cat['id'])
            cat_count = cat_qs.count()
            pct = round((cat_count / total * 100), 1) if total > 0 else 0.0
            high_count = cat_qs.filter(support_priority='High').count()
            med_count = cat_qs.filter(support_priority='Medium').count()
            low_count = cat_qs.filter(support_priority='Low').count()

            category_counts.append({
                'category_id': cat['id'],
                'number': cat['number'],
                'category_name': cat['name'],
                'what_it_addresses': cat['what_it_addresses'],
                'count': cat_count,
                'pct': pct,
                'high_priority': high_count,
                'medium_priority': med_count,
                'low_priority': low_count,
            })

        return Response({
            'total_msmes': total,
            'categories': category_counts,
            'overall_high': qs.filter(support_priority='High').count(),
            'overall_medium': qs.filter(support_priority='Medium').count(),
            'overall_low': qs.filter(support_priority='Low').count(),
        })

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """Submit the financial improvement action plan."""
        plan = self.get_object()
        plan.status = 'submitted'
        plan.submitted_at = timezone.now()
        plan.save(update_fields=['status', 'submitted_at'])
        return Response(self.get_serializer(plan).data)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """
        Approve the financial improvement plan.
        Intended for Access to Finance leads (Rosemary Laker, Harriet Daisy Amule) or Admins.
        """
        user = request.user
        if not (user.is_staff or user.is_superuser or _is_programme_manager(user) or _is_viewer(user)):
            raise PermissionDenied("Only Rosemary Laker, Harriet Daisy Amule, or Programme Administrators can approve financial plans.")

        plan = self.get_object()
        plan.status = 'approved'
        plan.approved_by = user
        plan.approved_by_name = user.get_full_name() or user.username
        plan.approved_at = timezone.now()
        plan.approval_notes = request.data.get('approval_notes', plan.approval_notes or '')
        plan.save(update_fields=['status', 'approved_by', 'approved_by_name', 'approved_at', 'approval_notes'])

        logger.info(f"[FIAP Approve] Plan #{plan.id} for MSME {plan.msme.business_name} approved by {plan.approved_by_name}")
        return Response(self.get_serializer(plan).data)

    @action(detail=True, methods=['post'], url_path='book-meeting')
    def book_meeting(self, request, pk=None):
        """
        Action to book an approval meeting with Rosemary Laker or Harriet Daisy Amule
        for this Financial Improvement Action Plan and send calendar invite email.
        """
        from ..models import FinancialImprovementPlanMeeting
        from ..serializers.financial_improvement_plan import FinancialImprovementPlanMeetingSerializer
        from ..fiap_meeting_service import send_fiap_meeting_invite
        import uuid

        plan = self.get_object()
        user = request.user
        data = request.data.copy()
        data['plan'] = plan.id
        data['msme'] = plan.msme_id
        if plan.bge_id and 'bge' not in data:
            data['bge'] = plan.bge_id
        if not data.get('requester_name'):
            data['requester_name'] = user.get_full_name() or user.username or 'BGE Specialist'
        if not data.get('requester_email'):
            data['requester_email'] = user.email or getattr(getattr(user, 'bge_profile', None), 'email', None) or 'requester@prudev.org'

        serializer = FinancialImprovementPlanMeetingSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        s_date = serializer.validated_data['scheduled_date']
        s_time = serializer.validated_data['start_time']
        duration = serializer.validated_data.get('duration_minutes', 45)
        e_time = serializer.validated_data.get('end_time')
        if not e_time:
            dt_start = datetime.datetime.combine(s_date, s_time)
            e_time = (dt_start + datetime.timedelta(minutes=duration)).time()

        req_name = serializer.validated_data.get('requester_name') or user.get_full_name() or user.username
        req_email = serializer.validated_data.get('requester_email') or user.email

        bge = serializer.validated_data.get('bge') or plan.bge
        meeting = serializer.save(
            plan=plan,
            msme=plan.msme,
            bge=bge,
            requested_by=user,
            requester_name=req_name,
            requester_email=req_email,
            end_time=e_time,
            calendar_event_uid=f"fiap-meeting-{uuid.uuid4().hex[:12]}@prudev.gopa.eu",
        )

        # If plan is currently draft, transition to submitted automatically
        if plan.status == 'draft':
            plan.status = 'submitted'
            plan.submitted_at = timezone.now()
            plan.save(update_fields=['status', 'submitted_at'])

        sent, msg = send_fiap_meeting_invite(meeting)
        result_data = FinancialImprovementPlanMeetingSerializer(meeting).data
        result_data['invite_status_message'] = msg
        return Response(result_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Render this financial improvement plan as a branded PRUDEV II PDF."""
        plan = self.get_object()
        safe_name = plan.msme.business_name[:35].replace(' ', '_').replace('/', '_')
        fname = _safe_filename(f"FIAP_{safe_name}_{plan.assessment_date}.pdf")
        dl = request.query_params.get('dl')
        
        pdf_bytes = generate_financial_improvement_plan_pdf(plan)
        resp = HttpResponse(pdf_bytes, content_type='application/pdf')
        disposition = 'attachment' if dl else 'inline'
        resp['Content-Disposition'] = f'{disposition}; filename="{fname}"'
        return resp


class FinancialImprovementPlanMeetingViewSet(viewsets.ModelViewSet):
    """
    API endpoint for booking, listing, managing, and synchronizing
    Financial Improvement Plan approval meetings with Rosemary Laker and Harriet Daisy Amule.
    """
    from ..models import FinancialImprovementPlanMeeting
    from ..serializers.financial_improvement_plan import FinancialImprovementPlanMeetingSerializer

    queryset = FinancialImprovementPlanMeeting.objects.all()
    serializer_class = FinancialImprovementPlanMeetingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from ..models import FinancialImprovementPlanMeeting
        from django.db.models import Q

        user = self.request.user
        qs = FinancialImprovementPlanMeeting.objects.all().select_related(
            'msme', 'bge', 'plan', 'requested_by'
        )

        if not (user.is_staff or user.is_superuser or _is_programme_manager(user) or _is_viewer(user)):
            # BGE only sees their own meetings or meetings for their assigned MSMEs
            qs = qs.filter(
                Q(requested_by=user) |
                Q(bge__user=user) |
                Q(msme__assigned_bge__user=user)
            ).distinct()

        plan_id = self.request.query_params.get('plan')
        if plan_id:
            qs = qs.filter(plan_id=plan_id)

        msme_id = self.request.query_params.get('msme')
        if msme_id:
            qs = qs.filter(msme_id=msme_id)

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        return qs

    def perform_create(self, serializer):
        from ..fiap_meeting_service import send_fiap_meeting_invite
        import uuid

        user = self.request.user
        s_date = serializer.validated_data['scheduled_date']
        s_time = serializer.validated_data['start_time']
        duration = serializer.validated_data.get('duration_minutes', 45)
        e_time = serializer.validated_data.get('end_time')
        if not e_time:
            dt_start = datetime.datetime.combine(s_date, s_time)
            e_time = (dt_start + datetime.timedelta(minutes=duration)).time()

        req_name = serializer.validated_data.get('requester_name') or user.get_full_name() or user.username
        req_email = serializer.validated_data.get('requester_email') or user.email

        bge = serializer.validated_data.get('bge')
        if not bge:
            try:
                bge = user.bge_profile
            except Exception:
                pass

        meeting = serializer.save(
            requested_by=user,
            requester_name=req_name,
            requester_email=req_email,
            bge=bge,
            end_time=e_time,
            calendar_event_uid=f"fiap-meeting-{uuid.uuid4().hex[:12]}@prudev.gopa.eu",
        )

        plan = meeting.plan
        if plan and plan.status == 'draft':
            plan.status = 'submitted'
            plan.submitted_at = timezone.now()
            plan.save(update_fields=['status', 'submitted_at'])

        send_fiap_meeting_invite(meeting)

    @action(detail=True, methods=['post'], url_path='resend-invite')
    def resend_invite(self, request, pk=None):
        from ..fiap_meeting_service import send_fiap_meeting_invite
        meeting = self.get_object()
        sent, msg = send_fiap_meeting_invite(meeting)
        return Response({
            'status': 'sent' if sent else 'error',
            'message': msg,
            'email_sent': meeting.email_sent,
            'email_sent_at': meeting.email_sent_at,
        })

