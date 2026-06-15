from rest_framework import serializers
from .models import (
    Portfolio, Investment, Transaction,
    MSME, BusinessGrowthExpert, SupportRequest,
    TrainingSession, Attendance, TrainingTopic,
    Cohort, BGEGroup, MSMEReport, GroupReport, GroupReportContribution, WorkOrder,
    GroupReportAttendance, ProgrammeGroup, MSMEGrowthSnapshot, VisitReportTemplate,
    TrainingFacilitationAssignment, TrainingReport, AnnualReviewReport,
    MentorTrainingReport, TshirtReceipt, TshirtReceiptEntry,
    WorkOrderSubmission, WorkOrderPayment,
)


class ProgrammeGroupSerializer(serializers.ModelSerializer):
    msme_count = serializers.SerializerMethodField()

    class Meta:
        model = ProgrammeGroup
        fields = '__all__'

    def get_msme_count(self, obj):
        # Use DB-level annotation when available (N+1 fix: avoids a COUNT per row)
        if hasattr(obj, '_msme_count'):
            return obj._msme_count
        return obj.msmes.count()


class PortfolioSerializer(serializers.ModelSerializer):
    total_value = serializers.ReadOnlyField()
    total_cost = serializers.ReadOnlyField()
    total_return = serializers.ReadOnlyField()
    total_return_percentage = serializers.ReadOnlyField()
    investment_count = serializers.SerializerMethodField()

    class Meta:
        model = Portfolio
        fields = '__all__'

    def get_investment_count(self, obj):
        return obj.investments.count()


class InvestmentSerializer(serializers.ModelSerializer):
    current_value = serializers.ReadOnlyField()
    total_cost = serializers.ReadOnlyField()
    total_return = serializers.ReadOnlyField()
    total_return_percentage = serializers.ReadOnlyField()

    class Meta:
        model = Investment
        fields = '__all__'


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'


class CohortSerializer(serializers.ModelSerializer):
    msme_count = serializers.SerializerMethodField()

    class Meta:
        model = Cohort
        fields = '__all__'

    def get_msme_count(self, obj):
        # Use DB-level annotation when available (N+1 fix)
        if hasattr(obj, '_msme_count'):
            return obj._msme_count
        return obj.msmes.filter(is_active=True).count()


class MSMESerializer(serializers.ModelSerializer):
    cohort_name = serializers.CharField(source='cohort.name', read_only=True)
    assigned_bge_name = serializers.CharField(source='assigned_bge.name', read_only=True, allow_null=True)
    assigned_group_name = serializers.CharField(source='assigned_group.name', read_only=True, allow_null=True)
    assigned_group_objectives = serializers.CharField(source='assigned_group.objectives', read_only=True, allow_null=True)
    co_assigned_bge_names = serializers.SerializerMethodField()
    total_reports = serializers.SerializerMethodField()
    last_support_date = serializers.SerializerMethodField()
    programme_groups_detail = ProgrammeGroupSerializer(source='programme_groups', many=True, read_only=True)

    class Meta:
        model = MSME
        fields = '__all__'

    # Assignment/relationship fields managed via the dedicated admin actions
    # (assign_bge, assign_cohort, set_groups) — a BGE editing their own assigned
    # MSME's profile data must not be able to reassign it, change its cohort/
    # programme groups, or toggle is_active via a generic PATCH.
    ADMIN_ONLY_FIELDS = (
        'assigned_bge', 'co_assigned_bges', 'cohort', 'programme_groups',
        'assigned_group', 'is_active', 'assignment_objectives', 'assignment_date',
    )

    def update(self, instance, validated_data):
        request = self.context.get('request')
        if request is not None:
            user = request.user
            is_admin_or_pm = (
                user.is_staff or user.is_superuser
                or hasattr(user, 'cohort_admin_profile')
            )
            if not is_admin_or_pm:
                for field in self.ADMIN_ONLY_FIELDS:
                    validated_data.pop(field, None)
        return super().update(instance, validated_data)

    def get_co_assigned_bge_names(self, obj):
        return [{'id': b.id, 'name': b.name, 'bge_code': b.bge_code} for b in obj.co_assigned_bges.all()]

    def get_total_reports(self, obj):
        # Use DB-level annotations when available (N+1 fix: avoids 2 COUNT queries per row)
        if hasattr(obj, '_reports_count') and hasattr(obj, '_group_reports_count'):
            return (obj._reports_count or 0) + (obj._group_reports_count or 0)
        return obj.reports.count() + obj.group_reports.count()

    def get_last_support_date(self, obj):
        # Use DB-level Max annotations when available (N+1 fix: avoids 2 subqueries per row)
        if hasattr(obj, '_last_individual_date'):
            dates = [d for d in [obj._last_individual_date, obj._last_group_date] if d]
            return str(max(dates)) if dates else None
        dates = []
        lr = obj.reports.order_by('-visit_date').values_list('visit_date', flat=True).first()
        if lr:
            dates.append(lr)
        gr = obj.group_reports.order_by('-visit_date').values_list('visit_date', flat=True).first()
        if gr:
            dates.append(gr)
        return str(max(dates)) if dates else None


