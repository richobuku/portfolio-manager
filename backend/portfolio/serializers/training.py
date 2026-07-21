from rest_framework import serializers
from ..models import (
    TrainingTopic, TrainingSession, Attendance, VisitReportTemplate,
    TrainingFacilitationAssignment, TrainingReport, AnnualReviewReport,
    MentorTrainingReport,
)


class TrainingTopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingTopic
        fields = ['id', 'module_number', 'module_name', 'section_number', 'name', 'description']


class TrainingSessionSerializer(serializers.ModelSerializer):
    topic_name            = serializers.CharField(source='topic.name', read_only=True)
    topic_section_number  = serializers.CharField(source='topic.section_number', read_only=True, allow_null=True)
    attendance_count      = serializers.SerializerMethodField()
    businesses_detail     = serializers.SerializerMethodField()
    bge_participants_detail = serializers.SerializerMethodField()
    team                  = serializers.SerializerMethodField()
    lead_bge_name         = serializers.SerializerMethodField()

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

    def get_bge_participants_detail(self, obj):
        return [
            {'id': b.id, 'name': b.name, 'bge_code': b.bge_code or ''}
            for b in obj.bge_participants.all()
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
