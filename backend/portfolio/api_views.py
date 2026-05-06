from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.db.models import Count, Sum
from django.contrib.auth.models import User
from django.core.mail import send_mail, EmailMultiAlternatives
from django.conf import settings
import pandas as pd
import io

from .models import (
    Portfolio, Investment, Transaction,
    MSME, BusinessGrowthExpert, SupportRequest,
    TrainingSession, Attendance, TrainingTopic,
    Cohort, BGEGroup, MSMEReport, PushSubscription,
)
from pywebpush import webpush, WebPushException
import json as _json
from .serializers import (
    PortfolioSerializer, InvestmentSerializer, TransactionSerializer,
    MSMESerializer, BusinessGrowthExpertSerializer, SupportRequestSerializer,
    TrainingSessionSerializer, AttendanceSerializer, TrainingTopicSerializer,
    CohortSerializer, BGEGroupSerializer, MSMEReportSerializer,
)


class PortfolioViewSet(viewsets.ModelViewSet):
    queryset = Portfolio.objects.all()
    serializer_class = PortfolioSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def analytics(self, request):
        portfolios = Portfolio.objects.all()
        total_value = sum(p.total_value() for p in portfolios)
        total_cost = sum(p.total_cost() for p in portfolios)
        total_return = total_value - total_cost
        total_return_pct = (total_return / total_cost * 100) if total_cost > 0 else 0
        investment_types = Investment.objects.values('investment_type').annotate(
            count=Count('id'), total_value=Sum('current_price')
        )
        return Response({
            'total_portfolios': portfolios.count(),
            'total_value': total_value,
            'total_cost': total_cost,
            'total_return': total_return,
            'total_return_percentage': total_return_pct,
            'investment_types': investment_types,
        })


class InvestmentViewSet(viewsets.ModelViewSet):
    queryset = Investment.objects.all()
    serializer_class = InvestmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Investment.objects.all()
        pid = self.request.query_params.get('portfolio')
        if pid:
            qs = qs.filter(portfolio_id=pid)
        return qs


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Transaction.objects.all()
        iid = self.request.query_params.get('investment')
        if iid:
            qs = qs.filter(investment_id=iid)
        return qs.order_by('-transaction_date')


