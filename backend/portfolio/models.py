from django.db import models
from django.contrib.auth.models import User
from decimal import Decimal

class Portfolio(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='portfolios')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    def __str__(self):
        return f"{self.name} - {self.user.username}"
    
    def total_value(self):
        """Calculate total value of all investments in this portfolio"""
        return sum(investment.current_value() for investment in self.investments.all())
    
    def total_cost(self):
        """Calculate total cost of all investments in this portfolio"""
        return sum(investment.total_cost() for investment in self.investments.all())
    
    def total_return(self):
        """Calculate total return (current value - total cost)"""
        return self.total_value() - self.total_cost()
    
    def total_return_percentage(self):
        """Calculate total return as a percentage"""
        total_cost = self.total_cost()
        if total_cost == 0:
            return Decimal('0.00')
        return (self.total_return() / total_cost) * 100

class Investment(models.Model):
    INVESTMENT_TYPES = [
        ('STOCK', 'Stock'),
        ('BOND', 'Bond'),
        ('ETF', 'ETF'),
        ('MUTUAL_FUND', 'Mutual Fund'),
        ('CRYPTO', 'Cryptocurrency'),
        ('REAL_ESTATE', 'Real Estate'),
        ('OTHER', 'Other'),
    ]
    
    portfolio = models.ForeignKey(Portfolio, on_delete=models.CASCADE, related_name='investments')
    name = models.CharField(max_length=100)
    symbol = models.CharField(max_length=20, blank=True)
    investment_type = models.CharField(max_length=20, choices=INVESTMENT_TYPES, default='STOCK')
    current_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    shares_quantity = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('0.00'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.name} ({self.symbol}) - {self.portfolio.name}"
    
    def current_value(self):
        """Calculate current value of this investment"""
        return self.current_price * self.shares_quantity
    
    def total_cost(self):
        """Calculate total cost from all transactions"""
        return sum(txn.amount for txn in self.transactions.all() if txn.transaction_type == 'BUY')
    
    def total_return(self):
        """Calculate total return for this investment"""
        return self.current_value() - self.total_cost()
    
    def total_return_percentage(self):
        """Calculate total return as a percentage"""
        total_cost = self.total_cost()
        if total_cost == 0:
            return Decimal('0.00')
        return (self.total_return() / total_cost) * 100

class Transaction(models.Model):
    TRANSACTION_TYPES = [
        ('BUY', 'Buy'),
        ('SELL', 'Sell'),
        ('DIVIDEND', 'Dividend'),
        ('SPLIT', 'Stock Split'),
    ]
    
    investment = models.ForeignKey(Investment, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    shares_quantity = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('0.00'))
    price_per_share = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    transaction_date = models.DateTimeField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.transaction_type} {self.shares_quantity} shares of {self.investment.name} on {self.transaction_date.date()}"
    
    class Meta:
        ordering = ['-transaction_date']


