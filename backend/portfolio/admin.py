from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from .models import Portfolio, Investment, Transaction, MSME, BusinessGrowthExpert, SupportRequest, TrainingSession, Attendance, TrainingTopic, Cohort, BGEGroup, MSMEReport, GroupReport, GroupReportContribution, CohortAdmin as CohortAdminModel, ProgrammeGroup, MSMEGrowthSnapshot, VisitReportTemplate, TrainingFacilitationAssignment, TrainingReport

# ── Brand the admin to match the PRUDEV II frontend ──────────────────────────
admin.site.site_header = "PRUDEV II — Portfolio Manager"
admin.site.site_title  = "PRUDEV II Admin"
admin.site.index_title = "MSME Portfolio Management"

@admin.register(Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'created_at', 'is_active', 'total_value_display')
    list_filter = ('is_active', 'created_at', 'user')
    search_fields = ('name', 'description', 'user__username')
    readonly_fields = ('created_at', 'updated_at')
    
    def total_value_display(self, obj):
        return f"${obj.total_value():,.2f}"
    total_value_display.short_description = 'Total Value'

@admin.register(Investment)
class InvestmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'symbol', 'portfolio', 'investment_type', 'current_price', 'shares_quantity', 'current_value_display')
    list_filter = ('investment_type', 'portfolio', 'created_at')
    search_fields = ('name', 'symbol', 'portfolio__name')
    readonly_fields = ('created_at', 'updated_at')
    
    def current_value_display(self, obj):
        return f"${obj.current_value():,.2f}"
    current_value_display.short_description = 'Current Value'

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('investment', 'transaction_type', 'amount', 'shares_quantity', 'price_per_share', 'transaction_date')
    list_filter = ('transaction_type', 'transaction_date', 'investment__portfolio')
    search_fields = ('investment__name', 'investment__symbol', 'notes')
    readonly_fields = ('created_at',)
    date_hierarchy = 'transaction_date'


class GrowthSnapshotInline(admin.TabularInline):
    model            = MSMEGrowthSnapshot
    extra            = 0
    ordering         = ('-snapshot_date',)
    can_delete       = False
    show_change_link = True
    fields = (
        'snapshot_date', 'source', 'collected_by',
        'annual_turnover', 'last_month_revenue', 'total_assets',
        'employees_ft_male', 'employees_ft_female', 'employees_pt_male', 'employees_pt_female',
        'employees_ft_refugee', 'employees_pt_refugee',
        'has_tin', 'tin_number', 'has_ursb', 'ursb_reg_number',
        'has_business_bank', 'bank_name', 'has_sacco',
        'has_mobile_money', 'has_momo_pay', 'momo_pay_code',
        'notes',
    )
    readonly_fields = ('snapshot_date', 'source', 'collected_by')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(MSME)
