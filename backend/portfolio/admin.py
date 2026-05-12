from django.contrib import admin
from .models import Portfolio, Investment, Transaction, MSME, BusinessGrowthExpert, SupportRequest, TrainingSession, Attendance, TrainingTopic, Cohort, BGEGroup, MSMEReport, GroupReport, GroupReportContribution, CohortAdmin as CohortAdminModel

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

@admin.register(MSME)
class MSMEAdmin(admin.ModelAdmin):
    list_display = ('business_name', 'business_type', 'sector', 'owner_name', 'city', 'cohort', 'assigned_bge', 'employee_count')
    list_filter = ('business_type', 'sector', 'cohort', 'is_active', 'created_at')
    search_fields = ('business_name', 'owner_name', 'email', 'phone', 'address')
    readonly_fields = ('created_at', 'updated_at')
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
    
    def annual_revenue_display(self, obj):
        if obj.annual_revenue:
            return f"UGX {obj.annual_revenue:,.2f}"
        return "N/A"
    annual_revenue_display.short_description = 'Annual Revenue (UGX)'

@admin.register(BusinessGrowthExpert)
class BusinessGrowthExpertAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'email', 'phone', 'location', 'status', 'years_of_experience', 'created_at')
    search_fields = ('name', 'email', 'location', 'user__username')
    list_filter = ('status', 'location')
    readonly_fields = ('created_at', 'updated_at')
    raw_id_fields = ('user',)

@admin.register(SupportRequest)
class SupportRequestAdmin(admin.ModelAdmin):
    list_display = ('msme_name', 'business_need', 'location', 'latitude', 'longitude', 'created_at')
    search_fields = ('msme_name', 'business_need', 'location')
    list_filter = ('location',)

admin.site.register(TrainingTopic)

class TrainingSessionAdmin(admin.ModelAdmin):
    filter_horizontal = ('businesses',)

admin.site.register(TrainingSession, TrainingSessionAdmin)


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


@admin.register(CohortAdminModel)
class CohortAdminAdmin(admin.ModelAdmin):
    list_display = ('user', 'email', 'cohort_list')
    search_fields = ('user__username', 'user__email', 'user__first_name', 'user__last_name')
    filter_horizontal = ('managed_cohorts',)
    raw_id_fields = ('user',)

    def email(self, obj):
        return obj.user.email
    email.short_description = 'Email'

    def cohort_list(self, obj):
        return ', '.join(c.name for c in obj.managed_cohorts.all()) or '—'
    cohort_list.short_description = 'Managed Cohorts'