class Cohort(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']


class MSME(models.Model):
    BUSINESS_TYPES = [
        ('MICRO', 'Micro Enterprise'),
        ('SMALL', 'Small Enterprise'),
        ('MEDIUM', 'Medium Enterprise'),
    ]
    
    SECTORS = [
        ('MANUFACTURING', 'Manufacturing'),
        ('SERVICES', 'Services'),
        ('TRADE', 'Trade'),
        ('AGRICULTURE', 'Agriculture'),
        ('CONSTRUCTION', 'Construction'),
        ('TECHNOLOGY', 'Technology'),
        ('HEALTHCARE', 'Healthcare'),
        ('EDUCATION', 'Education'),
        ('OTHER', 'Other'),
    ]
    
    # Auto-generated unique code
    msme_code = models.CharField(max_length=50, unique=True, blank=True)
    
    # Basic Information
    business_name = models.CharField(max_length=200)
    business_type = models.CharField(max_length=10, choices=BUSINESS_TYPES)
    sector = models.CharField(max_length=20, choices=SECTORS)
    registration_number = models.CharField(max_length=50, blank=True)
    
    # Contact Information
    owner_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    business_email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default='Nigeria')
    
    # Financial Information
    annual_revenue = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    employee_count = models.IntegerField(null=True, blank=True)
    investment_needed = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    current_funding = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    
    # Additional Information
    business_description = models.TextField(blank=True)
    challenges = models.TextField(blank=True)
    opportunities = models.TextField(blank=True)
    
    # Grouping & Assignment
    cohort = models.ForeignKey(
        'Cohort', on_delete=models.SET_NULL, null=True, blank=True, related_name='msmes'
    )
    programme_groups = models.ManyToManyField(
        'ProgrammeGroup', blank=True, related_name='msmes',
        help_text='Cross-cutting programme labels (e.g. Green MSMEs, Agroprocessors).',
    )
    assigned_bge = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_msmes'
    )
    co_assigned_bges = models.ManyToManyField(
        'BusinessGrowthExpert', blank=True,
        related_name='co_assigned_msmes',
        help_text='Additional BGEs who are also deployed to this MSME alongside the primary BGE.',
    )
    assigned_group = models.ForeignKey(
        'BGEGroup', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_msmes',
        help_text='If set, every BGE in this group is considered assigned to this MSME.'
    )
    session_number = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='Optional session within a group rotation (e.g. Session 1, Session 2).'
    )
    assignment_objectives = models.TextField(
        blank=True,
        help_text='Objectives and scope of this BGE deployment for the MSME'
    )
    assignment_date = models.DateField(null=True, blank=True, help_text='Date this MSME was assigned to the BGE')

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    source_file = models.CharField(max_length=255, blank=True)

    gender_choices = [
        ('MALE', 'Male'),
        ('FEMALE', 'Female'),
        ('OTHER', 'Other'),
    ]
    gender = models.CharField(max_length=10, choices=gender_choices, blank=True, null=True)

    # ── Diagnostic baseline (imported from the PRUDEV II application diagnostics) ──
    diag_annual_turnover      = models.CharField(max_length=100, blank=True,
        help_text='Total sales/turnover band from diagnostic tool (e.g. "10 – 100 million UGX")')
    diag_total_assets         = models.CharField(max_length=100, blank=True,
        help_text='Total assets band from diagnostic tool (e.g. "100 – 360 million UGX")')
    diag_employees_ft_male    = models.PositiveSmallIntegerField(null=True, blank=True,
        help_text='Full-time male employees at diagnostic baseline')
    diag_employees_ft_female  = models.PositiveSmallIntegerField(null=True, blank=True,
        help_text='Full-time female employees at diagnostic baseline')
    diag_employees_pt_male    = models.PositiveSmallIntegerField(null=True, blank=True,
        help_text='Part-time male employees at diagnostic baseline')
    diag_employees_pt_female  = models.PositiveSmallIntegerField(null=True, blank=True,
        help_text='Part-time female employees at diagnostic baseline')
    diag_has_tin              = models.BooleanField(null=True, blank=True,
        help_text='Has a Tax Identification Number (TIN)')
    diag_has_unbs             = models.BooleanField(null=True, blank=True,
        help_text='Has products registered with Uganda National Bureau of Standards')
    diag_has_business_bank    = models.BooleanField(null=True, blank=True,
        help_text='Has a business bank account')
    diag_has_mobile_money     = models.BooleanField(null=True, blank=True,
        help_text='Has a mobile money account')
    diag_is_green_business    = models.BooleanField(null=True, blank=True,
        help_text='Falls into at least one green business category')
    diag_green_categories     = models.JSONField(default=list, blank=True,
        help_text='List of green business categories the MSME falls into')
    diag_owner_sex            = models.CharField(max_length=20, blank=True,
        help_text='Owner sex as reported in diagnostic tool')
    diag_owner_age            = models.PositiveSmallIntegerField(null=True, blank=True,
        help_text='Owner age at time of diagnostic')
    diag_owner_education      = models.CharField(max_length=100, blank=True,
        help_text='Owner education level from diagnostic tool')
    diag_years_operating      = models.CharField(max_length=50, blank=True,
        help_text='How long the business has been operating (as reported)')
    diag_district             = models.CharField(max_length=100, blank=True,
        help_text='District from diagnostic tool (District_clean column)')
    diag_imported_at          = models.DateTimeField(null=True, blank=True,
        help_text='When the diagnostic baseline was imported')

    def __str__(self):
        return f"{self.business_name} - {self.business_type} ({self.sector})"
    
    def save(self, *args, **kwargs):
        # Generate unique MSME code if not already set.
        # Previous implementation used `order_by('-msme_code').first()` which
        # is lexicographic (so "PRUDEV2-GOPA-COHORT-099" > "PRUDEV2-GOPA-COHORT-100"
        # in some encodings) AND racy under concurrent uploads (two workers
        # could both read N and both write N+1). Fix: scan all codes, derive
        # max numeric suffix, retry-on-collision via the DB unique index.
        if not self.msme_code:
            from django.db import IntegrityError
            from django.db.models import Max
            import re

            for _ in range(8):  # bounded retries against IntegrityError
                # Pull every existing numeric suffix and take the real max.
                # Cheap because msme_code is indexed.
                codes = MSME.objects.filter(
                    msme_code__startswith='PRUDEV2-GOPA-COHORT-'
                ).values_list('msme_code', flat=True)
                next_number = 1
                for c in codes:
                    m = re.search(r'(\d+)$', c or '')
                    if m:
                        next_number = max(next_number, int(m.group(1)) + 1)

                self.msme_code = f"PRUDEV2-GOPA-COHORT-{next_number:03d}"
                try:
                    return super().save(*args, **kwargs)
                except IntegrityError:
                    # Another worker minted the same suffix; clear and retry.
                    self.msme_code = ''
                    continue
            # Fall through (extremely unlikely): let the last attempt raise.
            self.msme_code = f"PRUDEV2-GOPA-COHORT-{next_number:03d}"

        super().save(*args, **kwargs)
    
    class Meta:
        verbose_name = "MSME"
        verbose_name_plural = "MSMEs"
        ordering = ['-created_at']


class MSMEGrowthSnapshot(models.Model):
    """
    Point-in-time measurement of key business metrics for growth tracking.
    The first snapshot (source='diagnostic') is imported from the application
    diagnostics data.  Subsequent snapshots are captured during BGE deployments
    so growth can be measured over time.
    """
    SOURCE_CHOICES = [
        ('diagnostic', 'Application Diagnostic (Baseline)'),
        ('bge_visit',  'BGE Visit'),
        ('quarterly',  'Quarterly Review'),
        ('annual',     'Data Update'),
        ('other',      'Other'),
    ]

    msme            = models.ForeignKey(MSME, on_delete=models.CASCADE, related_name='growth_snapshots')
    snapshot_date   = models.DateField()
    source          = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='bge_visit')
    collected_by    = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='collected_snapshots',
        help_text='BGE who collected this data (leave blank for imported baselines)',
    )

    # Financials
    annual_turnover      = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
        help_text='Total sales/turnover in last 12 months (UGX)')
    last_month_revenue   = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
        help_text='Total sales/revenue in the last calendar month (UGX)')
    total_assets         = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
        help_text='Investment in total assets (UGX)')

    # Workforce
    employees_ft_male      = models.PositiveSmallIntegerField(null=True, blank=True)
    employees_ft_female    = models.PositiveSmallIntegerField(null=True, blank=True)
    employees_pt_male      = models.PositiveSmallIntegerField(null=True, blank=True)
    employees_pt_female    = models.PositiveSmallIntegerField(null=True, blank=True)
    employees_ft_refugee   = models.PositiveSmallIntegerField(null=True, blank=True,
        help_text='Full-time staff who are refugees')
    employees_pt_refugee   = models.PositiveSmallIntegerField(null=True, blank=True,
        help_text='Part-time staff who are refugees')

    # Compliance & access
    has_tin           = models.BooleanField(null=True, blank=True)
    tin_number        = models.CharField(max_length=50, blank=True, default='',
        help_text='Uganda Revenue Authority TIN')
    has_ursb          = models.BooleanField(null=True, blank=True,
        help_text='Registered with Uganda Registration Services Bureau')
    ursb_reg_number   = models.CharField(max_length=50, blank=True, default='',
        help_text='URSB registration number')
    has_business_bank = models.BooleanField(null=True, blank=True)
    bank_name         = models.CharField(max_length=100, blank=True, default='',
        help_text='Name of the business bank')
    has_sacco         = models.BooleanField(null=True, blank=True,
        help_text='Member of a SACCO')
    has_mobile_money  = models.BooleanField(null=True, blank=True)
    has_momo_pay      = models.BooleanField(null=True, blank=True,
        help_text='Business has a MOMO Pay merchant code')
    momo_pay_code     = models.CharField(max_length=50, blank=True, default='',
        help_text='MTN/Airtel MOMO Pay merchant code')

    # Digital tools adoption
    digital_tools       = models.JSONField(default=list, blank=True,
        help_text='Digital tools the business has adopted (list of strings)')
    digital_tools_other = models.CharField(max_length=300, blank=True, default='',
        help_text='Other digital tools not in the standard list')

    # Training impact
    training_made_changes  = models.BooleanField(null=True, blank=True,
        help_text='Has training delivered by the programme made changes to the business?')
    training_changes       = models.JSONField(default=list, blank=True,
        help_text='Areas where training has led to changes (list of strings)')
    training_changes_other = models.CharField(max_length=500, blank=True, default='',
        help_text='Other training-driven changes not in the standard list')

    # Narrative / context
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['msme', 'snapshot_date']
        verbose_name        = 'Growth Snapshot'
        verbose_name_plural = 'Growth Snapshots'

    def __str__(self):
        return f"{self.msme.business_name} — {self.snapshot_date} ({self.get_source_display()})"

    # ── Computed helpers ──────────────────────────────────────────────────────

    @property
    def total_employees(self):
        ft = (self.employees_ft_male or 0) + (self.employees_ft_female or 0)
        pt = (self.employees_pt_male or 0) + (self.employees_pt_female or 0)
        return ft + pt

    @property
    def female_employee_ratio(self):
        total = self.total_employees
        if not total:
            return None
        female = (self.employees_ft_female or 0) + (self.employees_pt_female or 0)
        return round(female / total, 4)