class MSMEAdmin(admin.ModelAdmin):
    list_display  = ('business_name', 'business_type', 'sector', 'owner_name', 'city',
                     'cohort', 'assigned_bge', 'latest_growth_update', 'growth_status')
    list_filter   = ('business_type', 'sector', 'cohort', 'is_active', 'created_at')
    search_fields = ('business_name', 'owner_name', 'email', 'phone', 'address')
    readonly_fields = ('created_at', 'updated_at')
    inlines       = [GrowthSnapshotInline]
    fieldsets = (
        ('Basic Information', {
            'fields': ('business_name', 'business_type', 'sector', 'registration_number')
        }),
        ('Contact Information', {
            'fields': ('owner_name', 'email', 'phone', 'address', 'city', 'state', 'country')
        }),
        ('Financial Information', {
            'fields': ('annual_revenue', 'employee_count', 'investment_needed', 'current_funding')
        }),
        ('Additional Information', {
            'fields': ('business_description', 'challenges', 'opportunities')
        }),
        ('Metadata', {
            'fields': ('is_active', 'source_file', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def latest_growth_update(self, obj):
        snap = obj.growth_snapshots.order_by('-snapshot_date').first()
        return snap.snapshot_date if snap else '—'
    latest_growth_update.short_description = 'Last Growth Update'
    latest_growth_update.admin_order_field = 'growth_snapshots__snapshot_date'

    def growth_status(self, obj):
        snap = obj.growth_snapshots.order_by('-snapshot_date').first()
        if not snap:
            return format_html('<span style="color:#c62828;font-weight:600">No data</span>')
        days = (timezone.now().date() - snap.snapshot_date).days
        if days <= 30:
            return format_html('<span style="color:#2e7d32;font-weight:600">✔ {d}d ago</span>', d=days)
        if days <= 90:
            return format_html('<span style="color:#f57c00;font-weight:600">⚠ {d}d ago</span>', d=days)
        return format_html('<span style="color:#c62828;font-weight:600">✘ {d}d ago</span>', d=days)
    growth_status.short_description = 'Data Freshness'

@admin.register(BusinessGrowthExpert)
class BusinessGrowthExpertAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'email', 'phone', 'location', 'status', 'is_senior', 'allow_concurrent_work_orders', 'years_of_experience', 'created_at')
    search_fields = ('name', 'email', 'location', 'user__username')
    list_filter = ('status', 'is_senior', 'allow_concurrent_work_orders', 'location')
    readonly_fields = ('created_at', 'updated_at')
    raw_id_fields = ('user',)

@admin.register(SupportRequest)
class SupportRequestAdmin(admin.ModelAdmin):
    list_display = ('msme_name', 'business_need', 'location', 'latitude', 'longitude', 'created_at')
    search_fields = ('msme_name', 'business_need', 'location')
    list_filter = ('location',)

@admin.register(TrainingTopic)
class TrainingTopicAdmin(admin.ModelAdmin):
    list_display  = ('section_number', 'name', 'module_number', 'module_name')
    list_filter   = ('module_number',)
    ordering      = ('module_number', 'section_number')

class TrainingSessionAdmin(admin.ModelAdmin):
    filter_horizontal = ('businesses',)

admin.site.register(TrainingSession, TrainingSessionAdmin)


@admin.register(TrainingFacilitationAssignment)
class TrainingFacilitationAssignmentAdmin(admin.ModelAdmin):
    list_display  = ('bge', 'topic', 'assigned_date', 'assigned_by')
    list_filter   = ('topic__module_number', 'assigned_date')
    search_fields = ('bge__name', 'topic__name')
    raw_id_fields = ('bge', 'assigned_by')


@admin.register(Cohort)
class CohortAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'msme_count', 'created_at')
    search_fields = ('name',)

    def msme_count(self, obj):
        return obj.msmes.filter(is_active=True).count()
    msme_count.short_description = 'MSMEs'


@admin.register(BGEGroup)
class BGEGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'member_count', 'created_at')
    search_fields = ('name',)
    filter_horizontal = ('members',)

    def member_count(self, obj):
        return obj.members.count()
    member_count.short_description = 'Members'


@admin.register(VisitReportTemplate)
class VisitReportTemplateAdmin(admin.ModelAdmin):
    list_display  = ('name', 'is_active', 'include_financials', 'include_workforce',
                     'include_compliance', 'include_market', 'include_business_mgmt', 'include_growth_rating')
    list_filter   = ('is_active',)
    search_fields = ('name',)


@admin.register(MSMEReport)
class MSMEReportAdmin(admin.ModelAdmin):
    list_display = ('msme', 'bge', 'visit_type', 'visit_date', 'status', 'created_at')
    list_filter = ('status', 'visit_type', 'visit_date')
    search_fields = ('msme__business_name', 'bge__name')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(GroupReport)
class GroupReportAdmin(admin.ModelAdmin):
    list_display = ('group', 'team_lead', 'session_number', 'visit_date', 'status', 'created_at')
    list_filter = ('status', 'visit_date', 'group')
    search_fields = ('group__name', 'team_lead__name')
    readonly_fields = ('created_at', 'updated_at', 'submitted_at', 'approved_at')
    filter_horizontal = ('msmes_supported',)


@admin.register(GroupReportContribution)
class GroupReportContributionAdmin(admin.ModelAdmin):
    list_display = ('group_report', 'bge', 'updated_at')
    list_filter = ('group_report__group',)
    search_fields = ('group_report__group__name', 'bge__name', 'notes')
    readonly_fields = ('created_at', 'updated_at')
    filter_horizontal = ('msmes_observed',)


@admin.register(ProgrammeGroup)
class ProgrammeGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'color', 'msme_count', 'created_at')
    search_fields = ('name',)

    def msme_count(self, obj):
        return obj.msmes.count()
    msme_count.short_description = 'MSMEs'


