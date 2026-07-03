from django.db.models import Q
from rest_framework import serializers
from ..models import BusinessGrowthExpert, BGEGroup, SupportRequest


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
    ADMIN_ONLY_FIELDS = ('status', 'user', 'is_senior', 'bge_code')

    def update(self, instance, validated_data):
        request = self.context.get('request')
        if request is not None:
            user = request.user
            if not (user.is_staff or user.is_superuser):
                for field in self.ADMIN_ONLY_FIELDS:
                    validated_data.pop(field, None)
        return super().update(instance, validated_data)

    def _all_msmes(self, obj):
        """Return combined queryset: primary assigned + co-assigned + group-assigned, deduped."""
        from portfolio.models import MSME
        return MSME.objects.filter(
            Q(assigned_bge=obj) |
            Q(co_assigned_bges=obj) |
            Q(assigned_group__members=obj),
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
