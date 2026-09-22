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
        'id': 'governance',
        'name': 'Governance & Strategy',
        'questions': [
            {'id': 'gov_1', 'text': 'Does the business have a written business/strategic plan?'},
            {'id': 'gov_2', 'text': 'Is the business actively implementing that plan (using it for decisions/investments)?'},
            {'id': 'gov_3', 'text': 'Does the business have a Board of Directors/Advisors supporting decisions?'},
            {'id': 'gov_4', 'text': 'Are minutes kept of board/advisor meetings (including BGE visits)?'},
            {'id': 'gov_5', 'text': 'Does the business have segregated/independent management structures (e.g. finance and HR)?'},
            {'id': 'gov_6', 'text': 'Does the business have HR and finance policies/manuals in place?'},
        ]
    },
    {
        'id': 'finance',
        'name': 'Financial Management',
        'questions': [
            {'id': 'fin_1', 'text': 'Does the business have a digital accounting system?'},
            {'id': 'fin_2', 'text': 'Does the business have a bank account in the business’s own name?'},
            {'id': 'fin_3', 'text': 'Does the business have cash reserves set aside for a crisis?'},
            {'id': 'fin_4', 'text': 'Does the business keep financial accounts (paper or electronic)?'},
            {'id': 'fin_5', 'text': 'Does the business file statutory tax returns?'},
        ]
    },
    {
        'id': 'hr',
        'name': 'HR & Decent Work',
        'questions': [
            {'id': 'hr_1', 'text': 'Are individual staff roles/targets documented in writing?'},
            {'id': 'hr_2', 'text': 'Does the business have written employment contracts with employees?'},
            {'id': 'hr_3', 'text': 'Are there arrangements to protect workers from harassment/unfair treatment?'},
            {'id': 'hr_4', 'text': 'Does the business make NSSF contributions for staff?'},
            {'id': 'hr_5', 'text': 'Does the business provide health insurance for employees?'},
        ]
    },
    {
        'id': 'market',
        'name': 'Market & Customers',
        'questions': [
            {'id': 'mkt_1', 'text': 'Is the business revenue growing month by month?'},
            {'id': 'mkt_2', 'text': 'Does the business maintain a customer database or reward system?'},
            {'id': 'mkt_3', 'text': 'Does the business have a diversified customer base (not reliant on a single buyer)?'},
            {'id': 'mkt_4', 'text': "Has the business been involved in public procurement or supplies to government/institutions?"},
            {'id': 'mkt_5', 'text': 'Is the business able to produce/deliver enough to meet current market demand?'},
        ]
    },
    {
        'id': 'digital',
        'name': 'Digital & Technology',
        'questions': [
            {'id': 'dig_1', 'text': 'Does the business own computer-related hardware (including smartphones and internet router)?'},
            {'id': 'dig_2', 'text': 'Does the business have dedicated internet connectivity for operations?'},
            {'id': 'dig_3', 'text': 'Does the business use digital tools (website, online booking/deliveries, stock, payroll, management systems)?'},
            {'id': 'dig_4', 'text': 'Does the business use social media to promote products/services?'},
            {'id': 'dig_5', 'text': 'Is the business registered on an online trading/procurement platform?'},
            {'id': 'dig_6', 'text': 'Does the business make/receive digital payments (bank or mobile money)?'},
            {'id': 'dig_7', 'text': 'Does the business store and refer to data to inform decisions?'},
        ]
    },
    {
        'id': 'env',
        'name': 'Environmental Sustainability',
        'questions': [
            {'id': 'env_1', 'text': 'Has the business thought about its environmental impact?'},
            {'id': 'env_2', 'text': 'Does the business have an environmental management plan, and is it implemented?'},
            {'id': 'env_3', 'text': 'Does the business monitor its use of resources (water, energy, land, etc.)?'},
            {'id': 'env_4', 'text': 'Does the business practice waste management/recycling or energy efficiency measures?'},
            {'id': 'env_5', 'text': 'Does the business promote environmentally friendly practices among staff and suppliers?'},
        ]
    },
    {
        'id': 'regulatory',
        'name': 'Regulatory Compliance & Quality',
        'questions': [
            {'id': 'reg_1', 'text': 'Is the business able to meet applicable regulatory standards (e.g. Halal, Kosher, UNBS)?'},
            {'id': 'reg_2', 'text': 'Does the business maintain necessary operating licenses and sector permits?'},
            {'id': 'reg_3', 'text': 'Does the business have quality assurance or safety standards/certifications in place?'},
            {'id': 'reg_4', 'text': 'Does the business conduct regular compliance and standards reviews?'},
        ]
    },
]


def calculate_diagnostic(answers):
    """
    Given answers dict { question_id: 'Yes' | 'No' | 'N/A' },
    computes category metrics and overall priority.
    """
    categories_snapshot = {}
    total_gaps = 0
    total_applicable = 0

    for cat in TBIP_CATEGORIES:
        cat_name = cat['name']
        cat_questions = cat['questions']
        q_count = len(cat_questions)
        applicable = 0
        gaps = 0

        for q in cat_questions:
            ans = answers.get(q['id']) or answers.get(q['text'])
            if ans in ('Yes', 'No'):
                applicable += 1
                if ans == 'No':
                    gaps += 1

        if applicable == 0:
            cat_status = 'N/A'
            gap_pct = 0.0
        else:
            gap_pct = round((gaps / applicable) * 100, 1)
            if gaps == 0:
                cat_status = 'Satisfactory'
            elif gap_pct >= 50.0:
                cat_status = 'Critical Gap'
            else:
                cat_status = 'Needs Improvement'

        total_gaps += gaps
        total_applicable += applicable

        categories_snapshot[cat_name] = {
            'total_questions': q_count,
            'applicable': applicable,
            'gaps': gaps,
            'status': cat_status,
            'gap_pct': gap_pct,
            'ratio': f"{gaps} / {applicable}",
        }

    if total_applicable == 0:
        overall_priority = 'Low'
    else:
        overall_pct = (total_gaps / total_applicable) * 100
        if overall_pct >= 45.0 or total_gaps >= 8:
            overall_priority = 'High'
        elif overall_pct >= 20.0 or total_gaps >= 4:
            overall_priority = 'Medium'
        else:
            overall_priority = 'Low'

    return {
        'categories': categories_snapshot,
        'total_gaps': total_gaps,
        'total_applicable': total_applicable,
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
