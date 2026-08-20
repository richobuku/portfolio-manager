from rest_framework import serializers
from ..models import ProgrammeGroup, Cohort, MSME, MSMEGrowthSnapshot


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


class MSMEListSerializer(MSMESerializer):
    """Lightweight serializer for list endpoints — excludes large TextFields and
    all diag_* baseline columns that are only needed on the detail/edit view."""

    class Meta(MSMESerializer.Meta):
        fields = None  # clear parent's fields = '__all__' so exclude is honoured
        exclude = (
            # Long free-text fields not needed for list cards
            'business_description', 'challenges', 'opportunities',
            'assignment_objectives', 'address',
            # All diagnostic baseline fields (confirmed against model)
            'diag_annual_turnover', 'diag_total_assets',
            'diag_employees_ft_male', 'diag_employees_ft_female',
            'diag_employees_pt_male', 'diag_employees_pt_female',
            'diag_has_tin', 'diag_has_unbs',
            'diag_has_business_bank', 'diag_has_mobile_money',
            'diag_is_green_business', 'diag_green_categories',
            'diag_owner_sex', 'diag_owner_age',
            'diag_owner_education', 'diag_years_operating',
            'diag_district', 'diag_imported_at',
        )


class MSMEGrowthSnapshotSerializer(serializers.ModelSerializer):
    collected_by_name = serializers.CharField(source='collected_by.name', read_only=True)
    msme_name         = serializers.CharField(source='msme.business_name', read_only=True)
    total_employees   = serializers.ReadOnlyField()
    female_employee_ratio = serializers.ReadOnlyField()

    class Meta:
        model  = MSMEGrowthSnapshot
        fields = '__all__'
        # JSONFields (digital_tools, training_changes) are included via '__all__'