class BusinessGrowthExpert(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    user = models.OneToOneField(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='bge_profile', help_text='Linked login account for this BGE'
    )
    name = models.CharField(max_length=100)
    bge_code = models.CharField(max_length=50, blank=True, unique=False, help_text='e.g. PRUDEV II-BGE-010T-7')
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    location = models.CharField(max_length=100, blank=True)
    years_of_experience = models.PositiveIntegerField(null=True, blank=True)
    top_skills = models.CharField(max_length=200, blank=True)
    second_area = models.CharField(max_length=200, blank=True)
    third_area = models.CharField(max_length=200, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    deployment_objectives = models.TextField(
        blank=True,
        help_text='Shared objectives for this BGE across all their assigned MSMEs'
    )
    signature = models.ImageField(
        upload_to='signatures/', null=True, blank=True,
        help_text='JPEG/PNG signature image; background will be normalised on upload'
    )
    # Signature bytes stored in DB — survives filesystem wipes on Render deploys.
    signature_data = models.BinaryField(null=True, blank=True)
    is_senior = models.BooleanField(default=False, help_text='Designate as Senior BGE (can be assigned training facilitation)')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class PushSubscription(models.Model):
    """Stores Web Push subscriptions for BGE users."""
    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint    = models.TextField(unique=True)
    p256dh      = models.TextField()
    auth        = models.TextField()
    created_at  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} — {self.endpoint[:60]}"


class BGEGroup(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    objectives = models.TextField(
        blank=True,
        help_text='Mission statement for this group — flows into each assigned MSME and is visible to BGEs when they file reports.'
    )
    members = models.ManyToManyField('BusinessGrowthExpert', blank=True, related_name='bge_groups')
    team_lead = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='led_groups',
        help_text='Designated team lead. Only this BGE can file the group-level report.'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']
        verbose_name = "BGE Group"
        verbose_name_plural = "BGE Groups"


class SupportRequest(models.Model):
    msme_name = models.CharField(max_length=200)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    business_need = models.TextField()
    location = models.CharField(max_length=100, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    matched_bges = models.ManyToManyField(BusinessGrowthExpert, blank=True, related_name='support_requests')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.msme_name} - {self.business_need[:30]}..."

class TrainingTopic(models.Model):
    module_number  = models.PositiveSmallIntegerField(default=0)
    module_name    = models.CharField(max_length=200, blank=True)
    section_number = models.CharField(max_length=10, blank=True)
    name           = models.CharField(max_length=200, unique=True)
    description    = models.TextField(blank=True)

    class Meta:
        ordering = ['module_number', 'section_number']

    def __str__(self):
        if self.section_number:
            return f"Section {self.section_number} – {self.name}"
        return self.name

class TrainingSession(models.Model):
    title       = models.CharField(max_length=200)
    date        = models.DateField()
    location    = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    topic       = models.ForeignKey(TrainingTopic, on_delete=models.SET_NULL, null=True, related_name='sessions')
    businesses  = models.ManyToManyField('MSME', blank=True, related_name='sessions_attended')

    def __str__(self):
        return f"{self.title} ({self.date})"

    @property
    def lead_bge(self):
        a = self.facilitation_assignments.filter(role='lead').select_related('bge').first()
        return a.bge if a else None

    @property
    def lead_bge_name(self):
        b = self.lead_bge
        return b.name if b else None


class TrainingFacilitationAssignment(models.Model):
    ROLE_CHOICES = [('lead', 'Lead Facilitator'), ('mentor', 'Mentor')]

    bge           = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.CASCADE,
        related_name='facilitation_assignments',
    )
    topic         = models.ForeignKey(
        TrainingTopic, on_delete=models.CASCADE, null=True, blank=True,
        related_name='facilitation_assignments',
    )
    session       = models.ForeignKey(
        TrainingSession, on_delete=models.CASCADE, null=True, blank=True,
        related_name='facilitation_assignments',
    )
    role          = models.CharField(max_length=10, choices=ROLE_CHOICES, default='lead')
    work_order    = models.ForeignKey(
        'WorkOrder', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='facilitation_assignments',
    )
    assigned_by   = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='training_assignments_made',
    )
    assigned_date = models.DateField()
    notes         = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['topic__module_number', 'topic__section_number', 'bge__name', 'id']

    def __str__(self):
        role_label = 'Lead' if self.role == 'lead' else 'Mentor'
        session_part = f' @ {self.session}' if self.session_id else ''
        return f"{self.bge.name} [{role_label}] → {self.topic}{session_part}"


