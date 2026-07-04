from rest_framework import serializers
from ..models import ScheduledMessage


class ScheduledMessageSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ScheduledMessage
        fields = [
            'id', 'channel', 'recipient_type', 'recipient_ids',
            'subject', 'body', 'skip_already_sent',
            'scheduled_at', 'status', 'recipient_count',
            'created_by', 'created_by_name', 'created_at',
            'sent_at', 'error',
        ]
        read_only_fields = ['status', 'created_by', 'created_at', 'sent_at', 'error']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username
