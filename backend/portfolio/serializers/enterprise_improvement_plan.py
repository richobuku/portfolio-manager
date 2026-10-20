from rest_framework import serializers
from ..models import EnterpriseImprovementPlan, EnterpriseImprovementPlanMeeting


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


class EnterpriseImprovementPlanMeetingSerializer(serializers.ModelSerializer):
    msme_name = serializers.SerializerMethodField()
    msme_code = serializers.CharField(source='msme.msme_code', read_only=True)
    bge_name = serializers.CharField(source='bge.name', read_only=True)
    google_calendar_url = serializers.SerializerMethodField()
    coaches = serializers.SerializerMethodField()
    requester_name = serializers.CharField(required=False, allow_blank=True)
    requester_email = serializers.EmailField(required=False, allow_blank=True)

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if not attrs.get('requester_name'):
            if user and user.is_authenticated:
                attrs['requester_name'] = user.get_full_name() or user.username
            else:
                attrs['requester_name'] = 'BGE Specialist'
        if not attrs.get('requester_email'):
            if user and user.is_authenticated and user.email:
                attrs['requester_email'] = user.email
            elif user and hasattr(user, 'bge_profile') and getattr(user.bge_profile, 'email', None):
                attrs['requester_email'] = user.bge_profile.email
            else:
                attrs['requester_email'] = 'requester@prudev.org'
        return attrs

    def get_msme_name(self, obj):
        if not obj.msme:
            return ''
        return obj.msme.business_name or obj.msme.name

    def get_google_calendar_url(self, obj):
        from ..tbip_meeting_service import build_google_calendar_url
        try:
            return build_google_calendar_url(obj)
        except Exception:
            return ''

    def get_coaches(self, obj):
        from ..tbip_meeting_service import get_coach_recipients
        return get_coach_recipients()

    class Meta:
        model = EnterpriseImprovementPlanMeeting
        fields = '__all__'
        read_only_fields = [
            'requested_by', 'calendar_event_uid', 'email_sent',
            'email_sent_at', 'email_error', 'created_at', 'updated_at',
        ]