class MSMEGrowthSnapshotSerializer(serializers.ModelSerializer):
    collected_by_name = serializers.CharField(source='collected_by.name', read_only=True)
    msme_name         = serializers.CharField(source='msme.business_name', read_only=True)
    total_employees   = serializers.ReadOnlyField()
    female_employee_ratio = serializers.ReadOnlyField()

    class Meta:
        model  = MSMEGrowthSnapshot
        fields = '__all__'
        # JSONFields (digital_tools, training_changes) are included via '__all__'


class BusinessGrowthExpertSerializer(serializers.ModelSerializer):
    assigned_msme_count = serializers.SerializerMethodField()
    assigned_msmes_list = serializers.SerializerMethodField()
    group_names = serializers.SerializerMethodField()
    signature_url = serializers.SerializerMethodField()

    class Meta:
        model = BusinessGrowthExpert
        fields = '__all__'
        # signature and signature_data are managed via the dedicated
        # upload-signature / rotate-signature endpoints only — sending them
        # as plain JSON in a PATCH causes Django to reject the request.
        read_only_fields = ('signature', 'signature_data')

    # Fields only an admin (staff/superuser) may set — a BGE editing their own
    # profile must not be able to self-approve, promote themselves to senior,
    # change their BGE code, or relink the account.
    ADMIN_ONLY_FIELDS = ('status', 'user', 'is_senior', 'bge_code', 'allow_concurrent_work_orders')

    def update(self, instance, validated_data):
        request = self.context.get('request')
        if request is not None:
            user = request.user
            if not (user.is_staff or user.is_superuser):
                for field in self.ADMIN_ONLY_FIELDS:
                    validated_data.pop(field, None)
        return super().update(instance, validated_data)

    def _all_msmes(self, obj):
        """Return combined queryset: primary assigned + co-assigned, deduped."""
        from django.db.models import Q
        from portfolio.models import MSME
        return MSME.objects.filter(
            Q(assigned_bge=obj) | Q(co_assigned_bges=obj),
            is_active=True,
        ).distinct().order_by('business_name')

    def get_assigned_msme_count(self, obj):
        return self._all_msmes(obj).count()

    def get_assigned_msmes_list(self, obj):
        rows = list(
            self._all_msmes(obj)
            .values('id', 'business_name', 'msme_code', 'business_type', 'sector', 'city',
                    'assignment_objectives', 'assignment_date', 'assigned_bge')
        )
        # Flag co-assigned so the UI can distinguish primary vs joint
        for row in rows:
            row['is_co_assigned'] = row.pop('assigned_bge') != obj.id
        return rows

    def get_group_names(self, obj):
        # Same pattern — use prefetch cache if available
        if 'bge_groups' in getattr(obj, '_prefetched_objects_cache', {}):
            return [g.name for g in obj.bge_groups.all()]
        return list(obj.bge_groups.values_list('name', flat=True))

    def get_signature_url(self, obj):
        if not (obj.signature_data or obj.signature):
            return None
        path = f'/api/experts/{obj.id}/signature-image/'
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(path)
        return path


class BGEGroupSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    members_detail = BusinessGrowthExpertSerializer(source='members', many=True, read_only=True)
    team_lead_name = serializers.CharField(source='team_lead.name', read_only=True)

    class Meta:
        model = BGEGroup
        fields = '__all__'

    def get_member_count(self, obj):
        return obj.members.count()


class SupportRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportRequest
        fields = '__all__'


class TrainingTopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingTopic
        fields = ['id', 'module_number', 'module_name', 'section_number', 'name', 'description']


class TrainingSessionSerializer(serializers.ModelSerializer):
    topic_name           = serializers.CharField(source='topic.name', read_only=True)
    topic_section_number = serializers.CharField(source='topic.section_number', read_only=True, allow_null=True)
    attendance_count     = serializers.SerializerMethodField()
    businesses_detail    = serializers.SerializerMethodField()
    team                 = serializers.SerializerMethodField()
    lead_bge_name        = serializers.SerializerMethodField()

    class Meta:
        model = TrainingSession
        fields = '__all__'

    def get_attendance_count(self, obj):
        return obj.attendances.filter(present=True).count()

    def get_businesses_detail(self, obj):
        return [
            {
                'id': m.id,
                'business_name': m.business_name,
                'owner_name': m.owner_name,
                'phone': m.phone or '',
                'sector': m.sector or '',
            }
            for m in obj.businesses.all()
        ]

    def get_team(self, obj):
        return [
            {
                'id': a.id,
                'role': a.role,
                'bge_id': a.bge_id,
                'bge_name': a.bge.name if a.bge_id else '',
                'bge_code': a.bge.bge_code if a.bge_id else '',
                'work_order_id': a.work_order_id,
                'work_order_number': a.work_order.work_order_number if a.work_order_id else '',
            }
            for a in obj.facilitation_assignments.select_related('bge', 'work_order').all()
        ]

    def get_lead_bge_name(self, obj):
        lead = next((a for a in obj.facilitation_assignments.all() if a.role == 'lead'), None)
        return lead.bge.name if lead and lead.bge_id else None

    attendance_stats = serializers.SerializerMethodField()

    def get_attendance_stats(self, obj):
        rows = list(obj.attendances.filter(present=True).values('gender', 'age_group', 'refugee_status'))
        total = len(rows)
        male   = sum(1 for r in rows if r['gender'] == 'M')
        female = sum(1 for r in rows if r['gender'] == 'F')
        youth_m  = sum(1 for r in rows if r['gender'] == 'M' and r['age_group'] == '18-34')
        youth_f  = sum(1 for r in rows if r['gender'] == 'F' and r['age_group'] == '18-34')
        adult_m  = sum(1 for r in rows if r['gender'] == 'M' and r['age_group'] != '18-34' and r['age_group'])
        adult_f  = sum(1 for r in rows if r['gender'] == 'F' and r['age_group'] != '18-34' and r['age_group'])
        refugee  = sum(1 for r in rows if r['refugee_status'] == 'R')
        host     = sum(1 for r in rows if r['refugee_status'] == 'H')
        age_groups = {}
        for r in rows:
            ag = r['age_group'] or 'Unknown'
            age_groups[ag] = age_groups.get(ag, 0) + 1
        return {
            'total_present': total,
            'male': male,
            'female': female,
            'youth_male': youth_m,
            'youth_female': youth_f,
            'adult_male': adult_m,
            'adult_female': adult_f,
            'refugee': refugee,
            'host_community': host,
            'age_groups': age_groups,
        }

    attendance_list = serializers.SerializerMethodField()

    def get_attendance_list(self, obj):
        return [
            {
                'id': a.id,
                'attendee_name': a.attendee_name,
                'attendee_phone': a.attendee_phone,
                'msme_name': a.msme.business_name if a.msme_id else '',
                'gender': a.gender,
                'age_group': a.age_group,
                'refugee_status': a.refugee_status,
                'present': a.present,
            }
            for a in obj.attendances.select_related('msme').order_by('attendee_name')
        ]