class TrainingReport(models.Model):
    STATUS_CHOICES = [('draft', 'Draft'), ('submitted', 'Submitted')]

    session      = models.OneToOneField(
        TrainingSession, on_delete=models.CASCADE, related_name='training_report',
    )
    bge          = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='training_reports',
    )
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    # ── Header metadata ───────────────────────────────────────────────────────
    training_title   = models.CharField(max_length=300, blank=True)
    training_dates   = models.CharField(max_length=100, blank=True,
                                        help_text='e.g. "17–19 February 2026"')
    venue            = models.CharField(max_length=200, blank=True)
    district         = models.CharField(max_length=100, blank=True)
    time_allocation  = models.CharField(max_length=100, blank=True,
                                        help_text='e.g. "2 hours" or "3 days"')
    facilitation_team = models.TextField(blank=True,
                                         help_text='Names of co-facilitators, guest trainers, etc.')

    # ── Participant demographics ──────────────────────────────────────────────
    participants_male_youth    = models.PositiveIntegerField(default=0, help_text='Male, age 15–35')
    participants_female_youth  = models.PositiveIntegerField(default=0, help_text='Female, age 15–35')
    participants_adult_male    = models.PositiveIntegerField(default=0, help_text='Male, age 36+')
    participants_adult_female  = models.PositiveIntegerField(default=0, help_text='Female, age 36+')

    # ── Core report content ───────────────────────────────────────────────────
    training_purpose    = models.TextField(blank=True, help_text='Background and purpose of the session')
    session_objectives  = models.TextField(blank=True, help_text='What was the objective of the session?')
    activities_delivered = models.TextField(blank=True, help_text='What activities/tasks were delivered?')
    key_lessons         = models.TextField(blank=True, help_text='What key lessons were learnt?')
    growth_support_areas = models.TextField(blank=True, help_text='What growth support areas were observed?')
    key_findings        = models.TextField(blank=True,
                                           help_text='Key findings and critical issues from the session')
    bge_contributions   = models.TextField(blank=True,
                                           help_text='BGE contributions and development needs observed')
    bds_actions         = models.TextField(blank=True,
                                           help_text='What BDS actions would you propose for the next 3 months?')
    recommendations     = models.TextField(blank=True, help_text='Recommendations for future sessions')
    next_steps          = models.TextField(blank=True, help_text='Agreed next steps')
    conclusion          = models.TextField(blank=True, help_text='Summary conclusion')

    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Report: {self.session} ({self.status})"

    @property
    def total_participants(self):
        return (self.participants_male_youth + self.participants_female_youth
                + self.participants_adult_male + self.participants_adult_female)


class MentorTrainingReport(models.Model):
    STATUS_CHOICES = [('draft', 'Draft'), ('submitted', 'Submitted')]

    session = models.ForeignKey(
        TrainingSession, on_delete=models.CASCADE,
        related_name='mentor_reports',
    )
    bge = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='mentor_reports',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    training_title  = models.CharField(max_length=300, blank=True)
    training_dates  = models.CharField(max_length=100, blank=True)
    venue           = models.CharField(max_length=200, blank=True)

    mentoring_activities = models.TextField(blank=True, help_text='Activities carried out as a mentor')
    msmes_mentored       = models.TextField(blank=True, help_text='MSMEs specifically supported during session')
    key_observations     = models.TextField(blank=True, help_text='Key observations on MSME progress/needs')
    challenges           = models.TextField(blank=True, help_text='Challenges encountered during mentoring')
    recommendations      = models.TextField(blank=True, help_text='Recommendations for future sessions')
    next_steps           = models.TextField(blank=True, help_text='Agreed follow-up actions')

    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('session', 'bge')

    def __str__(self):
        return f"Mentor Report: {self.bge} @ {self.session} ({self.status})"


class Attendance(models.Model):
    AGE_GROUP_CHOICES = [
        ('18-34', '18–34 (Youth)'),
        ('35-45', '35–45'),
        ('46-55', '46–55'),
        ('56+',   '56+'),
    ]
    GENDER_CHOICES = [
        ('M', 'Male'),
        ('F', 'Female'),
    ]
    REFUGEE_STATUS_CHOICES = [
        ('R', 'Refugee'),
        ('H', 'Host Community'),
    ]

    session        = models.ForeignKey(TrainingSession, on_delete=models.CASCADE, related_name='attendances')
    # msme is now optional — we can record walk-in / non-MSME participants too
    msme           = models.ForeignKey('MSME', on_delete=models.SET_NULL, null=True, blank=True, related_name='attendances')
    present        = models.BooleanField(default=True)
    marked_at      = models.DateTimeField(auto_now=True)

    # Per-person demographic fields (matching the PRUDEV II attendance sheet)
    attendee_name  = models.CharField(max_length=200, blank=True)
    attendee_phone = models.CharField(max_length=30, blank=True)
    gender         = models.CharField(max_length=1, choices=GENDER_CHOICES, blank=True)
    age_group      = models.CharField(max_length=10, choices=AGE_GROUP_CHOICES, blank=True)
    refugee_status = models.CharField(max_length=1, choices=REFUGEE_STATUS_CHOICES, blank=True, default='H')
    consent_photo  = models.BooleanField(default=True)
    consent_contact= models.BooleanField(default=True)

    class Meta:
        ordering = ['session', 'attendee_name']

    def __str__(self):
        name = self.attendee_name or (self.msme.business_name if self.msme else '?')
        return f"{name} — {self.session}"


