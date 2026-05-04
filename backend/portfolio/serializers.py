from rest_framework import serializers
from .models import (
    Portfolio, Investment, Transaction,
    MSME, BusinessGrowthExpert, SupportRequest,
    TrainingSession, Attendance, TrainingTopic,
    Cohort, BGEGroup, MSMEReport,
)


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

    class Meta:
        model = MSME
        fields = '__all__'


class BusinessGrowthExpertSerializer(serializers.ModelSerializer):
    assigned_msme_count = serializers.SerializerMethodField()
    assigned_msmes_list = serializers.SerializerMethodField()
    group_names = serializers.SerializerMethodField()

    class Meta:
        model = BusinessGrowthExpert
        fields = '__all__'

    def get_assigned_msme_count(self, obj):
        return obj.assigned_msmes.filter(is_active=True).count()

    def get_assigned_msmes_list(self, obj):
        return list(
            obj.assigned_msmes.filter(is_active=True)
            .values('id', 'business_name', 'msme_code', 'business_type', 'sector', 'city', 'assignment_objectives', 'assignment_date')
        )

    def get_group_names(self, obj):
        return list(obj.bge_groups.values_list('name', flat=True))


class BGEGroupSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    members_detail = BusinessGrowthExpertSerializer(source='members', many=True, read_only=True)

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
    topic_name = serializers.CharField(source='topic.name', read_only=True)
    attendance_count = serializers.SerializerMethodField()

    class Meta:
        model = TrainingSession
        fields = '__all__'

    def get_attendance_count(self, obj):
        return obj.attendances.filter(present=True).count()


class AttendanceSerializer(serializers.ModelSerializer):
    msme_name = serializers.CharField(source='msme.business_name', read_only=True)
    session_title = serializers.CharField(source='session.title', read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'


class MSMEReportSerializer(serializers.ModelSerializer):
    msme_name = serializers.CharField(source='msme.business_name', read_only=True)
    msme_code = serializers.CharField(source='msme.msme_code', read_only=True)
    bge_name = serializers.CharField(source='bge.name', read_only=True)

    class Meta:
        model = MSMEReport
        fields = '__all__'
        read_only_fields = ['bge', 'created_at', 'updated_at']
