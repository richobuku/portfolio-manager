from rest_framework import serializers
from .models import (
    Portfolio, Investment, Transaction,
    MSME, BusinessGrowthExpert, SupportRequest,
    TrainingSession, Attendance, TrainingTopic,
    Cohort, BGEGroup, MSMEReport, GroupReport, GroupReportContribution, WorkOrder,
    GroupReportAttendance, ProgrammeGroup, MSMEGrowthSnapshot, VisitReportTemplate,
)


class ProgrammeGroupSerializer(serializers.ModelSerializer):
    msme_count = serializers.SerializerMethodField()

    class Meta:
        model = ProgrammeGroup
        fields = '__all__'

    def get_msme_count(self, obj):
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
        return obj.msmes.filter(is_active=True).count()


class MSMESerializer(serializers.ModelSerializer):
    cohort_name = serializers.CharField(source='cohort.name', read_only=True)
    assigned_bge_name = serializers.CharField(source='assigned_bge.name', read_only=True)
    assigned_group_name = serializers.CharField(source='assigned_group.name', read_only=True)
    assigned_group_objectives = serializers.CharField(source='assigned_group.objectives', read_only=True)
    total_reports = serializers.SerializerMethodField()
    last_support_date = serializers.SerializerMethodField()
    programme_groups_detail = ProgrammeGroupSerializer(source='programme_groups', many=True, read_only=True)

    class Meta:
        model = MSME
        fields = '__all__'

    def get_total_reports(self, obj):
        individual = obj.reports.count()
        group = obj.group_reports.count()
        return individual + group

    def get_last_support_date(self, obj):
        from datetime import date
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
    total_employees   = serializers.ReadOnlyField()
    female_employee_ratio = serializers.ReadOnlyField()

    class Meta:
        model  = MSMEGrowthSnapshot
        fields = '__all__'


class BusinessGrowthExpertSerializer(serializers.ModelSerializer):
    assigned_msme_count = serializers.SerializerMethodField()
    assigned_msmes_list = serializers.SerializerMethodField()
    group_names = serializers.SerializerMethodField()
    signature_url = serializers.SerializerMethodField()

    class Meta:
        model = BusinessGrowthExpert
        fields = '__all__'

    def get_assigned_msme_count(self, obj):
        # Use the prefetch cache when available (avoids a DB round-trip per BGE)
        if 'assigned_msmes' in getattr(obj, '_prefetched_objects_cache', {}):
            return sum(1 for m in obj.assigned_msmes.all() if m.is_active)
        return obj.assigned_msmes.filter(is_active=True).count()

    def get_assigned_msmes_list(self, obj):
        # Filter from the prefetch cache when available — re-querying with
        # .filter() would bypass the cache and cause N queries for N BGEs.
        if 'assigned_msmes' in getattr(obj, '_prefetched_objects_cache', {}):
            return [
                {
                    'id': m.id, 'business_name': m.business_name,
                    'msme_code': m.msme_code, 'business_type': m.business_type,
                    'sector': m.sector, 'city': m.city,
                    'assignment_objectives': m.assignment_objectives,
                    'assignment_date': str(m.assignment_date) if m.assignment_date else None,
                }
                for m in obj.assigned_msmes.all() if m.is_active
            ]
        return list(
            obj.assigned_msmes.filter(is_active=True)
            .values('id', 'business_name', 'msme_code', 'business_type', 'sector', 'city', 'assignment_objectives', 'assignment_date')
        )

    def get_group_names(self, obj):
        # Same pattern — use prefetch cache if available
        if 'bge_groups' in getattr(obj, '_prefetched_objects_cache', {}):
            return [g.name for g in obj.bge_groups.all()]
        return list(obj.bge_groups.values_list('name', flat=True))

    def get_signature_url(self, obj):
        if not obj.signature:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.signature.url)
        return obj.signature.url


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
        fields = '__all__'


class TrainingSessionSerializer(serializers.ModelSerializer):
    topic_name        = serializers.CharField(source='topic.name', read_only=True)
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True, allow_null=True)
    work_order_bge    = serializers.CharField(source='work_order.bge.name', read_only=True, allow_null=True)
    attendance_count  = serializers.SerializerMethodField()

    class Meta:
        model = TrainingSession
        fields = '__all__'

    def get_attendance_count(self, obj):
        return obj.attendances.filter(present=True).count()


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
    template_name = serializers.CharField(source='template.name',      read_only=True)

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

    class Meta:
        model = WorkOrder
        fields = '__all__'
        read_only_fields = ['work_order_number', 'created_at', 'updated_at']