class VisitReportTemplate(models.Model):
    """Admin-defined template that controls which sections appear on a BGE visit report."""
    name        = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_active   = models.BooleanField(default=True)

    # Section toggles — each controls a group of form fields
    include_financials    = models.BooleanField(default=True,  help_text='Revenue, profit, total assets')
    include_workforce     = models.BooleanField(default=True,  help_text='FT/PT employee counts by gender')
    include_compliance    = models.BooleanField(default=True,  help_text='TIN, UNBS, bank, mobile money, NSSF')
    include_market        = models.BooleanField(default=False, help_text='Customer base, exporting, new products')
    include_business_mgmt = models.BooleanField(default=False, help_text='Business plan, digital accounting, HR policy')
    include_growth_rating = models.BooleanField(default=True,  help_text='BGE 1-5 growth score + key achievement')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class MSMEReport(models.Model):
    VISIT_TYPES = [
        ('data_update',      'Data Collection Visit'),
        ('one_on_one',       'One-on-One Visit'),
        ('training',         'Training Visit'),
        ('coaching',         'Business Coaching Visit'),
        ('annual_review',    'Annual Review'),
        # legacy types kept for backward compat
        ('initial',          'Initial Assessment'),
        ('followup',         'Follow-up Visit'),
        ('final',            'Final Assessment'),
        ('mentoring',        'Mentoring Session'),
        ('quarterly_review', 'Quarterly Review'),
    ]

    DATA_CONFIDENCE_CHOICES = [
        ('confirmed',        'Confirmed — figures from actual records'),
        ('mostly_confident', 'Mostly confident — minor estimates only'),
        ('mixed',            'Mixed — owner unsure on several items'),
        ('largely_estimated','Largely estimated — few actual records'),
        ('unreliable',       'Unreliable — mostly guessing'),
    ]
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('reviewed', 'Reviewed'),
    ]

    msme = models.ForeignKey('MSME', on_delete=models.CASCADE, related_name='reports')
    bge = models.ForeignKey('BusinessGrowthExpert', on_delete=models.CASCADE, related_name='reports')
    template = models.ForeignKey(
        VisitReportTemplate, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reports', help_text='Report template chosen at visit time',
    )
    visit_type = models.CharField(max_length=20, choices=VISIT_TYPES, default='followup')
    visit_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')

    # ── Qualitative narrative ─────────────────────────────────────────────────
    visit_objectives      = models.TextField(blank=True, help_text='What this visit aimed to achieve')
    business_overview     = models.TextField(blank=True, help_text='Context observed / topics covered / what was discussed')
    support_provided      = models.TextField(blank=True, help_text='Support, coaching, or training content delivered')
    tools_provided        = models.TextField(blank=True, help_text='Comma-separated tools, templates or materials given')
    delivery_method       = models.CharField(max_length=60, blank=True, help_text='Training delivery method (training visits)')
    participant_count     = models.PositiveSmallIntegerField(null=True, blank=True, help_text='Number of participants (training visits)')
    coaching_focus_area   = models.CharField(max_length=100, blank=True, help_text='Focus area for coaching visits')
    key_achievement       = models.TextField(blank=True, help_text='Key outcomes, takeaways or owner insights')
    challenges_identified = models.TextField(blank=True, help_text='Challenges encountered or observed')
    action_plan           = models.TextField(blank=True, help_text='MSME agreed actions / assignments given')
    recommendations       = models.TextField(blank=True, help_text='BGE follow-up actions / next session plan')
    next_steps            = models.TextField(blank=True)
    additional_notes      = models.TextField(blank=True)

    # ── Data quality (annual_review visits) ──────────────────────────────────
    data_confidence_level    = models.CharField(
        max_length=30, blank=True,
        choices=[
            ('confirmed',        'Confirmed — figures from actual records'),
            ('mostly_confident', 'Mostly confident — minor estimates only'),
            ('mixed',            'Mixed — owner unsure on several items'),
            ('largely_estimated','Largely estimated — few actual records'),
            ('unreliable',       'Unreliable — mostly guessing'),
        ],
        help_text='BGE assessment of overall data reliability for this visit',
    )
    records_sighted          = models.BooleanField(
        null=True, blank=True,
        help_text='BGE physically saw business records / books',
    )
    owner_certainty_observation = models.TextField(
        blank=True,
        help_text='Qualitative notes on how confident the owner was when answering — '
                  'what they were unsure about, where they appeared to guess',
    )
    data_collection_challenges = models.TextField(
        blank=True,
        help_text='Difficulties encountered during data collection '
                  '(reluctance, missing records, conflicting figures, etc.)',
    )

    # ── Financials (template section: include_financials) ─────────────────────
    revenue_ugx       = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
                            help_text='Total sales/turnover last 12 months (UGX)')
    monthly_profit_ugx = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
                            help_text='Average monthly profit (UGX)')
    total_assets_ugx   = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
                            help_text='Total business assets (UGX)')

    # ── Workforce (template section: include_workforce) ───────────────────────
    employees_ft_male    = models.PositiveSmallIntegerField(null=True, blank=True)
    employees_ft_female  = models.PositiveSmallIntegerField(null=True, blank=True)
    employees_pt_male    = models.PositiveSmallIntegerField(null=True, blank=True)
    employees_pt_female  = models.PositiveSmallIntegerField(null=True, blank=True)

    # ── Compliance & access (template section: include_compliance) ────────────
    has_tin           = models.BooleanField(null=True, blank=True)
    has_ursb          = models.BooleanField(null=True, blank=True)
    has_business_bank = models.BooleanField(null=True, blank=True)
    has_mobile_money  = models.BooleanField(null=True, blank=True)
    has_nssf          = models.BooleanField(null=True, blank=True, help_text='Making NSSF contributions')

    # ── Market access (template section: include_market) ─────────────────────
    is_exporting              = models.BooleanField(null=True, blank=True)
    introduced_new_product    = models.BooleanField(null=True, blank=True)
    active_customers_count    = models.PositiveIntegerField(null=True, blank=True)
    markets_outside_district  = models.BooleanField(null=True, blank=True,
        help_text='Does the MSME access markets outside their district of operation?')

    # ── Business management (template section: include_business_mgmt) ─────────
    has_business_plan       = models.BooleanField(null=True, blank=True)
    uses_digital_accounting = models.BooleanField(null=True, blank=True)
    has_hr_policy           = models.BooleanField(null=True, blank=True)
    accepts_digital_payments = models.BooleanField(null=True, blank=True)

    # ── BGE rating (template section: include_growth_rating) ─────────────────
    growth_rating = models.PositiveSmallIntegerField(null=True, blank=True,
                        help_text='BGE growth assessment score 1–5')

    # Frozen PDF snapshot generated when the report is submitted.
    submitted_pdf = models.FileField(upload_to='reports/submitted/', null=True, blank=True)
    submitted_pdf_data = models.BinaryField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.visit_type} report — {self.msme.business_name} by {self.bge.name} ({self.visit_date})"


