from rest_framework import serializers
from ..models import FinancialImprovementActionPlan, MSME, BusinessGrowthExpert


class FinancialImprovementActionPlanSerializer(serializers.ModelSerializer):
    msme_name = serializers.CharField(source='msme.business_name', read_only=True)
    msme_code = serializers.CharField(source='msme.msme_code', read_only=True)
    msme_sector = serializers.CharField(source='msme.sector', read_only=True)
    msme_district = serializers.CharField(source='msme.district', read_only=True)
    msme_location = serializers.SerializerMethodField()
    msme_owner_name = serializers.CharField(source='msme.owner_name', read_only=True)
    msme_phone = serializers.CharField(source='msme.contact_phone', read_only=True)
    
    bge_name = serializers.CharField(source='bge.name', read_only=True)
    bge_code = serializers.CharField(source='bge.bge_code', read_only=True)
    bge_phone = serializers.CharField(source='bge.phone', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = FinancialImprovementActionPlan
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'submitted_at']

    def get_msme_location(self, obj):
        m = obj.msme
        return m.address or m.district or '—'