class AttendanceSerializer(serializers.ModelSerializer):
    msme_name    = serializers.CharField(source='msme.business_name', read_only=True, allow_null=True)
    msme_code    = serializers.CharField(source='msme.msme_code',     read_only=True, allow_null=True)
    msme_owner   = serializers.CharField(source='msme.owner_name',    read_only=True, allow_null=True)
    msme_phone   = serializers.CharField(source='msme.phone',         read_only=True, allow_null=True)
    session_title = serializers.CharField(source='session.title',     read_only=True)
    session_date  = serializers.DateField(source='session.date',      read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'


class VisitReportTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VisitReportTemplate
        fields = '__all__'


class MSMEReportSerializer(serializers.ModelSerializer):
    msme_name     = serializers.CharField(source='msme.business_name', read_only=True)
    msme_code     = serializers.CharField(source='msme.msme_code',     read_only=True)
    bge_name      = serializers.CharField(source='bge.name',           read_only=True)
    template_name = serializers.SerializerMethodField()

    def get_template_name(self, obj):
        return obj.template.name if obj.template_id else None

    class Meta:
        model = MSMEReport
        fields = '__all__'
        read_only_fields = ['bge', 'created_at', 'updated_at']


class GroupReportSerializer(serializers.ModelSerializer):
    group_name      = serializers.CharField(source='group.name', read_only=True)
    group_objectives= serializers.CharField(source='group.objectives', read_only=True)
    team_lead_name  = serializers.CharField(source='team_lead.name', read_only=True)
    msme_count      = serializers.SerializerMethodField()
    msmes_detail    = serializers.SerializerMethodField()
    attendees_detail   = serializers.SerializerMethodField()
    contributions_detail = serializers.SerializerMethodField()

    class Meta:
        model = GroupReport
        fields = '__all__'
        read_only_fields = ['team_lead', 'created_at', 'updated_at',
                            'submitted_at', 'approved_at']

    def get_msme_count(self, obj):
        return obj.msmes_supported.count()

    def get_msmes_detail(self, obj):
        return [
            {'id': m.id, 'business_name': m.business_name, 'msme_code': m.msme_code}
            for m in obj.msmes_supported.all()[:50]
        ]

    def get_attendees_detail(self, obj):
        return [
            {'id': bge.id, 'name': bge.name, 'bge_code': bge.bge_code}
            for bge in obj.attendees.all()
        ]

    def get_contributions_detail(self, obj):
        # Light summary so the team lead's dialog can render contribution cards
        # without a second round-trip; the dedicated contribution endpoint
        # serves the full notes when the lead clicks one.
        return [
            {
                'id':              c.id,
                'bge_id':          c.bge_id,
                'bge_name':        c.bge.name,
                'updated_at':      c.updated_at.isoformat() if c.updated_at else None,
                'has_notes':       bool((c.notes or '').strip()),
                'msmes_observed':  list(c.msmes_observed.values_list('id', flat=True)),
            }
            for c in obj.contributions.select_related('bge').prefetch_related('msmes_observed')
        ]


class GroupReportContributionSerializer(serializers.ModelSerializer):
    bge_name      = serializers.CharField(source='bge.name', read_only=True)
    bge_code      = serializers.CharField(source='bge.bge_code', read_only=True)
    group_name    = serializers.CharField(source='group_report.group.name', read_only=True)
    group_id      = serializers.IntegerField(source='group_report.group_id', read_only=True)

    class Meta:
        model = GroupReportContribution
        fields = '__all__'
        read_only_fields = ['bge', 'created_at', 'updated_at']


class GroupReportAttendanceSerializer(serializers.ModelSerializer):
    msme_name   = serializers.CharField(source='msme.business_name', read_only=True, allow_null=True)
    msme_code   = serializers.CharField(source='msme.msme_code',     read_only=True, allow_null=True)

    class Meta:
        model = GroupReportAttendance
        fields = '__all__'
        read_only_fields = ['created_at']


class WorkOrderSerializer(serializers.ModelSerializer):
    bge_name         = serializers.CharField(source='bge.name', read_only=True)
    bge_code_display = serializers.CharField(source='bge.bge_code', read_only=True)
    group_name       = serializers.CharField(source='group.name', read_only=True, allow_null=True)
    work_order_type_display = serializers.CharField(source='get_work_order_type_display', read_only=True)
    status_display   = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name  = serializers.SerializerMethodField()
    amount_due       = serializers.SerializerMethodField()
    total_paid       = serializers.SerializerMethodField()
    outstanding      = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        name = obj.created_by.get_full_name().strip()
        return name or obj.created_by.username

    def get_amount_due(self, obj):
        gross = obj.rate_per_day * obj.max_days
        return gross - int(gross * 0.06)

    def get_total_paid(self, obj):
        from django.db.models import Sum
        total = obj.payments.aggregate(total=Sum('amount'))['total']
        return total or 0

    def get_outstanding(self, obj):
        return self.get_amount_due(obj) - float(self.get_total_paid(obj))

    class Meta:
        model = WorkOrder
        fields = '__all__'
        read_only_fields = ['work_order_number', 'created_at', 'updated_at', 'created_by']


class TrainingFacilitationAssignmentSerializer(serializers.ModelSerializer):
    bge_name             = serializers.CharField(source='bge.name', read_only=True)
    bge_code             = serializers.CharField(source='bge.bge_code', read_only=True)
    topic_name           = serializers.CharField(source='topic.name', read_only=True)
    topic_section_number = serializers.CharField(source='topic.section_number', read_only=True)
    topic_module_number  = serializers.IntegerField(source='topic.module_number', read_only=True)
    topic_module_name    = serializers.CharField(source='topic.module_name', read_only=True)
    assigned_by_name     = serializers.CharField(source='assigned_by.get_full_name', read_only=True, allow_null=True)
    work_order_number    = serializers.CharField(source='work_order.work_order_number', read_only=True, allow_null=True)
    session_title        = serializers.CharField(source='session.title', read_only=True, allow_null=True)
    session_date         = serializers.DateField(source='session.date', read_only=True, allow_null=True)

    class Meta:
        model = TrainingFacilitationAssignment
        fields = '__all__'
        read_only_fields = ['created_at']


class TrainingReportSerializer(serializers.ModelSerializer):
    session_title    = serializers.CharField(source='session.title', read_only=True)
    session_date     = serializers.DateField(source='session.date', read_only=True)
    session_location = serializers.CharField(source='session.location', read_only=True)
    bge_name         = serializers.CharField(source='bge.name', read_only=True, allow_null=True)
    total_participants = serializers.IntegerField(read_only=True)

    class Meta:
        model  = TrainingReport
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'submitted_at']