class GroupReport(models.Model):
    """One report covering an entire BGE group's session/rotation.
    Authored by the group's team_lead and references the MSMEs the team
    actually supported (drawn from the group's assigned MSMEs)."""

    STATUS_CHOICES = [
        ('draft',     'Draft'),
        ('submitted', 'Submitted'),
        ('approved',  'Approved'),
    ]

    group = models.ForeignKey(
        'BGEGroup', on_delete=models.CASCADE, related_name='reports'
    )
    team_lead = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.SET_NULL, null=True,
        related_name='led_reports',
    )
    session_number = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='Optional rotation session this report covers.'
    )
    visit_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')

    # MSMEs the team actually engaged with during this session.
    msmes_supported = models.ManyToManyField(
        'MSME', blank=True, related_name='group_reports'
    )

    # Attendance — group members who showed up to / participated in the session.
    # Defaults to empty; team lead checks the present members in the dialog.
    attendees = models.ManyToManyField(
        'BusinessGrowthExpert', blank=True, related_name='attended_group_reports',
        help_text='Group members who attended this session.'
    )

    # Narrative sections — mirror the per-MSME report shape so admins can
    # review at the same level of detail.
    session_overview         = models.TextField(blank=True, help_text='How the session ran, attendance, format.')
    challenges_identified    = models.TextField(blank=True, help_text='Cross-cutting challenges observed across the cohort.')
    interventions_delivered  = models.TextField(blank=True, help_text='Group-level interventions / training / coaching delivered.')
    outcomes_achieved        = models.TextField(blank=True, help_text='Quantitative + qualitative outcomes from the session.')
    next_steps               = models.TextField(blank=True, help_text='Follow-up plan agreed with the group.')
    additional_notes         = models.TextField(blank=True)

    # Frozen PDF snapshot generated when the report is submitted.
    submitted_pdf = models.FileField(
        upload_to='group_reports/submitted/', null=True, blank=True,
    )

    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-visit_date', '-created_at']
        verbose_name = "Group Report"

    def __str__(self):
        sess = f" S{self.session_number}" if self.session_number else ''
        return f"{self.group.name}{sess} — {self.visit_date}"


class GroupReportContribution(models.Model):
    """A note from one group member contributing to a group report.

    The team lead reviews these while consolidating the final report.
    Each (group_report, bge) pair is unique — a member can edit their
    contribution but not file two for the same report. Members can also
    flag specific MSMEs they engaged with personally.
    """
    group_report = models.ForeignKey(
        'GroupReport', on_delete=models.CASCADE, related_name='contributions'
    )
    bge = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.CASCADE, related_name='group_contributions'
    )
    # MSMEs (drawn from the parent report's group) that THIS member personally
    # engaged with during the session.
    msmes_observed = models.ManyToManyField(
        'MSME', blank=True, related_name='group_contributions'
    )

    notes = models.TextField(
        blank=True,
        help_text='Member-level observations to feed into the consolidated group report.',
    )
    challenges_observed = models.TextField(blank=True)
    interventions_made  = models.TextField(blank=True)
    follow_up_needed    = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        unique_together = [('group_report', 'bge')]
        verbose_name = "Group Report Contribution"

    def __str__(self):
        return f"{self.bge.name} → {self.group_report}"


class GroupReportAttendance(models.Model):
    """Per-person MSME attendance record for a group session report.

    Mirrors the Attendance model but linked to GroupReport instead of
    TrainingSession, allowing team leads to record who attended each
    group session and link each person back to their MSME.
    """
    AGE_GROUP_CHOICES = [
        ('18-34', '18–34 (Youth)'),
        ('35-45', '35–45'),
        ('46-55', '46–55'),
        ('56+',   '56+'),
    ]
    GENDER_CHOICES       = [('M', 'Male'), ('F', 'Female')]
    REFUGEE_STATUS_CHOICES = [('R', 'Refugee'), ('H', 'Host Community')]

    group_report    = models.ForeignKey('GroupReport', on_delete=models.CASCADE, related_name='msme_attendance')
    msme            = models.ForeignKey('MSME', on_delete=models.SET_NULL, null=True, blank=True, related_name='group_report_attendances')
    attendee_name   = models.CharField(max_length=200, blank=True)
    attendee_phone  = models.CharField(max_length=30, blank=True)
    gender          = models.CharField(max_length=1, choices=GENDER_CHOICES, blank=True)
    age_group       = models.CharField(max_length=10, choices=AGE_GROUP_CHOICES, blank=True)
    refugee_status  = models.CharField(max_length=1, choices=REFUGEE_STATUS_CHOICES, blank=True, default='H')
    consent_photo   = models.BooleanField(default=True)
    consent_contact = models.BooleanField(default=True)

    class Meta:
        ordering = ['group_report', 'attendee_name']

    def __str__(self):
        name = self.attendee_name or (self.msme.business_name if self.msme else '?')
        return f"{name} — {self.group_report}"


