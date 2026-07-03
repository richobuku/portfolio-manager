from rest_framework import serializers
from ..models import TshirtReceiptEntry, TshirtReceipt


class TshirtReceiptEntrySerializer(serializers.ModelSerializer):
    bge_name       = serializers.CharField(source='bge.name',     read_only=True)
    bge_code       = serializers.CharField(source='bge.bge_code', read_only=True)
    bge_phone      = serializers.CharField(source='bge.phone',    read_only=True)
    bge_location   = serializers.CharField(source='bge.location', read_only=True)
    has_signature  = serializers.SerializerMethodField()
    receipt_title  = serializers.CharField(source='receipt.title',  read_only=True)
    receipt_colour = serializers.CharField(source='receipt.colour', read_only=True)
    receipt_id     = serializers.IntegerField(source='receipt.id',  read_only=True)

    class Meta:
        model  = TshirtReceiptEntry
        fields = [
            'id', 'receipt', 'receipt_id', 'receipt_title', 'receipt_colour',
            'bge', 'bge_name', 'bge_code', 'bge_phone',
            'bge_location', 'size', 'quantity', 'signed', 'signed_at',
            'order', 'has_signature',
        ]
        read_only_fields = ['signed', 'signed_at']

    def get_has_signature(self, obj):
        return bool(obj.bge.signature_data or obj.bge.signature)


class TshirtReceiptSerializer(serializers.ModelSerializer):
    entries         = TshirtReceiptEntrySerializer(many=True, read_only=True)
    total_entries   = serializers.IntegerField(read_only=True)
    signed_count    = serializers.IntegerField(read_only=True)
    fully_signed    = serializers.BooleanField(read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = TshirtReceipt
        fields = [
            'id', 'title', 'event', 'colour', 'notes',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'entries', 'total_entries', 'signed_count', 'fully_signed',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else None
