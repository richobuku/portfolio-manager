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

from ..models import EnterpriseImprovementPlan, MSME, BusinessGrowthExpert
from ..serializers import EnterpriseImprovementPlanSerializer
from .mixins import (
    ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin,
    _managed_groups, _is_viewer, _is_programme_manager, _safe_filename,
)
from ..pdf_reports import generate_enterprise_improvement_plan_pdf
from ..excel_reports import generate_enterprise_improvement_plan_excel

logger = logging.getLogger(__name__)


TBIP_CATEGORIES = [
    {
        'id': 'finance',
        'name': 'Financial Management',
        'icon': '💰',
        'questions': [
            {'id': 'fin_1', 'text': 'Does the business have financial management guidelines (approval process, cash movement)?'},
            {'id': 'fin_2', 'text': 'Does the business bank all their income/revenue before spending it?'},
            {'id': 'fin_3', 'text': 'Are there accounting processes defined, including purchase orders, LPOs, and payment requests?'},
            {'id': 'fin_4', 'text': 'Does the business have financial projections / financial model for their business for the next 12 months?'},
            {'id': 'fin_5', 'text': 'Is there a designated person to handle business cash/finances?'},
        ]
    },
    {
        'id': 'hr',
        'name': 'Human Resources (HR)',
        'icon': '👥',
        'questions': [
            {'id': 'hr_1', 'text': 'Does the business have contracts for employees?'},
            {'id': 'hr_6', 'text': 'Are the contracts performance-based?'},
            {'id': 'hr_2', 'text': 'Are the TOR / roles clear and written down?'},
            {'id': 'hr_3', 'text': 'Is there an organogram?'},
            {'id': 'hr_4', 'text': 'Is the staff trained?'},
            {'id': 'hr_5', 'text': 'Is there an HR policy in place?'},
        ]
    },
    {
        'id': 'marketing',
        'name': 'Marketing & Sales',
        'icon': '📈',
        'questions': [
            {'id': 'mkt_1', 'text': 'Does the business maintain a customer database?'},
            {'id': 'mkt_2', 'text': 'Does the business utilise their database?'},
            {'id': 'mkt_3', 'text': 'Is there a clear Value Proposition Canvas / statement (does the business understand exactly who their customers are)?'},
            {'id': 'mkt_4', 'text': 'Does the business maintain a partner database?'},
            {'id': 'mkt_5', 'text': 'Is there a dedicated sales team with clear targets?'},
        ]
    },
]


def normalize_answer(ans):
    if not ans:
        return None
    ans_str = str(ans).strip()
    if ans_str in ('Available and complete', 'Complete', 'Available', 'Yes'):
        return 'Available and complete'
    if ans_str in ('Needs improvement', 'Needs Improvement', 'Partial'):
        return 'Needs improvement'
    if ans_str in ('Not available', 'Not Available', 'Missing', 'No'):
        return 'Not available'
    return None


def calculate_diagnostic(answers):
    """
    Given answers dict { question_id: 'Available and complete' | 'Needs improvement' | 'Not available' },
    computes weighted category scores, gap statistics, and overall MSME priority.
    """
    categories_snapshot = {}
    total_applicable = 0
    total_not_available = 0
    total_needs_improvement = 0
    total_available = 0
    total_score_points = 0
    total_max_points = 0

    for cat in TBIP_CATEGORIES:
        cat_name = cat['name']
        cat_questions = cat['questions']
        q_count = len(cat_questions)
        applicable = 0
        available_cnt = 0
        needs_imp_cnt = 0
        not_avail_cnt = 0
        cat_score_pts = 0

        for q in cat_questions:
            raw_ans = answers.get(q['id']) or answers.get(q['text'])
            norm_ans = normalize_answer(raw_ans)
            if norm_ans:
                applicable += 1
                if norm_ans == 'Available and complete':
                    available_cnt += 1
                    cat_score_pts += 2
                elif norm_ans == 'Needs improvement':
                    needs_imp_cnt += 1
                    cat_score_pts += 1
                elif norm_ans == 'Not available':
                    not_avail_cnt += 1

        cat_max_pts = applicable * 2
        if applicable == 0:
            cat_status = 'Not Assessed'
            score_pct = 0.0
            gap_pct = 0.0
        else:
            score_pct = round((cat_score_pts / cat_max_pts) * 100, 1)
            gap_pct = round(100.0 - score_pct, 1)
            if score_pct >= 80.0:
                cat_status = 'Satisfactory'
            elif score_pct >= 50.0:
                cat_status = 'Needs Improvement'
            else:
                cat_status = 'Critical Gap'

        total_applicable += applicable
        total_available += available_cnt
        total_needs_improvement += needs_imp_cnt
        total_not_available += not_avail_cnt
        total_score_points += cat_score_pts
        total_max_points += cat_max_pts

        categories_snapshot[cat_name] = {
            'total_questions': q_count,
            'applicable': applicable,
            'available': available_cnt,
            'needs_improvement': needs_imp_cnt,
            'not_available': not_avail_cnt,
            'gaps': not_avail_cnt + needs_imp_cnt,
            'critical_gaps': not_avail_cnt,
            'status': cat_status,
            'score_pct': score_pct,
            'gap_pct': gap_pct,
            'ratio': f"{not_avail_cnt} missing · {needs_imp_cnt} needs imp",
        }

    total_gaps = total_not_available + total_needs_improvement
    overall_pct = round((total_score_points / total_max_points) * 100, 1) if total_max_points > 0 else 0.0

    if total_applicable == 0:
        overall_priority = 'Low'
    elif overall_pct < 50.0 or total_not_available >= 3:
        overall_priority = 'High'
    elif overall_pct < 75.0 or total_not_available >= 1 or total_needs_improvement >= 3:
        overall_priority = 'Medium'
    else:
        overall_priority = 'Low'

    return {
        'categories': categories_snapshot,
        'total_gaps': total_gaps,
        'total_not_available': total_not_available,
        'total_needs_improvement': total_needs_improvement,
        'total_available': total_available,
        'total_applicable': total_applicable,
        'overall_score_pct': overall_pct,
        'overall_priority': overall_priority,
    }


class EnterpriseImprovementPlanViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
    serializer_class = EnterpriseImprovementPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        group_ids = _managed_groups(user)

        if user.is_staff or user.is_superuser:
            qs = EnterpriseImprovementPlan.objects.all()
        elif group_ids is not None:
            qs = EnterpriseImprovementPlan.objects.filter(msme__programme_groups__in=group_ids).distinct()
        elif _is_viewer(user):
            qs = EnterpriseImprovementPlan.objects.all()
        else:
            try:
                bge = user.bge_profile
                qs = EnterpriseImprovementPlan.objects.filter(bge=bge)
            except Exception:
                qs = EnterpriseImprovementPlan.objects.none()

        msme_id = self.request.query_params.get('msme')
        if msme_id:
            qs = qs.filter(msme_id=msme_id)
        bge_id = self.request.query_params.get('bge')
        if bge_id:
            qs = qs.filter(bge_id=bge_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        return qs.select_related('msme', 'bge', 'hoa_approved_by').order_by('-assessment_date', '-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        answers = serializer.validated_data.get('assessment_answers', {})
        diag = calculate_diagnostic(answers)

        bge = None
        if hasattr(user, 'bge_profile'):
            bge = user.bge_profile
        elif 'bge' in serializer.validated_data:
            bge = serializer.validated_data['bge']
        else:
            # Fallback to MSME's assigned BGE
            msme = serializer.validated_data.get('msme')
            if msme and msme.assigned_bge:
                bge = msme.assigned_bge

        if not bge:
            raise ValidationError({'bge': 'A Business Growth Expert must be assigned.'})

        serializer.save(
            bge=bge,
            diagnostic_snapshot=diag,
            overall_priority=diag['overall_priority'],
        )

    def perform_update(self, serializer):
        answers = serializer.validated_data.get('assessment_answers', serializer.instance.assessment_answers)
        diag = calculate_diagnostic(answers)
        serializer.save(
            diagnostic_snapshot=diag,
            overall_priority=diag['overall_priority'],
        )

    @action(detail=False, methods=['get'])
    def questions(self, request):
        """Returns the master list of 7 categories and questions."""
        return Response(TBIP_CATEGORIES)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """BGE signs off and submits the TBIP for Head of Assignment review."""
        plan = self.get_object()
        user = request.user

        # Ensure user is author or staff
        if not (user.is_staff or user.is_superuser or (hasattr(user, 'bge_profile') and user.bge_profile == plan.bge)):
            raise PermissionDenied("Only the author BGE or administrator can submit this plan.")

        sign_name = request.data.get('bge_sign_off_name') or user.get_full_name() or user.username
        plan.status = 'submitted'
        plan.bge_signed = True
        plan.bge_signed_at = timezone.now().date()
        plan.bge_sign_off_name = sign_name
        plan.submitted_at = timezone.now()
        plan.save()

        return Response(self.get_serializer(plan).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Head of Assignment / Admin approves the TBIP."""
        user = request.user
        if not (user.is_staff or user.is_superuser or _is_programme_manager(user)):
            raise PermissionDenied("Only Head of Assignment or Programme Managers can approve improvement plans.")

        plan = self.get_object()
        notes = request.data.get('hoa_notes', '')
        sign_name = request.data.get('hoa_sign_off_name') or user.get_full_name() or user.username

        plan.status = 'approved'
        plan.hoa_approved_by = user
        plan.hoa_approved_at = timezone.now().date()
        plan.hoa_sign_off_name = sign_name
        plan.hoa_notes = notes
        plan.save()

        return Response(self.get_serializer(plan).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Head of Assignment / Admin returns the TBIP for revision."""
        user = request.user
        if not (user.is_staff or user.is_superuser or _is_programme_manager(user)):
            raise PermissionDenied("Only Head of Assignment or Programme Managers can reject improvement plans.")

        plan = self.get_object()
        notes = request.data.get('hoa_notes', '')

        plan.status = 'rejected'
        plan.hoa_notes = notes
        plan.save()

        return Response(self.get_serializer(plan).data)

    @action(detail=True, methods=['get'])
    def export_pdf(self, request, pk=None):
        """Generates and downloads the official PRUDEV II TBIP PDF."""
        plan = self.get_object()
        pdf_bytes = generate_enterprise_improvement_plan_pdf(plan)
        filename = f"TBIP_{_safe_filename(plan.msme.name)}_{plan.assessment_date}.pdf"

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['get'])
    def export_excel(self, request, pk=None):
        """Generates and downloads the Excel workbook matching the assessment template."""
        plan = self.get_object()
        excel_bytes = generate_enterprise_improvement_plan_excel(plan)
        filename = f"TBIP_{_safe_filename(plan.msme.name)}_{plan.assessment_date}.xlsx"

        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
