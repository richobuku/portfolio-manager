from rest_framework import serializers
from ..models import PlannedVisit


class PlannedVisitSerializer(serializers.ModelSerializer):
    msme_name             = serializers.CharField(source='msme.business_name', read_only=True)
    msme_code             = serializers.CharField(source='msme.msme_code',     read_only=True)
    msme_district         = serializers.CharField(source='msme.district',      read_only=True)
    msme_sector           = serializers.CharField(source='msme.sector',        read_only=True)
    msme_owner_name       = serializers.CharField(source='msme.owner_name',   read_only=True)
    msme_phone            = serializers.CharField(source='msme.phone',        read_only=True)
    msme_email            = serializers.CharField(source='msme.email',        read_only=True)
    msme_latitude         = serializers.SerializerMethodField()
    msme_longitude        = serializers.SerializerMethodField()

    bge_name              = serializers.CharField(source='bge.name',           read_only=True)
    bge_code              = serializers.CharField(source='bge.bge_code',       read_only=True)
    bge_phone             = serializers.CharField(source='bge.phone',          read_only=True)
    bge_location          = serializers.CharField(source='bge.location',       read_only=True)

    visit_type_display    = serializers.CharField(source='get_visit_type_display',    read_only=True)
    status_display        = serializers.CharField(source='get_status_display',        read_only=True)
    missed_reason_display = serializers.CharField(source='get_missed_reason_display', read_only=True)
    meeting_venue_display = serializers.CharField(source='get_meeting_venue_display', read_only=True)

    missed_recorded_by_name    = serializers.SerializerMethodField()
    created_by_name            = serializers.SerializerMethodField()
    google_sync_status_display = serializers.CharField(source='get_google_sync_status_display', read_only=True)

    def get_msme_latitude(self, obj):
        return float(obj.msme.latitude) if obj.msme and obj.msme.latitude is not None else None

    def get_msme_longitude(self, obj):
        return float(obj.msme.longitude) if obj.msme and obj.msme.longitude is not None else None

    def get_missed_recorded_by_name(self, obj):
        if not obj.missed_recorded_by:
            return None
        return obj.missed_recorded_by.get_full_name().strip() or obj.missed_recorded_by.username

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name().strip() or obj.created_by.username

    def validate(self, attrs):
        # If status is being marked as missed, require missed_reason
        status_val = attrs.get('status', getattr(self.instance, 'status', None))
        missed_reason = attrs.get('missed_reason', getattr(self.instance, 'missed_reason', ''))
        if status_val == 'missed' and not missed_reason:
            raise serializers.ValidationError({
                'missed_reason': 'A reason is required when marking a visit as missed.'
            })
        return attrs

    class Meta:
        model = PlannedVisit
        fields = '__all__'
        read_only_fields = ['created_by', 'created_at', 'updated_at', 'missed_at', 'missed_recorded_by']