class WorkOrder(models.Model):
    TYPE_CHOICES = [
        ('msme_support',          'MSME CRM & Business Support'),
        ('msme_data_update',      'MSME Data Update & Verification'),
        ('msme_finance_survey',   'MSME Finance Survey (Google Forms)'),
        ('msme_access_finance',   'Access to Finance & Digital Onboarding'),
        ('access_to_finance_bge', 'Access to Finance — BGE Template'),
        ('biz_continuity',          'Business Continuity & Operational Planning'),
        ('biz_continuity_workshop', 'Business Continuity — Workshop Design & Facilitation'),
        ('mobilisation',            'Mobilisation / Outreach'),
        ('group_session',         'Peer-to-Peer Group Session'),
        ('training_facilitation', 'Training Facilitation — Senior BGE'),
        ('other',                 'Other'),
    ]
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('issued', 'Issued'),
        ('signed', 'Signed'),
    ]

    bge = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.CASCADE, related_name='work_orders'
    )
    group = models.ForeignKey(
        'BGEGroup', on_delete=models.SET_NULL, null=True, blank=True, related_name='work_orders'
    )

    work_order_number = models.CharField(max_length=100, unique=True, blank=True)
    work_order_type   = models.CharField(max_length=30, choices=TYPE_CHOICES, default='msme_support')
    project_name      = models.CharField(max_length=200, default='Promoting Rural Development II (PRUDEV II)')
    issue_date        = models.DateField()
    start_date        = models.DateField(null=True, blank=True)
    end_date          = models.DateField(null=True, blank=True)
    location          = models.CharField(max_length=200, blank=True, default='Northern Uganda (Gulu & Lira)')
    duration          = models.CharField(max_length=100, blank=True, default='2 months')

    # Schedule 1
    objective  = models.TextField(blank=True)
    key_tasks  = models.TextField(blank=True, help_text='One task per line.')

    # Deliverables — list of {task_num, description, due_date}
    deliverables_json = models.JSONField(default=list, blank=True)

    # Snapshot of MSME IDs assigned to this BGE at the moment the work order
    # is issued. Preserved so co-deployment overlap can be detected even after
    # MSMEs are subsequently re-assigned to other BGEs.
    msme_ids_snapshot = models.JSONField(default=list, blank=True)

    # Payment Terms – Schedule 2
    rate_per_day          = models.PositiveIntegerField(default=60000)
    max_days              = models.PositiveSmallIntegerField(default=4)
    transport_reimbursed  = models.BooleanField(default=True)
    payment_notes         = models.TextField(blank=True)

    # Joint / co-deployment — other BGEs working with the same MSMEs in this period
    co_bges = models.ManyToManyField(
        'BusinessGrowthExpert', blank=True,
        related_name='co_deployed_work_orders',
        help_text='Other BGEs jointly deployed with this work order (for collaboration emails).',
    )

    # Signatures
    team_leader_name     = models.CharField(max_length=200, default='Stephen Maxi Opwonya')
    team_leader_position = models.CharField(max_length=200, default='Team Leader')
    created_by           = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_work_orders',
        help_text='Admin/PM account that issued this work order',
    )
    status               = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    bge_signed_date      = models.DateField(null=True, blank=True)

    # Frozen PDF generated at signing time — includes the BGE's signature.
    # Served on all subsequent downloads so the signed copy is immutable.
    signed_pdf = models.FileField(
        upload_to='work_orders/signed/', null=True, blank=True,
    )
    # PDF bytes stored in DB — survives filesystem wipes on Render deploys.
    signed_pdf_data = models.BinaryField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-issue_date', '-created_at']
        verbose_name = "Work Order"
        verbose_name_plural = "Work Orders"

    def __str__(self):
        return self.work_order_number or f"WO-{self.pk}"

    def save(self, *args, **kwargs):
        if not self.work_order_number:
            import re
            code = self.bge.bge_code or ''
            m = re.search(r'BGE-([A-Z0-9]+)-', code)
            short = m.group(1) if m else str(self.bge_id)
            prefix = 'TF' if self.work_order_type in ('training_facilitation', 'biz_continuity_workshop') else 'BGE'
            # Start from count+1 but skip any numbers already taken (handles
            # gaps left by deleted work orders so we never hit a uniqueness clash).
            seq = WorkOrder.objects.filter(bge=self.bge).count() + 1
            while WorkOrder.objects.filter(
                work_order_number=f"PRUDEV II-{prefix}-{short}-{seq:02d}"
            ).exists():
                seq += 1
            self.work_order_number = f"PRUDEV II-{prefix}-{short}-{seq:02d}"
        super().save(*args, **kwargs)


class ProgrammeGroup(models.Model):
    """A cross-cutting label that can be applied to any MSME regardless of cohort.

    Examples: 'Green MSMEs', 'Agroprocessors'.
    Programme managers are scoped to see only MSMEs in their assigned groups.
    """
    name        = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    color       = models.CharField(
        max_length=7, blank=True, default='#1A2F4B',
        help_text='Hex colour used for the chip in the UI (e.g. #2E7D32).',
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name = "Programme Group"
        verbose_name_plural = "Programme Groups"

    def __str__(self):
        return self.name


class CohortAdmin(models.Model):
    """A programme manager who has full admin-level access but only for
    the programme groups listed in `managed_groups`.  All data queries for
    MSMEs, reports, attendance etc. are automatically scoped to those groups.

    Superusers/staff see everything regardless of this model.
    """
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='cohort_admin_profile',
    )
    managed_groups = models.ManyToManyField(
        'ProgrammeGroup', blank=True, related_name='managers',
        help_text='Programme groups this manager can see and manage.',
    )

    class Meta:
        verbose_name = "Programme Manager"
        verbose_name_plural = "Programme Managers"

    def __str__(self):
        names = ', '.join(g.name for g in self.managed_groups.all()) or '(no groups)'
        return f"{self.user.get_full_name() or self.user.username} → {names}"


class AnnualReviewReport(models.Model):
    """Narrative-only annual (or quarterly) review report authored by a single BGE,
    covering multiple MSMEs selected like an attendance list.

    The quantitative data lives in GrowthSnapshot records; this model holds
    only the written summary and observations so the BGE doesn't duplicate
    numbers they already entered during the data update."""

    PERIOD_CHOICES = [
        ('annual',    'Annual Review'),
        ('quarterly', 'Quarterly Review'),
        ('midterm',   'Mid-term Review'),
    ]
    STATUS_CHOICES = [
        ('draft',     'Draft'),
        ('submitted', 'Submitted'),
        ('approved',  'Approved'),
    ]

    bge = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.CASCADE,
        related_name='annual_review_reports',
    )
    review_period = models.CharField(
        max_length=20, choices=PERIOD_CHOICES, default='annual',
    )
    review_date = models.DateField(help_text='Date the review session was conducted.')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')

    # MSMEs covered in this review (attendance list).
    msmes_reviewed = models.ManyToManyField(
        'MSME', blank=True, related_name='annual_review_reports',
        help_text='MSMEs included in this review session.',
    )

    # ── Narrative fields ──────────────────────────────────────────────────────
    session_overview      = models.TextField(blank=True,
        help_text='How the review session ran — format, attendance, general atmosphere.')
    key_achievements      = models.TextField(blank=True,
        help_text='Notable progress or milestones observed across the reviewed MSMEs.')
    challenges_identified = models.TextField(blank=True,
        help_text='Common or individual challenges observed.')
    support_provided      = models.TextField(blank=True,
        help_text='Coaching, advice, or resources provided during the review.')
    recommendations       = models.TextField(blank=True,
        help_text='Recommendations to the programme or individual MSMEs.')
    next_steps            = models.TextField(blank=True,
        help_text='Agreed follow-up actions.')
    additional_notes      = models.TextField(blank=True)

    submitted_pdf_data = models.BinaryField(null=True, blank=True)

    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-review_date', '-created_at']
        verbose_name = "Annual Review Report"

    def __str__(self):
        return f"{self.get_review_period_display()} — {self.bge.name} ({self.review_date})"


class EmailSendLog(models.Model):
    """Tracks every individual bulk email so we can skip duplicates on re-send."""
    RECIPIENT_TYPE_CHOICES = [('bge', 'BGE Expert'), ('msme', 'MSME')]

    recipient_type = models.CharField(max_length=10, choices=RECIPIENT_TYPE_CHOICES)
    recipient_id   = models.PositiveIntegerField()
    recipient_email= models.EmailField()
    subject        = models.CharField(max_length=500)
    sent_at        = models.DateTimeField(auto_now_add=True)
    sent_by        = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='emails_sent',
    )

    class Meta:
        ordering = ['-sent_at']
        indexes = [
            models.Index(fields=['recipient_type', 'recipient_id', 'subject']),
        ]

    def __str__(self):
        return f"{self.recipient_type}:{self.recipient_id} — {self.subject[:60]} ({self.sent_at:%Y-%m-%d})"


