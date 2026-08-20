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
        # Exclude signature_data — it's a raw binary blob that bloats every BGE
        # list payload.  The derived signature_url field is the display handle;
        # the dedicated upload/rotate endpoints manage the data itself.
        exclude = ('signature_data',)
        read_only_fields = ('signature',)

    # Fields only an admin (staff/superuser) may set — a BGE editing their own
    # profile must not be able to self-approve, promote themselves to senior,
    # change their BGE code, or relink the account.
    ADMIN_ONLY_FIELDS = ('status', 'user', 'is_senior', 'bge_code')

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        for field in ('latitude', 'longitude'):
            val = data.get(field)
            if val not in (None, '', 'null'):
                try:
                    data[field] = round(float(val), 6)
                except (ValueError, TypeError):
                    pass
        return super().to_internal_value(data)

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
        # Use DB-level annotation when the viewset provides it (no extra query).
        if hasattr(obj, '_assigned_msme_count'):
            return obj._assigned_msme_count
        return self._all_msmes(obj).count()

    def get_assigned_msmes_list(self, obj):
        # Fast path: use prefetch caches set by the viewset Prefetch objects.
        # Covers primary + co-assigned in 0 extra queries; group-assigned still
        # handled by the fallback queryset below so nothing is silently dropped.
        if hasattr(obj, '_primary_msmes') and hasattr(obj, '_co_assigned_msmes'):
            seen = set()
            rows = []
            for m in obj._primary_msmes:
                seen.add(m.id)
                rows.append(self._msme_row(m, is_co=False))
            for m in obj._co_assigned_msmes:
                if m.id not in seen:
                    seen.add(m.id)
                    rows.append(self._msme_row(m, is_co=True))
            rows.sort(key=lambda r: r['business_name'])
            return rows
        # Fallback: original queryset path (used when prefetch caches are absent)
        raw = list(
            self._all_msmes(obj)
            .values('id', 'business_name', 'msme_code', 'business_type', 'sector', 'city',
                    'assignment_objectives', 'assignment_date', 'assigned_bge')
        )
        for row in raw:
            row['is_co_assigned'] = row.pop('assigned_bge') != obj.id
        return raw

    @staticmethod
    def _msme_row(m, *, is_co):
        return {
            'id': m.id,
            'business_name': m.business_name,
            'msme_code': m.msme_code,
            'business_type': m.business_type,
            'sector': m.sector,
            'city': m.city,
            'assignment_objectives': m.assignment_objectives,
            'assignment_date': str(m.assignment_date) if m.assignment_date else None,
            'is_co_assigned': is_co,
        }

    def get_group_names(self, obj):
        # Same pattern — use prefetch cache if available
        if 'bge_groups' in getattr(obj, '_prefetched_objects_cache', {}):
            return [g.name for g in obj.bge_groups.all()]
        return list(obj.bge_groups.values_list('name', flat=True))

    def get_signature_url(self, obj):
        if not obj.signature_data:
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