class AnnualReviewReportSerializer(serializers.ModelSerializer):
    bge_name    = serializers.CharField(source='bge.name', read_only=True)
    msme_count  = serializers.SerializerMethodField()
    msmes_detail = serializers.SerializerMethodField()

    class Meta:
        model  = AnnualReviewReport
        fields = '__all__'
        read_only_fields = ['bge', 'created_at', 'updated_at', 'submitted_at']

    def get_msme_count(self, obj):
        return obj.msmes_reviewed.count()

    def get_msmes_detail(self, obj):
        return [
            {'id': m.id, 'business_name': m.business_name, 'msme_code': m.msme_code}
            for m in obj.msmes_reviewed.all()
        ]


class MentorTrainingReportSerializer(serializers.ModelSerializer):
    bge_name         = serializers.CharField(source='bge.name', read_only=True, allow_null=True)
    session_title    = serializers.CharField(source='session.title', read_only=True)
    session_date     = serializers.DateField(source='session.date', read_only=True)
    session_location = serializers.CharField(source='session.location', read_only=True)
    lead_bge_name    = serializers.SerializerMethodField()
    session_msmes    = serializers.SerializerMethodField()
    session_attendance = serializers.SerializerMethodField()

    class Meta:
        model  = MentorTrainingReport
        fields = '__all__'
        read_only_fields = ['bge', 'created_at', 'updated_at', 'submitted_at']

    def get_lead_bge_name(self, obj):
        lead = obj.session.facilitation_assignments.filter(role='lead').select_related('bge').first()
        return lead.bge.name if lead and lead.bge_id else None

    def get_session_msmes(self, obj):
        return [
            {'id': m.id, 'business_name': m.business_name, 'owner_name': m.owner_name or ''}
            for m in obj.session.businesses.all()
        ]

    def get_session_attendance(self, obj):
        return [
            {
                'id': a.id,
                'attendee_name': a.attendee_name,
                'attendee_phone': a.attendee_phone,
                'gender': a.gender,
                'age_group': a.age_group,
                'present': a.present,
                'msme_name': a.msme.business_name if a.msme else '',
            }
            for a in obj.session.attendances.order_by('attendee_name')
        ]