class CohortViewSet(viewsets.ModelViewSet):
    queryset = Cohort.objects.all()
    serializer_class = CohortSerializer
    permission_classes = [IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff and not request.user.is_superuser:
            raise PermissionDenied("Only admins can delete cohorts.")
        return super().destroy(request, *args, **kwargs)


class MSMEViewSet(viewsets.ModelViewSet):
    queryset = MSME.objects.filter(is_active=True)
    serializer_class = MSMESerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = MSME.objects.filter(is_active=True)

        # BGE users only see their own assigned MSMEs
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            try:
                bge = user.bge_profile
                qs = qs.filter(assigned_bge=bge)
            except Exception:
                qs = qs.none()

        search = self.request.query_params.get('search')
        if search:
            qs = (
                qs.filter(business_name__icontains=search) |
                qs.filter(owner_name__icontains=search) |
                qs.filter(sector__icontains=search) |
                qs.filter(msme_code__icontains=search)
            )

        business_type = self.request.query_params.get('business_type')
        if business_type:
            qs = qs.filter(business_type=business_type)

        sector = self.request.query_params.get('sector')
        if sector:
            qs = qs.filter(sector=sector)

        cohort = self.request.query_params.get('cohort')
        if cohort:
            qs = qs.filter(cohort_id=cohort)

        city = self.request.query_params.get('city')
        if city:
            qs = qs.filter(city__iexact=city)

        return qs.select_related('cohort', 'assigned_bge').order_by('-created_at')

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff and not request.user.is_superuser:
            raise PermissionDenied("Only admins can delete MSMEs.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['patch'])
    def assign_bge(self, request, pk=None):
        msme = self.get_object()
        bge_id = request.data.get('bge_id')
        objectives = request.data.get('objectives', '').strip()
        assignment_date = request.data.get('assignment_date') or None
        bge = None  # initialise so the notification block below is always safe
        if bge_id:
            try:
                bge = BusinessGrowthExpert.objects.get(pk=bge_id)
                # Prevent assigning the same BGE twice
                if msme.assigned_bge_id and msme.assigned_bge_id == bge.id:
                    return Response(
                        {'error': f'{msme.business_name} is already assigned to {bge.name}.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                msme.assigned_bge = bge
            except BusinessGrowthExpert.DoesNotExist:
                return Response({'error': 'BGE not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            msme.assigned_bge = None
        msme.assignment_objectives = objectives
        msme.assignment_date = assignment_date
        msme.save()
        # Notify the BGE about the new assignment
        if bge_id and bge:
            _notify_bge(
                bge,
                title='New MSME Assignment',
                body=f'You have been assigned to {msme.business_name}. Check your dashboard for details.',
                url='/bge'
            )
        return Response(MSMESerializer(msme).data)

    @action(detail=True, methods=['patch'])
    def assign_cohort(self, request, pk=None):
        msme = self.get_object()
        cohort_id = request.data.get('cohort_id')
        if cohort_id:
            try:
                cohort = Cohort.objects.get(pk=cohort_id)
                msme.cohort = cohort
            except Cohort.DoesNotExist:
                return Response({'error': 'Cohort not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            msme.cohort = None
        msme.save()
        return Response(MSMESerializer(msme).data)

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        """Upload MSME list from Cohort 1 (CSV/Excel) or Cohort 2 (Survey Excel).
        Auto-detects format from column names.
        Accepts optional form field: cohort_name (string).
        """
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can upload MSME data.")

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        # update_existing=true (default) → update duplicates; false → skip them
        update_existing = request.data.get('update_existing', 'true').lower() != 'false'
        cohort_name = request.data.get('cohort_name', '').strip()

        # Read file (CSV or Excel)
        try:
            raw_bytes = file.read()
            if file.name.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(raw_bytes))
            elif file.name.endswith(('.xlsx', '.xls')):
                df = pd.read_excel(io.BytesIO(raw_bytes))
                # If the first row appears to be blank/unnamed, the real header may be in row 1
                unnamed = sum(1 for c in df.columns if str(c).startswith('Unnamed:'))
                if unnamed > len(df.columns) / 2:
                    df = pd.read_excel(io.BytesIO(raw_bytes), header=1)
            else:
                return Response({'error': 'Please upload a CSV or Excel file (.csv, .xlsx, .xls).'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Could not read file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        # Normalise column names for detection (strip whitespace, keep original for lookup)
        cols = set(df.columns.tolist())
        cols_stripped = {c.strip() for c in cols}

        # Cohort 2 — numbered survey format (1.1. Business Name: …)
        is_cohort2 = '1.1.  Business Name:' in cols or any('Business Name' in c for c in cols if '1.1' in c)
        # Cohort 1 — PRUDEV II Cohort1 format (Name, District, Town, Name of contact person …)
        is_cohort1 = 'Name' in cols and 'Name of contact person' in cols
        # Cohort 2 simple — survey export with plain headers (Business Name:, Name of Business Owner: …)
        is_cohort2_simple = (
            not is_cohort1 and not is_cohort2 and
            any('Business Name' in c for c in cols_stripped) and
            any('Business Owner' in c for c in cols_stripped)
        )

        if not is_cohort1 and not is_cohort2 and not is_cohort2_simple:
            return Response({
                'error': (
                    'Unrecognised file format. '
                    'Expected Cohort 1 (columns: Name, District, Town, Name of contact person, …) '
                    'or Cohort 2 format (columns: Business Name:, Name of Business Owner:, …).'
                )
            }, status=status.HTTP_400_BAD_REQUEST)

        # Resolve or create cohort
        cohort_obj = None
        if cohort_name:
            cohort_obj, _ = Cohort.objects.get_or_create(name=cohort_name)

        def clean_str(val, default=''):
            if val is None or (isinstance(val, float) and pd.isna(val)):
                return default
            s = str(val).strip()
            return '' if s == 'nan' else s

        def clean_phone(val):
            raw = clean_str(val)
            if not raw:
                return ''
            try:
                return str(int(float(raw)))
            except (ValueError, TypeError):
                return raw

        def map_gender(val):
            v = clean_str(val).upper()
            if v in ('M', 'MALE'):
                return 'MALE'
            if v in ('F', 'FEMALE'):
                return 'FEMALE'
            return ''

        def map_business_type(val):
            v = clean_str(val).upper()
            if 'MEDIUM' in v:
                return 'MEDIUM'
            if 'SMALL' in v or 'COMPANY' in v or 'SMC' in v or 'PARTNERSHIP' in v:
                return 'SMALL'
            return 'MICRO'  # sole proprietorship, cooperative, default

        def map_sector(val):
            v = clean_str(val).upper()
            if any(x in v for x in ('AGRO', 'FARM', 'AGRICULTURE', 'AGRI')):
                return 'AGRICULTURE'
            if any(x in v for x in ('MANUFACTUR', 'PROCESSING', 'MILLER', 'MILL')):
                return 'MANUFACTURING'
            if any(x in v for x in ('TRADE', 'BUYER', 'SHOP', 'INPUT', 'VET')):
                return 'TRADE'
            if any(x in v for x in ('SERVICE', 'BDS', 'DEVELOPMENT', 'FINANCIAL', 'PROVIDER', 'FINANCE')):
                return 'SERVICES'
            if 'TECH' in v or 'INNOVATOR' in v:
                return 'TECHNOLOGY'
            if 'HEALTH' in v:
                return 'HEALTHCARE'
            if 'EDUCATION' in v:
                return 'EDUCATION'
            if 'CONSTRUCT' in v:
                return 'CONSTRUCTION'
            return 'OTHER'

        created, updated, skipped = 0, 0, []

        def find_col(cols, prefix, keyword=None):
            """Match column whose stripped name starts with prefix+ space/dot, optionally containing keyword."""
            import re
            pat = re.compile(r'^\s*' + re.escape(prefix) + r'[\s\.]')
            for c in cols:
                if pat.match(c):
                    if keyword is None or keyword.lower() in c.lower():
                        return c
            return None

        # Pre-compute Cohort 2 simple column mapping once (outside the row loop)
        # Strip all column names to a lookup dict: stripped_name → original_name
        col_map = {c.strip(): c for c in cols}

        def get_col(*keywords):
            """Return first column whose stripped name contains all keywords (case-insensitive)."""
            for c_stripped, c_orig in col_map.items():
                c_lower = c_stripped.lower()
                if all(k.lower() in c_lower for k in keywords):
                    return c_orig
            return None

        if is_cohort2_simple:
            # Column names for Cohort 2 simple format (e.g. "Business Name:", "Name of Business Owner:", …)
            # Use exact strip-match first, then fallback to keyword search
            s2_bname    = col_map.get('Business Name:') or col_map.get('Business Name') or get_col('business name')
            s2_owner    = col_map.get('Name of Business Owner:') or col_map.get('Name of Business Owner') or get_col('name of business owner')
            # Phone: prefer dedicated business phone, fall back to owner contacts
            s2_phone    = (col_map.get('Business Phone Number(s):') or col_map.get('Business Phone Number')
                           or get_col('business phone') or get_col('business owner contact'))
            s2_email    = col_map.get("Business Owners Email:") or col_map.get("Business Owner's Email") or get_col('owner', 'email')
            s2_bemail   = col_map.get('Business email address') or col_map.get('Business email address ') or get_col('business email')
            s2_sex      = col_map.get('Sex') or col_map.get('Sex ') or get_col('sex')
            s2_type     = col_map.get('Type of Business: ') or col_map.get('Type of Business:') or col_map.get('Type of Business') or get_col('type of business')
            s2_district = col_map.get('District') or col_map.get('district')
            s2_town     = col_map.get('Town') or col_map.get('town')
            s2_sector   = None  # not present in this format

        # Pre-compute Cohort 2 numbered column mapping once (outside the row loop)
        if is_cohort2:
            c2_bname  = find_col(cols, '1.1',  'Business Name')
            c2_brn    = find_col(cols, '1.2',  'Registration')
            c2_owner  = find_col(cols, '1.4',  'Owner')
            c2_phone1 = find_col(cols, '1.5')   # owner contacts
            c2_sex    = find_col(cols, '1.6',  'Sex')
            c2_email  = find_col(cols, '1.7',  'Email')
            c2_type   = find_col(cols, '1.10', 'Type')
            c2_phone2 = find_col(cols, '1.12') # business phone (preferred)
            c2_bemail = find_col(cols, '1.13')
            c2_sector = find_col(cols, '2.1',  'core business')

        for i, row in df.iterrows():
            try:
                if is_cohort2_simple:
                    business_name = clean_str(row.get(s2_bname, '')) if s2_bname else ''
                    if not business_name:
                        continue

                    record = {
                        'business_name': business_name,
                        'owner_name': clean_str(row.get(s2_owner, '')) if s2_owner else '',
                        'phone': clean_phone(row.get(s2_phone, '')) if s2_phone else '',
                        'email': clean_str(row.get(s2_email, '')) if s2_email else '',
                        'business_email': clean_str(row.get(s2_bemail, '')) if s2_bemail else '',
                        'gender': map_gender(row.get(s2_sex, '')) if s2_sex else '',
                        'business_type': map_business_type(row.get(s2_type, '')) if s2_type else 'MICRO',
                        'sector': 'OTHER',
                        'state': clean_str(row.get(s2_district, '')) if s2_district else '',
                        'city': clean_str(row.get(s2_town, '')) if s2_town else '',
                        'country': 'Uganda',
                        'source_file': file.name,
                        'cohort': cohort_obj,
                        'is_active': True,
                    }

                elif is_cohort2:
                    bname_col  = c2_bname
                    owner_col  = c2_owner
                    sex_col    = c2_sex
                    email_col  = c2_email
                    type_col   = c2_type
                    phone_col  = c2_phone2 or c2_phone1
                    bemail_col = c2_bemail
                    sector_col = c2_sector
                    brn_col    = c2_brn

                    business_name = clean_str(row.get(bname_col, '')) if bname_col else ''
                    if not business_name:
                        continue

                    record = {
                        'business_name': business_name,
                        'registration_number': clean_str(row.get(brn_col, '')) if brn_col else '',
                        'owner_name': clean_str(row.get(owner_col, '')) if owner_col else '',
                        'gender': map_gender(row.get(sex_col, '')) if sex_col else '',
                        'email': clean_str(row.get(email_col, '')) if email_col else '',
                        'phone': clean_phone(row.get(phone_col, '')) if phone_col else '',
                        'business_email': clean_str(row.get(bemail_col, '')) if bemail_col else '',
                        'business_type': map_business_type(row.get(type_col, '')) if type_col else 'MICRO',
                        'sector': map_sector(row.get(sector_col, '')) if sector_col else 'OTHER',
                        'state': clean_str(row.get('District', '')),
                        'city': clean_str(row.get('Town/City', '')),
                        'country': 'Uganda',
                        'source_file': file.name,
                        'cohort': cohort_obj,
                        'is_active': True,
                    }
                else:  # Cohort 1
                    business_name = clean_str(row.get('Name', ''))
                    if not business_name:
                        continue

                    gender = map_gender(row.get('Sex of founder', row.get('Gender of Key contact person', '')))

                    record = {
                        'business_name': business_name,
                        'owner_name': clean_str(row.get('Name of contact person', '')),
                        'gender': gender,
                        'phone': clean_phone(row.get('Mobile phone numbers ', row.get('Mobile phone numbers', ''))),
                        'email': clean_str(row.get('Email Address of contact person', '')),
                        'business_email': clean_str(row.get('Business Email Address', '')),
                        'address': clean_str(row.get('Physical location', '')),
                        'state': clean_str(row.get('District', '')),
                        'city': clean_str(row.get('Town', '')),
                        'business_type': 'MICRO',
                        'sector': 'OTHER',
                        'country': 'Uganda',
                        'source_file': file.name,
                        'cohort': cohort_obj,
                        'is_active': True,
                    }

                # Update-or-create by business name + owner (avoid duplicates on re-upload)
                lookup = {'business_name': record.pop('business_name')}
                owner_name = record.get('owner_name', '')
                if owner_name:
                    lookup['owner_name'] = owner_name

                existing = MSME.objects.filter(**lookup).first()
                if existing:
                    if update_existing:
                        for k, v in record.items():
                            setattr(existing, k, v)
                        existing.save()
                        updated += 1
                    else:
                        skipped.append({'row': i + 2, 'error': f'Duplicate skipped: {lookup.get("business_name", "")}'})
                else:
                    MSME.objects.create(**lookup, **record)
                    created += 1

            except Exception as e:
                skipped.append({'row': i + 2, 'error': str(e)})

        msg = f"{created} MSMEs added, {updated} updated"
        if cohort_name:
            msg += f" (assigned to cohort: {cohort_name})"
        if skipped:
            msg += f", {len(skipped)} rows skipped"
        msg += "."

        return Response({
            'created': created,
            'updated': updated,
            'skipped': len(skipped),
            'errors': skipped[:20],  # cap at 20 in response
            'message': msg,
        })

    @action(detail=False, methods=['get'])
    def analytics(self, request):
        msmes = MSME.objects.filter(is_active=True)
        agg = msmes.aggregate(
            total_investment_needed=Sum('investment_needed'),
            total_annual_revenue=Sum('annual_revenue'),
            total_employees=Sum('employee_count'),
        )
        cohort_stats = list(
            msmes.values('cohort__name', 'cohort_id').annotate(count=Count('id')).order_by('cohort__name')
        )
        return Response({
            'total_msmes': msmes.count(),
            'total_investment_needed': agg['total_investment_needed'] or 0,
            'total_annual_revenue': agg['total_annual_revenue'] or 0,
            'total_employees': agg['total_employees'] or 0,
            'business_type_stats': list(msmes.values('business_type').annotate(count=Count('id'))),
            'sector_stats': list(msmes.values('sector').annotate(count=Count('id'))),
            'cohort_stats': cohort_stats,
            'top_cities': list(msmes.values('city').exclude(city='').annotate(count=Count('id')).order_by('-count')[:10]),
        })


class BusinessGrowthExpertViewSet(viewsets.ModelViewSet):
    queryset = BusinessGrowthExpert.objects.all()
    serializer_class = BusinessGrowthExpertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = BusinessGrowthExpert.objects.all()
        s = self.request.query_params.get('status')
        if s:
            qs = qs.filter(status=s)
        group = self.request.query_params.get('group')
        if group:
            qs = qs.filter(bge_groups__id=group)
        return qs.order_by('-created_at')

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff and not request.user.is_superuser:
            raise PermissionDenied("Only admins can delete experts.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def leaderboard(self, request):
        bges = BusinessGrowthExpert.objects.filter(status='approved').annotate(
            support_count=Count('support_requests')
        ).order_by('-support_count')
        return Response(BusinessGrowthExpertSerializer(bges, many=True).data)

    def _build_assignment_email(self, bge):
        """Build plain-text + HTML email for a BGE assignment. Shared by preview and send."""
        msmes = bge.assigned_msmes.filter(is_active=True).order_by('business_name')
        count = msmes.count()

        # ── Plain-text version ────────────────────────────────────────────────
        lines = [f"Dear {bge.name},", "", "Please find below your assignment details under the PRUDEV II Programme:", ""]
        if bge.deployment_objectives:
            lines += ["DEPLOYMENT OBJECTIVES", "─" * 40, bge.deployment_objectives, ""]
        lines += [f"ASSIGNED MSMEs ({count} {'businesses' if count != 1 else 'business'})", "─" * 40, ""]
        for i, m in enumerate(msmes, 1):
            lines.append(f"  {i}. {m.business_name} ({m.msme_code or 'No code'})")
            if m.owner_name: lines.append(f"     Owner: {m.owner_name}")
            if m.sector:     lines.append(f"     Sector: {m.sector}")
            if m.city:       lines.append(f"     Location: {m.city}")
            if m.phone:      lines.append(f"     Phone: {m.phone}")
            lines.append("")
        lines += [
            "Please log in to the PRUDEV II Portfolio Management System to view full details and submit visit reports.",
            "", "Best regards,", "PRUDEV II Programme Management", "GIZ · GOPA AFC",
        ]
        body_text = "\n".join(lines)

        # ── HTML version (renders beautifully in Outlook) ─────────────────────
        objectives_html = ""
        if bge.deployment_objectives:
            objectives_html = f"""
            <div style="background:#f8f9fa;border-left:4px solid #1A2E42;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;">
              <p style="font-weight:700;color:#1A2E42;margin:0 0 6px 0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Deployment Objectives</p>
              <p style="margin:0;color:#333;white-space:pre-line;">{bge.deployment_objectives}</p>
            </div>"""

        msme_rows_html = ""
        for i, m in enumerate(msmes, 1):
            details = []
            if m.owner_name: details.append(f"<span style='color:#555;'>Owner:</span> {m.owner_name}")
            if m.sector:     details.append(f"<span style='color:#555;'>Sector:</span> {m.sector}")
            if m.city:       details.append(f"<span style='color:#555;'>Location:</span> {m.city}")
            if m.phone:      details.append(f"<span style='color:#555;'>Phone:</span> {m.phone}")
            details_html = " &nbsp;·&nbsp; ".join(details)
            bg = "#ffffff" if i % 2 == 0 else "#f9fafb"
            msme_rows_html += f"""
            <tr style="background:{bg};">
              <td style="padding:10px 14px;font-weight:600;color:#1A2E42;width:28px;vertical-align:top;">{i}.</td>
              <td style="padding:10px 14px;">
                <strong>{m.business_name}</strong>
                <span style="color:#888;font-size:12px;margin-left:6px;">({m.msme_code or 'No code'})</span>
                {'<br><span style="font-size:12px;color:#666;">' + details_html + '</span>' if details_html else ''}
              </td>
            </tr>"""

        body_html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:#1A2E42;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><p style="margin:0;color:#fff;font-size:20px;font-weight:700;">PRUDEV II</p>
                  <p style="margin:2px 0 0;color:rgba(255,255,255,.65);font-size:12px;">MSME Portfolio Management Programme</p></td>
              <td align="right"><p style="margin:0;color:#C8102E;font-size:11px;font-weight:700;letter-spacing:.05em;">GIZ · GOPA AFC</p></td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;color:#333;font-size:15px;">Dear <strong>{bge.name}</strong>,</p>
          <p style="margin:0 0 20px;color:#555;line-height:1.6;">
            Please find below your assignment details under the <strong>PRUDEV II Programme</strong>.
          </p>

          {objectives_html}

          <!-- MSME Table -->
          <p style="font-weight:700;color:#1A2E42;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:24px 0 8px;">
            Assigned MSMEs &nbsp;<span style="background:#1A2E42;color:#fff;border-radius:12px;padding:2px 8px;font-size:11px;">{count}</span>
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8edf2;border-radius:6px;overflow:hidden;">
            <thead>
              <tr style="background:#1A2E42;">
                <th style="padding:8px 14px;color:rgba(255,255,255,.7);font-size:11px;text-align:left;font-weight:600;">#</th>
                <th style="padding:8px 14px;color:rgba(255,255,255,.7);font-size:11px;text-align:left;font-weight:600;">Business / Details</th>
              </tr>
            </thead>
            <tbody>{msme_rows_html}</tbody>
          </table>

          <p style="margin:24px 0 0;color:#555;font-size:13px;line-height:1.7;border-top:1px solid #e8edf2;padding-top:20px;">
            Please log in to the <strong>PRUDEV II Portfolio Management System</strong> to view full details and submit visit reports.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #e8edf2;">
          <p style="margin:0;color:#777;font-size:12px;">Best regards,<br><strong>PRUDEV II Programme Management</strong><br>GIZ · GOPA AFC</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

        return {
            'subject':    f"PRUDEV II — Assignment Brief: {count} MSME{'s' if count != 1 else ''}",
            'body':       body_text,
            'body_html':  body_html,
            'to':         bge.email,
            'msme_count': count,
        }

    @action(detail=True, methods=['patch'], url_path='set-objectives')
    def set_objectives(self, request, pk=None):
        """Save shared deployment objectives for this BGE."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can set deployment objectives.")
        bge = self.get_object()
        bge.deployment_objectives = request.data.get('deployment_objectives', '').strip()
        bge.save()
        return Response(BusinessGrowthExpertSerializer(bge).data)

    @action(detail=True, methods=['get'], url_path='preview-email')
    def preview_email(self, request, pk=None):
        """Return the email that would be sent without actually sending it."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can preview assignment emails.")
        bge = self.get_object()
        if not bge.email:
            return Response({'error': 'This BGE expert has no email address on record.'}, status=status.HTTP_400_BAD_REQUEST)
        if not bge.assigned_msmes.filter(is_active=True).exists():
            return Response({'error': 'This BGE expert has no assigned MSMEs.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self._build_assignment_email(bge))

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_assignment_email(self, request, pk=None):
        """Send BGE their MSME assignment via Microsoft Office 365 (richard.obuku@gopa.eu)."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can send assignment emails.")

        bge = self.get_object()
        if not bge.email:
            return Response({'error': 'This BGE expert has no email address on record.'}, status=status.HTTP_400_BAD_REQUEST)
        if not bge.assigned_msmes.filter(is_active=True).exists():
            return Response({'error': 'This BGE expert has no assigned MSMEs.'}, status=status.HTTP_400_BAD_REQUEST)

        email_data = self._build_assignment_email(bge)
        # Frontend editable preview may override subject/body
        subject   = request.data.get('subject', '').strip() or email_data['subject']
        body_text = request.data.get('body', '').strip()    or email_data['body']
        body_html = email_data['body_html']  # always use generated HTML

        from_addr  = settings.DEFAULT_FROM_EMAIL
        reply_to   = getattr(settings, 'EMAIL_REPLY_TO', 'richard.obuku@gopa.eu')
        try:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=body_text,
                from_email=from_addr,
                to=[bge.email],
                reply_to=[reply_to],
            )
            msg.attach_alternative(body_html, "text/html")
            msg.send(fail_silently=False)
            return Response({'message': f"Email sent to {bge.email} with {email_data['msme_count']} assigned MSMEs."})
        except Exception as e:
            return Response({'error': f'Failed to send email: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request):
        """Upload BGE list from Excel. Matches PRUDEV II BGE list format."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can upload BGE data.")

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not file.name.endswith(('.xlsx', '.xls')):
            return Response({'error': 'Please upload an Excel file (.xlsx or .xls).'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            df = pd.read_excel(io.BytesIO(file.read()))
        except Exception as e:
            return Response({'error': f'Could not read file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        update_existing = request.data.get('update_existing', 'true').lower() != 'false'
        created, updated, skipped = 0, 0, 0
        errors = []

        for i, row in df.iterrows():
            name = str(row.get('Full name', '')).strip()
            if not name or name == 'nan':
                continue

            # Phone: Excel stores as float (2.567e+11) — convert to clean string
            raw_phone = row.get('Phone number', '')
            if pd.notna(raw_phone) and str(raw_phone).strip() not in ('', 'nan'):
                try:
                    phone = str(int(float(raw_phone)))
                except (ValueError, TypeError):
                    phone = str(raw_phone).strip()
            else:
                phone = ''

            raw_email = row.get('Email address', '')
            email = str(raw_email).strip() if pd.notna(raw_email) else ''
            if email == 'nan':
                email = ''

            raw_location = row.get('Location', '')
            location = str(raw_location).strip() if pd.notna(raw_location) else ''
            if location == 'nan':
                location = ''

            raw_code = row.get('BGE code', row.get('BGE Code', ''))
            bge_code = str(raw_code).strip() if pd.notna(raw_code) else ''
            if bge_code == 'nan':
                bge_code = ''

            try:
                existing = BusinessGrowthExpert.objects.filter(name=name).first()
                if existing:
                    if update_existing:
                        existing.email = email
                        existing.phone = phone
                        existing.location = location
                        existing.bge_code = bge_code
                        existing.status = 'approved'
                        existing.save()
                        updated += 1
                    else:
                        errors.append(f'Row {i + 2}: {name} — Duplicate skipped')
                        skipped += 1
                else:
                    BusinessGrowthExpert.objects.create(
                        name=name, email=email, phone=phone,
                        location=location, bge_code=bge_code, status='approved'
                    )
                    created += 1
            except Exception as e:
                errors.append(f'Row {i + 2}: {name} — {str(e)}')
                skipped += 1

        return Response({
            'created': created,
            'updated': updated,
            'skipped': skipped,
            'errors': errors[:10],
            'message': f'{created} BGEs added, {updated} updated, {skipped} skipped.',
        }, status=status.HTTP_200_OK)


class BGEGroupViewSet(viewsets.ModelViewSet):
    queryset = BGEGroup.objects.all()
    serializer_class = BGEGroupSerializer
    permission_classes = [IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff and not request.user.is_superuser:
            raise PermissionDenied("Only admins can delete BGE groups.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def add_member(self, request, pk=None):
        group = self.get_object()
        bge_id = request.data.get('bge_id')
        try:
            bge = BusinessGrowthExpert.objects.get(pk=bge_id)
            group.members.add(bge)
            return Response(BGEGroupSerializer(group).data)
        except BusinessGrowthExpert.DoesNotExist:
            return Response({'error': 'Expert not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def remove_member(self, request, pk=None):
        group = self.get_object()
        bge_id = request.data.get('bge_id')
        try:
            bge = BusinessGrowthExpert.objects.get(pk=bge_id)
            group.members.remove(bge)
            return Response(BGEGroupSerializer(group).data)
        except BusinessGrowthExpert.DoesNotExist:
            return Response({'error': 'Expert not found'}, status=status.HTTP_404_NOT_FOUND)


class SupportRequestViewSet(viewsets.ModelViewSet):
    queryset = SupportRequest.objects.all()
    serializer_class = SupportRequestSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        support_request = serializer.save()
        nearby = BusinessGrowthExpert.objects.filter(
            status='approved', location__icontains=support_request.location
        )[:3]
        support_request.matched_bges.set(nearby)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TrainingSessionViewSet(viewsets.ModelViewSet):
    queryset = TrainingSession.objects.all()
    serializer_class = TrainingSessionSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'])
    def mark_attendance(self, request, pk=None):
        session = self.get_object()
        msme_id = request.data.get('msme_id')
        present = request.data.get('present', True)
        attendance, _ = Attendance.objects.get_or_create(
            session=session, msme_id=msme_id, defaults={'present': present}
        )
        attendance.present = present
        attendance.save()
        return Response(AttendanceSerializer(attendance).data)


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Attendance.objects.all()
        sid = self.request.query_params.get('session')
        if sid:
            qs = qs.filter(session_id=sid)
        return qs


class TrainingTopicViewSet(viewsets.ModelViewSet):
    queryset = TrainingTopic.objects.all()
    serializer_class = TrainingTopicSerializer
    permission_classes = [IsAuthenticated]


class MSMEReportViewSet(viewsets.ModelViewSet):
    serializer_class = MSMEReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            qs = MSMEReport.objects.all()
        else:
            try:
                bge = user.bge_profile
                qs = MSMEReport.objects.filter(bge=bge)
            except Exception:
                qs = MSMEReport.objects.none()

        msme_id = self.request.query_params.get('msme')
        if msme_id:
            qs = qs.filter(msme_id=msme_id)
        bge_id = self.request.query_params.get('bge')
        if bge_id:
            qs = qs.filter(bge_id=bge_id)
        report_status = self.request.query_params.get('status')
        if report_status:
            qs = qs.filter(status=report_status)
        return qs.select_related('msme', 'bge')

    def perform_create(self, serializer):
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            try:
                bge = user.bge_profile
                serializer.save(bge=bge)
                return
            except Exception:
                pass
        serializer.save()


class BGEUserViewSet(viewsets.ViewSet):
    """
    Admin-only viewset for managing BGE user accounts.
    Allows creating logins and linking them to BGE profiles without needing Django admin.
    """
    permission_classes = [IsAuthenticated]

    def _require_admin(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can manage users.")

    def list(self, request):
        self._require_admin(request)
        users = User.objects.filter(is_staff=False, is_superuser=False).select_related('bge_profile')
        data = []
        for u in users:
            try:
                profile = u.bge_profile
                bge_info = {'id': profile.id, 'name': profile.name, 'status': profile.status}
            except Exception:
                bge_info = None
            data.append({
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'is_active': u.is_active,
                'date_joined': u.date_joined,
                'bge_profile': bge_info,
            })
        return Response(data)

    def create(self, request):
        self._require_admin(request)
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()
        email = request.data.get('email', '').strip()
        bge_id = request.data.get('bge_id')

        if not username or not password:
            return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({'error': 'Username already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(username=username, password=password, email=email)

        if bge_id:
            try:
                bge = BusinessGrowthExpert.objects.get(pk=bge_id)
                if hasattr(bge, 'user') and bge.user:
                    user.delete()
                    return Response({'error': 'This BGE already has a user account linked.'}, status=status.HTTP_400_BAD_REQUEST)
                bge.user = user
                bge.save()
            except BusinessGrowthExpert.DoesNotExist:
                user.delete()
                return Response({'error': 'BGE profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({'id': user.id, 'username': user.username, 'email': user.email}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        self._require_admin(request)
        new_password = request.data.get('password', '').strip()
        if not new_password or len(new_password) < 6:
            return Response({'error': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        user.set_password(new_password)
        user.save()
        return Response({'message': f'Password updated for {user.username}.'})

    @action(detail=True, methods=['patch'], url_path='link-bge')
    def link_bge(self, request, pk=None):
        self._require_admin(request)
        bge_id = request.data.get('bge_id')
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        if bge_id:
            try:
                bge = BusinessGrowthExpert.objects.get(pk=bge_id)
                # Unlink any previous user linked to this BGE
                BusinessGrowthExpert.objects.filter(user=user).update(user=None)
                bge.user = user
                bge.save()
            except BusinessGrowthExpert.DoesNotExist:
                return Response({'error': 'BGE not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            BusinessGrowthExpert.objects.filter(user=user).update(user=None)
        return Response({'message': 'BGE link updated.'})

    @action(detail=True, methods=['patch'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        self._require_admin(request)
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        user.is_active = not user.is_active
        user.save()
        return Response({'is_active': user.is_active})


# ── Push notification helpers ──────────────────────────────────────────────────

def _send_push(subscription_obj, title, body, url='/'):
    """Send a single Web Push notification. Silently ignores errors."""
    try:
        webpush(
            subscription_info={
                'endpoint': subscription_obj.endpoint,
                'keys': {'p256dh': subscription_obj.p256dh, 'auth': subscription_obj.auth},
            },
            data=_json.dumps({'title': title, 'body': body, 'url': url}),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims=settings.VAPID_CLAIMS,
        )
    except WebPushException:
        pass


def _notify_bge(bge, title, body, url='/'):
    """Send push notification to all active subscriptions for a BGE's linked user."""
    if not bge.user:
        return
    for sub in PushSubscription.objects.filter(user=bge.user):
        _send_push(sub, title, body, url)


# ── Push subscription API views ────────────────────────────────────────────────

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated as _IsAuth, AllowAny as _AllowAny

@api_view(['POST'])
@permission_classes([_IsAuth])
def push_subscribe(request):
    """Save or update a push subscription for the current user.
    Accepts flat format: {endpoint, p256dh, auth} (as sent by the frontend).
    Also accepts nested format: {endpoint, keys: {p256dh, auth}} (Web Push API standard).
    """
    data = request.data
    endpoint = data.get('endpoint', '').strip()
    # Accept both flat and nested key formats
    if 'keys' in data and isinstance(data['keys'], dict):
        p256dh = data['keys'].get('p256dh', '')
        auth   = data['keys'].get('auth', '')
    else:
        p256dh = data.get('p256dh', '')
        auth   = data.get('auth', '')

    if not endpoint:
        return Response({'error': 'endpoint required'}, status=status.HTTP_400_BAD_REQUEST)
    if not p256dh or not auth:
        return Response({'error': 'p256dh and auth keys are required'}, status=status.HTTP_400_BAD_REQUEST)

    PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={'user': request.user, 'p256dh': p256dh, 'auth': auth},
    )
    return Response({'message': 'Subscribed'})


@api_view(['POST'])
@permission_classes([_IsAuth])
def push_unsubscribe(request):
    """Remove a push subscription."""
    endpoint = request.data.get('endpoint', '').strip()
    PushSubscription.objects.filter(endpoint=endpoint, user=request.user).delete()
    return Response({'message': 'Unsubscribed'})


@api_view(['GET'])
@permission_classes([_AllowAny])
def push_vapid_key(request):
    """Return the VAPID public key so the frontend can subscribe. Public endpoint."""
    return Response({'publicKey': settings.VAPID_PUBLIC_KEY})
