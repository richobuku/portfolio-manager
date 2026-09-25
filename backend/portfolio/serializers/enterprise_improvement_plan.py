from rest_framework import serializers
from ..models import EnterpriseImprovementPlan


class EnterpriseImprovementPlanSerializer(serializers.ModelSerializer):
    msme_name = serializers.CharField(source='msme.business_name', read_only=True)
    msme_code = serializers.CharField(source='msme.msme_code', read_only=True)
    bge_name = serializers.CharField(source='bge.name', read_only=True)
    bge_code = serializers.CharField(source='bge.bge_code', read_only=True)
    hoa_approved_by_name = serializers.SerializerMethodField()

    def get_hoa_approved_by_name(self, obj):
        if not obj.hoa_approved_by:
            return None
        name = obj.hoa_approved_by.get_full_name().strip()
        return name or obj.hoa_approved_by.username

    class Meta:
        model = EnterpriseImprovementPlan
        fields = '__all__'
        read_only_fields = ['bge', 'created_at', 'updated_at', 'submitted_at', 'hoa_approved_by', 'hoa_approved_at']