# ── T-Shirt Receipt serializers ────────────────────────────────────────────

class TshirtReceiptEntrySerializer(serializers.ModelSerializer):
    bge_name       = serializers.CharField(source='bge.name',     read_only=True)
    bge_code       = serializers.CharField(source='bge.bge_code', read_only=True)
    bge_phone      = serializers.CharField(source='bge.phone',    read_only=True)
    bge_location   = serializers.CharField(source='bge.location', read_only=True)
    has_signature  = serializers.SerializerMethodField()
    receipt_title  = serializers.CharField(source='receipt.title',  read_only=True)
    receipt_colour = serializers.CharField(source='receipt.colour', read_only=True)
    receipt_id     = serializers.IntegerField(source='receipt.id',  read_only=True)

    class Meta:
        model  = TshirtReceiptEntry
        fields = [
            'id', 'receipt', 'receipt_id', 'receipt_title', 'receipt_colour',
            'bge', 'bge_name', 'bge_code', 'bge_phone',
            'bge_location', 'size', 'quantity', 'signed', 'signed_at',
            'order', 'has_signature',
        ]
        read_only_fields = ['signed', 'signed_at']

    def get_has_signature(self, obj):
        return bool(obj.bge.signature_data or obj.bge.signature)


class TshirtReceiptSerializer(serializers.ModelSerializer):
    entries         = TshirtReceiptEntrySerializer(many=True, read_only=True)
    total_entries   = serializers.IntegerField(read_only=True)
    signed_count    = serializers.IntegerField(read_only=True)
    fully_signed    = serializers.BooleanField(read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = TshirtReceipt
        fields = [
            'id', 'title', 'event', 'colour', 'notes',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'entries', 'total_entries', 'signed_count', 'fully_signed',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else None


# ── Work Order Timesheet & Invoice Submissions ────────────────────────────

class WorkOrderSubmissionSerializer(serializers.ModelSerializer):
    bge_name           = serializers.CharField(source='bge.name', read_only=True)
    bge_code           = serializers.CharField(source='bge.bge_code', read_only=True)
    work_order_number  = serializers.CharField(source='work_order.work_order_number', read_only=True)
    uploaded_by_name   = serializers.SerializerMethodField()
    has_timesheet      = serializers.SerializerMethodField()
    has_invoice        = serializers.SerializerMethodField()

    timesheet = serializers.FileField(write_only=True, required=False, allow_null=True)
    invoice   = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = WorkOrderSubmission
        fields = [
            'id', 'work_order', 'work_order_number', 'bge', 'bge_name', 'bge_code',
            'timesheet_filename', 'invoice_filename', 'has_timesheet', 'has_invoice',
            'timesheet', 'invoice',
            'uploaded_by', 'uploaded_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'bge', 'timesheet_filename', 'invoice_filename',
            'uploaded_by', 'created_at', 'updated_at',
        ]

    def get_uploaded_by_name(self, obj):
        if not obj.uploaded_by:
            return None
        return obj.uploaded_by.get_full_name().strip() or obj.uploaded_by.username

    def get_has_timesheet(self, obj):
        return bool(obj.timesheet_data)

    def get_has_invoice(self, obj):
        return bool(obj.invoice_data)


# ── Work Order Payment Tracking ────────────────────────────────────────────

class WorkOrderPaymentSerializer(serializers.ModelSerializer):
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    bge_name           = serializers.CharField(source='work_order.bge.name', read_only=True)
    recorded_by_name   = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderPayment
        fields = [
            'id', 'work_order', 'work_order_number', 'bge_name',
            'amount', 'payment_date', 'reference', 'notes',
            'recorded_by', 'recorded_by_name', 'created_at',
            'notified_at', 'confirmed_by_bge', 'confirmed_at',
        ]
        read_only_fields = ['recorded_by', 'created_at', 'notified_at', 'confirmed_by_bge', 'confirmed_at']

    def get_recorded_by_name(self, obj):
        if not obj.recorded_by:
            return None
        return obj.recorded_by.get_full_name().strip() or obj.recorded_by.username