class SmsSendLog(models.Model):
    """Tracks every individual bulk SMS so we can skip duplicates on re-send."""
    RECIPIENT_TYPE_CHOICES = [('bge', 'BGE Expert'), ('msme', 'MSME')]

    recipient_type  = models.CharField(max_length=10, choices=RECIPIENT_TYPE_CHOICES)
    recipient_id    = models.PositiveIntegerField()
    recipient_phone = models.CharField(max_length=30)
    message_preview = models.CharField(max_length=160)  # first 160 chars
    sent_at         = models.DateTimeField(auto_now_add=True)
    sent_by         = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sms_sent',
    )
    status          = models.CharField(max_length=20, default='sent')  # sent / failed
    error           = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-sent_at']
        indexes = [
            models.Index(fields=['recipient_type', 'recipient_id']),
        ]

    def __str__(self):
        return f"{self.recipient_type}:{self.recipient_id} → {self.recipient_phone} ({self.sent_at:%Y-%m-%d})"


# ── User Security Profile ─────────────────────────────────────────────────
class UserSecurityProfile(models.Model):
    """Tracks password change requirements and last-changed date for every user."""
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='security_profile'
    )
    must_change_password  = models.BooleanField(default=True,
        help_text='Force password change on next login (set on account creation).')
    password_last_changed = models.DateTimeField(null=True, blank=True,
        help_text='Set whenever the user successfully changes their password.')
    viewer_approved = models.BooleanField(default=True,
        help_text='False = account is pending admin approval and has no data access. '
                   'Set to False automatically for Google sign-ins outside the allowed domain '
                   'list that could not be linked to a BGE/programme-manager profile.')

    class Meta:
        verbose_name = 'User Security Profile'

    def __str__(self):
        return f"{self.user.username} — change required: {self.must_change_password}"


# ── T-Shirt Receipt ────────────────────────────────────────────────────────

class TshirtReceipt(models.Model):
    title       = models.CharField(max_length=200, default="T-Shirt Collection Receipt")
    event       = models.CharField(max_length=200, blank=True)   # e.g. "BGE TOT 2026 – Adjumani"
    colour      = models.CharField(max_length=50, default="Blue")
    notes       = models.TextField(blank=True)
    created_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='tshirt_receipts')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.event}) – {self.created_at:%Y-%m-%d}"

    @property
    def total_entries(self):
        return self.entries.count()

    @property
    def signed_count(self):
        return self.entries.filter(signed=True).count()

    @property
    def fully_signed(self):
        return self.total_entries > 0 and self.signed_count == self.total_entries


class TshirtReceiptEntry(models.Model):
    SIZE_CHOICES = [('L', 'L'), ('XL', 'XL'), ('2XL', '2XL')]

    receipt     = models.ForeignKey(TshirtReceipt, related_name='entries', on_delete=models.CASCADE)
    bge         = models.ForeignKey(BusinessGrowthExpert, on_delete=models.CASCADE, related_name='tshirt_entries')
    size        = models.CharField(max_length=10, choices=SIZE_CHOICES, default='L')
    quantity    = models.PositiveIntegerField(default=1)
    signed      = models.BooleanField(default=False)
    signed_at   = models.DateTimeField(null=True, blank=True)
    order       = models.PositiveIntegerField(default=0)  # display order

    class Meta:
        ordering = ['order', 'bge__name']
        unique_together = [('receipt', 'bge')]

    def __str__(self):
        status = "✓" if self.signed else "○"
        return f"{status} {self.bge.name} — {self.size} x{self.quantity}"


# ── Work Order Timesheet & Invoice Submissions ────────────────────────────

class WorkOrderSubmission(models.Model):
    """A BGE-uploaded timesheet and/or invoice (Excel) for a specific work order.

    Files are stored both on the filesystem and as raw bytes in the DB
    (mirroring the signed_pdf/signed_pdf_data pattern) so they survive
    Render filesystem wipes.
    """
    work_order = models.ForeignKey(
        'WorkOrder', on_delete=models.CASCADE, related_name='submissions'
    )
    bge = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.CASCADE, related_name='work_order_submissions'
    )

    timesheet_file     = models.FileField(upload_to='work_orders/timesheets/', null=True, blank=True)
    timesheet_data     = models.BinaryField(null=True, blank=True)
    timesheet_filename = models.CharField(max_length=255, blank=True)

    invoice_file     = models.FileField(upload_to='work_orders/invoices/', null=True, blank=True)
    invoice_data     = models.BinaryField(null=True, blank=True)
    invoice_filename = models.CharField(max_length=255, blank=True)

    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='work_order_submissions',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Timesheet & Invoice Submission"
        verbose_name_plural = "Timesheet & Invoice Submissions"

    def __str__(self):
        return f"{self.bge.name} — {self.work_order.work_order_number} ({self.created_at:%Y-%m-%d})"


# ── Work Order Payment Tracking ────────────────────────────────────────────

class WorkOrderPayment(models.Model):
    """A single payment made against a work order. Multiple entries per
    work order form a running payment log/audit trail."""
    work_order = models.ForeignKey(
        'WorkOrder', on_delete=models.CASCADE, related_name='payments'
    )
    amount       = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField()
    balance      = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True,
        help_text='Remaining balance on the invoice after this payment.')
    reference    = models.CharField(max_length=200, blank=True,
        help_text='Bank/mobile money transaction reference, cheque number, etc.')
    notes        = models.TextField(blank=True)
    recorded_by  = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='recorded_work_order_payments',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    notified_at      = models.DateTimeField(null=True, blank=True,
        help_text='When the BGE was last emailed about this payment.')
    confirmed_by_bge = models.BooleanField(default=False,
        help_text='True once the BGE has confirmed receipt of this payment.')
    confirmed_at     = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-payment_date', '-created_at']
        verbose_name = "Work Order Payment"
        verbose_name_plural = "Work Order Payments"

    def __str__(self):
        return f"{self.work_order.work_order_number} — UGX {self.amount:,.0f} on {self.payment_date}"
