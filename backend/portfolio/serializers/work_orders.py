from rest_framework import serializers
from ..models import WorkOrder, WorkOrderSubmission, WorkOrderPayment, WorkOrderAttachment


class WorkOrderSerializer(serializers.ModelSerializer):
    bge_name         = serializers.CharField(source='bge.name', read_only=True, allow_null=True)
    bge_code_display = serializers.CharField(source='bge.bge_code', read_only=True, allow_null=True)
    group_name       = serializers.CharField(source='group.name', read_only=True, allow_null=True)
    work_order_type_display = serializers.CharField(source='get_work_order_type_display', read_only=True)
    status_display   = serializers.CharField(source='get_status_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    supported_bge_name        = serializers.SerializerMethodField()
    supported_bge_code        = serializers.SerializerMethodField()
    supported_bge_top_skills  = serializers.SerializerMethodField()
    bge_top_skills            = serializers.SerializerMethodField()
    target_msmes_detail       = serializers.SerializerMethodField()
    created_by_name  = serializers.SerializerMethodField()
    payment_submitted_by_name = serializers.SerializerMethodField()
    amount_due       = serializers.SerializerMethodField()
    total_paid       = serializers.SerializerMethodField()
    outstanding      = serializers.SerializerMethodField()

    def get_supported_bge_name(self, obj):
        try:
            return obj.supported_bge.name if getattr(obj, 'supported_bge', None) else None
        except Exception:
            return None

    def get_supported_bge_code(self, obj):
        try:
            return obj.supported_bge.bge_code if getattr(obj, 'supported_bge', None) else None
        except Exception:
            return None

    def get_supported_bge_top_skills(self, obj):
        try:
            return obj.supported_bge.top_skills if getattr(obj, 'supported_bge', None) else None
        except Exception:
            return None

    def get_bge_top_skills(self, obj):
        try:
            return obj.bge.top_skills if getattr(obj, 'bge', None) else None
        except Exception:
            return None

    def get_created_by_name(self, obj):
        try:
            if not getattr(obj, 'created_by', None):
                return None
            name = obj.created_by.get_full_name().strip()
            return name or obj.created_by.username
        except Exception:
            return None

    def get_payment_submitted_by_name(self, obj):
        try:
            if not getattr(obj, 'payment_submitted_by', None):
                return None
            name = obj.payment_submitted_by.get_full_name().strip()
            return name or obj.payment_submitted_by.username
        except Exception:
            return None

    def get_amount_due(self, obj):
        try:
            rate = float(getattr(obj, 'rate_per_day', 0) or 0)
            days = float(getattr(obj, 'max_days', 0) or 0)
            gross = rate * days
            return int(gross - (gross * 0.06))
        except Exception:
            return 0

    def get_total_paid(self, obj):
        from django.db.models import Sum
        try:
            total = obj.payments.aggregate(total=Sum('amount'))['total']
            return float(total or 0)
        except Exception:
            return 0

    def get_outstanding(self, obj):
        try:
            return float(self.get_amount_due(obj)) - float(self.get_total_paid(obj))
        except Exception:
            return 0

    def get_target_msmes_detail(self, obj):
        snapshot = getattr(obj, 'msme_ids_snapshot', None)
        if not snapshot:
            return []
        from ..models import MSME
        try:
            if isinstance(snapshot, str):
                import json
                try:
                    snapshot = json.loads(snapshot)
                except Exception:
                    snapshot = [s.strip() for s in snapshot.split(',') if s.strip()]
            if not isinstance(snapshot, (list, tuple, set)):
                return []
            clean_ids = [int(x) for x in snapshot if str(x).isdigit()]
            if not clean_ids:
                return []
            return [
                {
                    'id': m['id'],
                    'name': m['business_name'],
                    'business_name': m['business_name'],
                    'msme_code': m['msme_code'],
                    'district': m['district'],
                    'city': m['city'],
                    'owner_name': m['owner_name'],
                }
                for m in MSME.objects.filter(id__in=clean_ids)
                .values('id', 'business_name', 'msme_code', 'district', 'city', 'owner_name')
            ]
        except Exception:
            return []

    def to_internal_value(self, data):
        # Normalize empty string dates to None so DateField does not error with "Date has wrong format"
        if hasattr(data, 'copy'):
            data = data.copy()
            for date_field in ('start_date', 'end_date', 'bge_signed_date'):
                if data.get(date_field) == '':
                    data[date_field] = None
        return super().to_internal_value(data)

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
