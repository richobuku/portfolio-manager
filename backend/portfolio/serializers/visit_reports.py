from rest_framework import serializers
from ..models import MSMEReport, GroupReport, GroupReportContribution, GroupReportAttendance


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
