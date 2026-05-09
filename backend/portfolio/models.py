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
    assigned_bge = models.ForeignKey(
        'BusinessGrowthExpert', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_msmes'
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
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name

class TrainingSession(models.Model):
    title = models.CharField(max_length=200)
    date = models.DateField()
    location = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    topic = models.ForeignKey(TrainingTopic, on_delete=models.SET_NULL, null=True, related_name='sessions')
    businesses = models.ManyToManyField('MSME', blank=True, related_name='sessions_attended')

    def __str__(self):
        return f"{self.title} ({self.date})"

class Attendance(models.Model):
    session = models.ForeignKey(TrainingSession, on_delete=models.CASCADE, related_name='attendances')
    msme = models.ForeignKey('MSME', on_delete=models.CASCADE, related_name='attendances')
    present = models.BooleanField(default=False)
    marked_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('session', 'msme')

    def __str__(self):
        return f"{self.msme} - {self.session}: {'Present' if self.present else 'Absent'}"


class MSMEReport(models.Model):
    VISIT_TYPES = [
        ('initial', 'Initial Assessment'),
        ('followup', 'Follow-up Visit'),
        ('final', 'Final Assessment'),
        ('training', 'Training Support'),
        ('mentoring', 'Mentoring Session'),
    ]
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('reviewed', 'Reviewed'),
    ]

    msme = models.ForeignKey('MSME', on_delete=models.CASCADE, related_name='reports')
    bge = models.ForeignKey('BusinessGrowthExpert', on_delete=models.CASCADE, related_name='reports')
    visit_type = models.CharField(max_length=20, choices=VISIT_TYPES, default='followup')
    visit_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')

    # Template sections
    business_overview = models.TextField(blank=True, help_text='Brief overview of the business current state')
    challenges_identified = models.TextField(blank=True, help_text='Key challenges observed during the visit')
    support_provided = models.TextField(blank=True, help_text='Support and guidance provided during this visit')
    recommendations = models.TextField(blank=True, help_text='Recommendations for business improvement')
    action_plan = models.TextField(blank=True, help_text='Agreed action plan with the MSME owner')
    next_steps = models.TextField(blank=True, help_text='Next steps and follow-up actions')
    additional_notes = models.TextField(blank=True, help_text='Any additional observations or notes')

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

    # Narrative sections — mirror the per-MSME report shape so admins can
    # review at the same level of detail.
    session_overview         = models.TextField(blank=True, help_text='How the session ran, attendance, format.')
    challenges_identified    = models.TextField(blank=True, help_text='Cross-cutting challenges observed across the cohort.')
    interventions_delivered  = models.TextField(blank=True, help_text='Group-level interventions / training / coaching delivered.')
    outcomes_achieved        = models.TextField(blank=True, help_text='Quantitative + qualitative outcomes from the session.')
    next_steps               = models.TextField(blank=True, help_text='Follow-up plan agreed with the group.')
    additional_notes         = models.TextField(blank=True)

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

    class Meta:
        ordering = ['-visit_date', '-created_at']