@admin.register(CohortAdminModel)
class CohortAdminAdmin(admin.ModelAdmin):
    list_display = ('user', 'email', 'group_list')
    search_fields = ('user__username', 'user__email', 'user__first_name', 'user__last_name')
    filter_horizontal = ('managed_groups',)
    raw_id_fields = ('user',)

    def email(self, obj):
        return obj.user.email
    email.short_description = 'Email'

    def group_list(self, obj):
        return ', '.join(g.name for g in obj.managed_groups.all()) or '—'
    group_list.short_description = 'Managed Groups'


@admin.register(MSMEGrowthSnapshot)
class MSMEGrowthSnapshotAdmin(admin.ModelAdmin):
    list_display  = ('msme', 'snapshot_date', 'source', 'collected_by',
                     'annual_turnover', 'last_month_revenue', 'total_employees_display',
                     'has_tin', 'has_ursb', 'has_business_bank', 'bank_name',
                     'has_sacco', 'has_mobile_money', 'has_momo_pay')
    list_filter   = ('source', 'snapshot_date', 'has_tin', 'has_ursb',
                     'has_business_bank', 'has_sacco', 'has_mobile_money', 'has_momo_pay',
                     'msme__cohort')
    search_fields = ('msme__business_name', 'msme__msme_code', 'tin_number',
                     'ursb_reg_number', 'bank_name', 'momo_pay_code')
    readonly_fields = ('created_at', 'total_employees_display', 'female_employee_ratio')
    date_hierarchy = 'snapshot_date'
    fieldsets = (
        ('MSME & Date', {
            'fields': ('msme', 'snapshot_date', 'source', 'collected_by'),
        }),
        ('Financials (UGX)', {
            'fields': ('annual_turnover', 'last_month_revenue', 'total_assets'),
        }),
        ('Workforce', {
            'fields': (
                ('employees_ft_male', 'employees_ft_female'),
                ('employees_pt_male', 'employees_pt_female'),
                ('employees_ft_refugee', 'employees_pt_refugee'),
                'total_employees_display', 'female_employee_ratio',
            ),
        }),
        ('Compliance & Financial Access', {
            'fields': (
                ('has_tin', 'tin_number'),
                ('has_ursb', 'ursb_reg_number'),
                ('has_business_bank', 'bank_name'),
                'has_sacco',
                ('has_mobile_money', 'has_momo_pay', 'momo_pay_code'),
            ),
        }),
        ('Notes', {
            'fields': ('notes', 'created_at'),
        }),
    )

    def total_employees_display(self, obj):
        return obj.total_employees
    total_employees_display.short_description = 'Total staff'


@admin.register(TrainingReport)
class TrainingReportAdmin(admin.ModelAdmin):
    list_display  = ('session', 'bge', 'status', 'total_participants', 'created_at')
    list_filter   = ('status', 'created_at')
    search_fields = ('session__title', 'bge__name', 'training_title')
    readonly_fields = ('created_at', 'updated_at', 'submitted_at', 'total_participants')
    fieldsets = (
        ('Session', {
            'fields': ('session', 'bge', 'status', 'training_title', 'training_dates',
                       'venue', 'district', 'time_allocation', 'facilitation_team'),
        }),
        ('Participant Demographics', {
            'fields': ('participants_male_youth', 'participants_female_youth',
                       'participants_adult_male', 'participants_adult_female', 'total_participants'),
        }),
        ('Report Content', {
            'fields': ('training_purpose', 'session_objectives', 'activities_delivered',
                       'key_lessons', 'growth_support_areas', 'key_findings',
                       'bge_contributions', 'bds_actions', 'recommendations',
                       'next_steps', 'conclusion'),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at', 'submitted_at'),
            'classes': ('collapse',),
        }),
    )

    def total_participants(self, obj):
        return obj.total_participants
    total_participants.short_description = 'Total participants'
