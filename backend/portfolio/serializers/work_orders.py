from rest_framework import serializers
from ..models import WorkOrder, WorkOrderSubmission, WorkOrderPayment, WorkOrderAttachment


class WorkOrderSerializer(serializers.ModelSerializer):
    bge_name         = serializers.CharField(source='bge.name', read_only=True)
    bge_code_display = serializers.CharField(source='bge.bge_code', read_only=True)
    group_name       = serializers.CharField(source='group.name', read_only=True, allow_null=True)
    work_order_type_display = serializers.CharField(source='get_work_order_type_display', read_only=True)
    status_display   = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name  = serializers.SerializerMethodField()
    amount_due       = serializers.SerializerMethodField()
    total_paid       = serializers.SerializerMethodField()
    outstanding      = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        name = obj.created_by.get_full_name().strip()
        return name or obj.created_by.username

    def get_amount_due(self, obj):
        gross = obj.rate_per_day * obj.max_days
        return gross - int(gross * 0.06)

    def get_total_paid(self, obj):
        from django.db.models import Sum
        total = obj.payments.aggregate(total=Sum('amount'))['total']
        return total or 0

    def get_outstanding(self, obj):
        return self.get_amount_due(obj) - float(self.get_total_paid(obj))

    class Meta:
        model = WorkOrder
        fields = '__all__'
        read_only_fields = ['work_order_number', 'created_at', 'updated_at', 'created_by']


class WorkOrderSubmissionSerializer(serializers.ModelSerializer):
    bge_name           = serializers.CharField(source='bge.name', read_only=True)
    bge_code           = serializers.CharField(source='bge.bge_code', read_only=True)
    work_order_number  = serializers.CharField(source='work_order.work_order_number', read_only=True)
    uploaded_by_name   = serializers.SerializerMethodField()
    has_timesheet      = serializers.SerializerMethodField()
    has_invoice        = serializers.SerializerMethodField()

    timesheet = serializers.FileField(write_only=True, required=False, allow_null=True)
    invoice   = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = WorkOrderSubmission
        fields = [
            'id', 'work_order', 'work_order_number', 'bge', 'bge_name', 'bge_code',
            'timesheet_filename', 'invoice_filename', 'has_timesheet', 'has_invoice',
            'timesheet', 'invoice',
            'uploaded_by', 'uploaded_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'bge', 'timesheet_filename', 'invoice_filename',
            'uploaded_by', 'created_at', 'updated_at',
        ]

    def get_uploaded_by_name(self, obj):
        if not obj.uploaded_by:
            return None
        return obj.uploaded_by.get_full_name().strip() or obj.uploaded_by.username

    def get_has_timesheet(self, obj):
        return bool(obj.timesheet_data)

    def get_has_invoice(self, obj):
        return bool(obj.invoice_data)


class WorkOrderAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    file_upload      = serializers.FileField(write_only=True, required=True)
    content_type     = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderAttachment
        fields = [
            'id', 'work_order', 'filename', 'caption', 'content_type',
            'uploaded_by', 'uploaded_by_name', 'created_at', 'file_upload',
        ]
        read_only_fields = ['filename', 'uploaded_by', 'created_at']

    def get_uploaded_by_name(self, obj):
        if not obj.uploaded_by:
            return None
        return obj.uploaded_by.get_full_name().strip() or obj.uploaded_by.username

    def get_content_type(self, obj):
        name = (obj.filename or '').lower()
        if name.endswith(('.jpg', '.jpeg')):
            return 'image/jpeg'
        if name.endswith('.png'):
            return 'image/png'
        if name.endswith('.gif'):
            return 'image/gif'
        if name.endswith('.webp'):
            return 'image/webp'
        if name.endswith('.pdf'):
            return 'application/pdf'
        return 'application/octet-stream'


class WorkOrderPaymentSerializer(serializers.ModelSerializer):
    work_order_number = serializers.CharField(source='work_order.work_order_number', read_only=True)
    bge_name           = serializers.CharField(source='work_order.bge.name', read_only=True)
    recorded_by_name   = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderPayment
        fields = [
            'id', 'work_order', 'work_order_number', 'bge_name',
            'amount', 'payment_date', 'balance', 'reference', 'notes',
            'recorded_by', 'recorded_by_name', 'created_at',
            'notified_at', 'confirmed_by_bge', 'confirmed_at',
        ]
        read_only_fields = ['recorded_by', 'created_at', 'notified_at', 'confirmed_by_bge', 'confirmed_at']

    def get_recorded_by_name(self, obj):
        if not obj.recorded_by:
            return None
        return obj.recorded_by.get_full_name().strip() or obj.recorded_by.username
