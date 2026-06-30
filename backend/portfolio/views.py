from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.core.paginator import Paginator
from .models import Portfolio, Investment, Transaction, MSME, BusinessGrowthExpert, SupportRequest, TrainingSession, Attendance, TrainingTopic
import pandas as pd
import os
from django.conf import settings
from datetime import datetime
from django.db import models
from django import forms
from django.utils.decorators import method_decorator
import io
from collections import Counter
from .forms import SupportRequestForm, BGEPublicSignupForm, TrainingSessionForm, AttendanceForm, MSMEForm, BGEForm
from django.contrib.admin.views.decorators import staff_member_required
from django.db.models import Count
from django.core.mail import send_mail
from django.template.loader import render_to_string
import re
from django.utils import timezone as _tz
from .account_setup import ensure_bge_account

from django.views.decorators.http import require_http_methods

# Create your views here.

def home(request):
    """Home view for the portfolio dashboard"""
    # Get portfolio statistics
    portfolios = Portfolio.objects.all()
    investments = Investment.objects.all()
    transactions = Transaction.objects.all()
    
    # Calculate totals
    total_portfolios = portfolios.count()
    total_investments = investments.count()
    total_value = sum(portfolio.total_value() for portfolio in portfolios)
    total_cost = sum(portfolio.total_cost() for portfolio in portfolios)
    total_return = total_value - total_cost
    total_return_percentage = (total_return / total_cost * 100) if total_cost > 0 else 0
    
    # Get recent transactions
    recent_transactions = transactions.order_by('-transaction_date')[:5]
    
    # Get MSME statistics
    msmes = MSME.objects.filter(is_active=True)
    total_msmes = msmes.count()
    total_investment_needed = sum(msme.investment_needed or 0 for msme in msmes)
    total_annual_revenue = sum(msme.annual_revenue or 0 for msme in msmes)
    total_employees = sum(msme.employee_count or 0 for msme in msmes)
    
    # Calculate averages
    avg_revenue_per_msme = total_annual_revenue / total_msmes if total_msmes > 0 else 0
    avg_employees_per_msme = total_employees / total_msmes if total_msmes > 0 else 0
    
    # Business type distribution
    business_type_stats = {}
    for choice in MSME.BUSINESS_TYPES:
        count = msmes.filter(business_type=choice[0]).count()
        business_type_stats[choice[1]] = count
    # Sector distribution
    sector_stats = {}
    for choice in MSME.SECTORS:
        count = msmes.filter(sector=choice[0]).count()
        sector_stats[choice[1]] = count
    # Top cities
    top_cities = msmes.values('city').exclude(city='').annotate(
        count=models.Count('id')
    ).order_by('-count')[:10]
    
    # Get BGE statistics
    bges = BusinessGrowthExpert.objects.all()
    total_bges = bges.count()
    pending_bges = bges.filter(status='pending').count()
    approved_bges = bges.filter(status='approved').count()
    rejected_bges = bges.filter(status='rejected').count()
    
    # Get recent BGE signups
    recent_bge_signups = bges.order_by('-created_at')[:5]
    
    # BGE breakdowns
    bge_locations = [bge.location for bge in bges if bge.location]
    bge_skills = [bge.top_skills for bge in bges if bge.top_skills]
    bge_location_stats = Counter(bge_locations).most_common(5)
    bge_skill_stats = Counter(bge_skills).most_common(5)
    
    topics = TrainingTopic.objects.all()
    
    context = {
        'total_portfolios': total_portfolios,
        'total_investments': total_investments,
        'total_value': total_value,
        'total_return': total_return,
        'total_return_percentage': total_return_percentage,
        'recent_transactions': recent_transactions,
        'portfolios': portfolios,
        'total_msmes': total_msmes,
        'total_investment_needed': total_investment_needed,
        'total_annual_revenue': total_annual_revenue,
        'total_employees': total_employees,
        'avg_revenue_per_msme': avg_revenue_per_msme,
        'avg_employees_per_msme': avg_employees_per_msme,
        'business_type_stats': business_type_stats,
        'sector_stats': sector_stats,
        'top_cities': top_cities,
        'total_bges': total_bges,
        'pending_bges': pending_bges,
        'approved_bges': approved_bges,
        'rejected_bges': rejected_bges,
        'recent_bge_signups': recent_bge_signups,
        'bge_location_stats': bge_location_stats,
        'bge_skill_stats': bge_skill_stats,
        'topics': topics,
    }
    
    return render(request, 'portfolio/home.html', context)

def msme_list(request):
    """Display list of MSMEs with filtering and search"""
    msmes = MSME.objects.filter(is_active=True)
    
    # Search functionality
    search_query = request.GET.get('search', '')
    if search_query:
        msmes = msmes.filter(
            models.Q(business_name__icontains=search_query) |
            models.Q(owner_name__icontains=search_query) |
            models.Q(sector__icontains=search_query) |
            models.Q(msme_code__icontains=search_query) |
            models.Q(city__icontains=search_query) |
            models.Q(state__icontains=search_query)
        )
    
    # Filtering
    business_type = request.GET.get('business_type', '')
    sector = request.GET.get('sector', '')
    city = request.GET.get('city', '')
    state = request.GET.get('state', '')
    
    if business_type:
        msmes = msmes.filter(business_type=business_type)
    if sector:
        msmes = msmes.filter(sector=sector)
    if city:
        msmes = msmes.filter(city__iexact=city)
    if state:
        msmes = msmes.filter(state__iexact=state)
    
    # Ordering
    msmes = msmes.order_by('-created_at')
    
    # Pagination
    paginator = Paginator(msmes, 25)  # Show 25 MSMEs per page
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    
    # For filter dropdowns
    business_types = MSME.BUSINESS_TYPES
    sectors = MSME.SECTORS
    all_cities = MSME.objects.exclude(city='').values_list('city', flat=True).distinct().order_by('city')
    all_states = MSME.objects.exclude(state='').values_list('state', flat=True).distinct().order_by('state')
    
    context = {
        'page_obj': page_obj,
        'search_query': search_query,
        'business_type': business_type,
        'sector': sector,
        'city': city,
        'state': state,
        'business_types': business_types,
        'sectors': sectors,
        'all_cities': all_cities,
        'all_states': all_states,
    }
    
    return render(request, 'portfolio/msme_list.html', context)

def msme_detail(request, msme_id):
    """Display detailed information about a specific MSME"""
    try:
        msme = MSME.objects.get(id=msme_id, is_active=True)
    except MSME.DoesNotExist:
        messages.error(request, 'MSME not found.')
        return redirect('msme_list')
    
    context = {
        'msme': msme,
    }
    
    return render(request, 'portfolio/msme_detail.html', context)

def upload_msme_data(request):
    """Handle Excel file upload and data processing"""
    if request.method == 'POST':
        if 'excel_file' not in request.FILES:
            messages.error(request, 'Please select an Excel file to upload.')
            return redirect('upload_msme_data')
        
        excel_file = request.FILES['excel_file']
        
        # File size validation (10MB limit)
        if excel_file.size > 10 * 1024 * 1024:  # 10MB in bytes
            messages.error(request, 'File size too large. Please upload a file smaller than 10MB.')
            return redirect('upload_msme_data')
        
        # File type validation
        if not excel_file.name.endswith(('.xlsx', '.xls')):
            messages.error(request, 'Please upload a valid Excel file (.xlsx or .xls)')
            return redirect('upload_msme_data')
        
        # Additional security check - validate file content
        try:
            import magic
            file_content = excel_file.read(1024)  # Read first 1KB
            excel_file.seek(0)  # Reset file pointer
            
            # Check if it's actually an Excel file
            mime_type = magic.from_buffer(file_content, mime=True)
            if mime_type not in ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                                'application/vnd.ms-excel']:
                messages.error(request, 'Invalid file type. Please upload a valid Excel file.')
                return redirect('upload_msme_data')
        except ImportError:
            # If python-magic is not installed, skip this check
            pass
        
        try:
            df = pd.read_excel(excel_file)
            success_count = 0
            error_count = 0
            
            # Batch processing for better performance
            batch_size = 100
            msme_batch = []
            
            for index, row in df.iterrows():
                try:
                    # Skip empty rows
                    if pd.isna(row.get('Business name', '')) or str(row.get('Business name', '')).strip() == '':
                        continue
                    
                    msme_data = {
                        'business_name': str(row.get('Business name', '')).strip(),
                        'state': str(row.get('Location', '')).strip(),
                        'city': str(row.get('Location', '')).strip(),
                        'owner_name': str(row.get('Owner name', '')).strip(),
                        'gender': str(row.get('Sex of founder', '')).strip().upper() if pd.notna(row.get('Sex of founder')) else '',
                        'phone': str(row.get('Phone number', '')).strip(),
                        'email': str(row.get('Email address of founder', '')).strip(),
                        'business_email': str(row.get('Business email', '')).strip(),
                        'sector': str(row.get('Industry', '')).strip(),
                        'business_type': str(row.get('Scale of business', '')).strip(),
                        'source_file': excel_file.name,
                        'country': 'Uganda',
                    }
                    
                    # Clean up gender field
                    if msme_data['gender'] in ['M', 'MALE']:
                        msme_data['gender'] = 'MALE'
                    elif msme_data['gender'] in ['F', 'FEMALE']:
                        msme_data['gender'] = 'FEMALE'
                    else:
                        msme_data['gender'] = 'OTHER'
                    
                    # Clean up business type field
                    business_type = msme_data['business_type'].upper()
                    if 'MICRO' in business_type:
                        msme_data['business_type'] = 'MICRO'
                    elif 'SMALL' in business_type:
                        msme_data['business_type'] = 'SMALL'
                    elif 'MEDIUM' in business_type:
                        msme_data['business_type'] = 'MEDIUM'
                    else:
                        msme_data['business_type'] = 'MICRO'
                    
                    # Clean up sector field
                    sector = msme_data['sector'].upper()
                    if 'MANUFACTURING' in sector:
                        msme_data['sector'] = 'MANUFACTURING'
                    elif 'SERVICE' in sector:
                        msme_data['sector'] = 'SERVICES'
                    elif 'TRADE' in sector:
                        msme_data['sector'] = 'TRADE'
                    elif any(word in sector for word in ['AGRICULTURE', 'FARM', 'AGRO']):
                        msme_data['sector'] = 'AGRICULTURE'
                    elif 'CONSTRUCTION' in sector:
                        msme_data['sector'] = 'CONSTRUCTION'
                    elif 'TECH' in sector:
                        msme_data['sector'] = 'TECHNOLOGY'
                    elif 'HEALTH' in sector:
                        msme_data['sector'] = 'HEALTHCARE'
                    elif 'EDUCATION' in sector:
                        msme_data['sector'] = 'EDUCATION'
                    else:
                        msme_data['sector'] = 'OTHER'
                    
                    # Create MSME if required fields are present
                    if msme_data['business_name'] and msme_data['owner_name']:
                        msme_batch.append(MSME(**msme_data))
                        
                        # Process batch when it reaches the batch size
                        if len(msme_batch) >= batch_size:
                            MSME.objects.bulk_create(msme_batch, ignore_conflicts=True)
                            success_count += len(msme_batch)
                            msme_batch = []
                    else:
                        error_count += 1
                        
                except Exception as e:
                    error_count += 1
            
            # Process remaining items in the batch
            if msme_batch:
                MSME.objects.bulk_create(msme_batch, ignore_conflicts=True)
                success_count += len(msme_batch)
            
            messages.success(request, f'Successfully imported {success_count} MSME records. {error_count} errors occurred.')
        except Exception as e:
            messages.error(request, f'Error processing Excel file: {str(e)}')
        return redirect('msme_list')
    return render(request, 'portfolio/upload_msme.html')

def msme_analytics(request):
    """Display analytics and insights about MSME data"""
    msmes = MSME.objects.filter(is_active=True)
    
    # Basic statistics
    total_msmes = msmes.count()
    total_investment_needed = sum(msme.investment_needed or 0 for msme in msmes)
    total_annual_revenue = sum(msme.annual_revenue or 0 for msme in msmes)
    total_employees = sum(msme.employee_count or 0 for msme in msmes)
    
    # Business type distribution
    business_type_stats = {}
    for choice in MSME.BUSINESS_TYPES:
        count = msmes.filter(business_type=choice[0]).count()
        business_type_stats[choice[1]] = count
    
    # Sector distribution
    sector_stats = {}
    for choice in MSME.SECTORS:
        count = msmes.filter(sector=choice[0]).count()
        sector_stats[choice[1]] = count
    
    # Top cities
    top_cities = msmes.values('city').exclude(city='').annotate(
        count=models.Count('id')
    ).order_by('-count')[:10]
    
    context = {
        'total_msmes': total_msmes,
        'total_investment_needed': total_investment_needed,
        'total_annual_revenue': total_annual_revenue,
        'total_employees': total_employees,
        'business_type_stats': business_type_stats,
        'sector_stats': sector_stats,
        'top_cities': top_cities,
    }
    
    return render(request, 'portfolio/msme_analytics.html', context)

@login_required
def msme_edit(request, msme_id):
    try:
        msme = MSME.objects.get(id=msme_id, is_active=True)
    except MSME.DoesNotExist:
        messages.error(request, 'MSME not found.')
        return redirect('msme_list')
    if request.method == 'POST':
        form = MSMEForm(request.POST, instance=msme)
        if form.is_valid():
            form.save()
            messages.success(request, 'MSME updated successfully.')
            return redirect('msme_detail', msme_id=msme.id)
    else:
        form = MSMEForm(instance=msme)
    return render(request, 'portfolio/msme_edit.html', {'form': form, 'msme': msme})

@login_required
def msme_delete(request, msme_id):
    if not request.user.is_superuser:
        messages.error(request, 'Only superusers can delete MSMEs.')
        return redirect('msme_detail', msme_id=msme_id)
    try:
        msme = MSME.objects.get(id=msme_id, is_active=True)
    except MSME.DoesNotExist:
        messages.error(request, 'MSME not found.')
        return redirect('msme_list')
    if request.method == 'POST':
        msme.delete()
        messages.success(request, 'MSME deleted successfully.')
        return redirect('msme_list')
    return render(request, 'portfolio/msme_confirm_delete.html', {'msme': msme})

def bge_list(request):
    bges = BusinessGrowthExpert.objects.all().order_by('-created_at')

    # Filtering
    location = request.GET.get('location', '')
    skill = request.GET.get('skill', '')
    search_query = request.GET.get('search', '')

    if location:
        bges = bges.filter(location__iexact=location)
    if skill:
        bges = bges.filter(top_skills__icontains=skill)
    if search_query:
        bges = bges.filter(
            models.Q(name__icontains=search_query) |
            models.Q(email__icontains=search_query) |
            models.Q(phone__icontains=search_query)
        )

    # For filter dropdowns
    all_locations = BusinessGrowthExpert.objects.exclude(location='').values_list('location', flat=True).distinct()
    all_skills = BusinessGrowthExpert.objects.exclude(top_skills='').values_list('top_skills', flat=True).distinct()

    return render(request, 'portfolio/bge_list.html', {
        'bges': bges,
        'all_locations': all_locations,
        'all_skills': all_skills,
        'location': location,
        'skill': skill,
        'search_query': search_query,
    })

def upload_bge_data(request):
    if request.method == 'POST':
        if 'excel_file' not in request.FILES:
            messages.error(request, 'Please select an Excel file to upload.')
            return redirect('upload_bge_data')
        excel_file = request.FILES['excel_file']
        
        # File size validation (10MB limit)
        if excel_file.size > 10 * 1024 * 1024:  # 10MB in bytes
            messages.error(request, 'File size too large. Please upload a file smaller than 10MB.')
            return redirect('upload_bge_data')
        
        # File type validation
        if not excel_file.name.endswith(('.xlsx', '.xls')):
            messages.error(request, 'Please upload a valid Excel file (.xlsx or .xls)')
            return redirect('upload_bge_data')
        
        # Additional security check - validate file content
        try:
            import magic
            file_content = excel_file.read(1024)  # Read first 1KB
            excel_file.seek(0)  # Reset file pointer
            
            # Check if it's actually an Excel file
            mime_type = magic.from_buffer(file_content, mime=True)
            if mime_type not in ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                                'application/vnd.ms-excel']:
                messages.error(request, 'Invalid file type. Please upload a valid Excel file.')
                return redirect('upload_bge_data')
        except ImportError:
            # If python-magic is not installed, skip this check
            pass
        
        try:
            df = pd.read_excel(excel_file)
            success_count = 0
            error_count = 0

            # Batch processing for better performance
            batch_size = 100
            bge_batch = []

            def get_field(r, *names):
                for n in names:
                    if n is None or n == '':
                        continue
                    val = r.get(n, None)
                    if pd.notna(val):
                        s = str(val).strip()
                        if s and s.lower() not in ('nan', 'none'):
                            return s
                return ''

            for index, row in df.iterrows():
                try:
                    # Accept several common column names for the name field
                    name = get_field(row, 'Full name', 'Name', 'name')
                    if not name:
                        continue

                    # Skills: either separate columns or a combined "Area of Expertise" column
                    area1 = get_field(row, 'Skill area 1', 'Skill Area 1')
                    area2 = get_field(row, 'Skill area 2', 'Skill Area 2')
                    area3 = get_field(row, 'Skill area 3', 'Skill Area 3')
                    combined = get_field(row, 'Area of Expertise', 'Area of Expertise', 'Areas of Expertise')

                    areas = [a for a in [area1, area2, area3] if a]
                    if not areas and combined:
                        # split on common separators
                        parts = [p.strip() for p in re.split('[,;\\n]', combined) if p.strip()]
                        areas = parts

                    top_skills = ', '.join(areas) if areas else ''

                    # Phone handling
                    raw_phone = get_field(row, 'Phone number', 'Phone', 'phone')
                    if raw_phone:
                        try:
                            phone = str(int(float(raw_phone)))
                        except (ValueError, TypeError):
                            phone = str(raw_phone).strip()
                    else:
                        phone = ''

                    # BGE code
                    raw_code = get_field(row, 'BGE code', 'BGE Code', 'bge_code')
                    bge_code = raw_code

                    bge_data = {
                        'name': name,
                        'email': get_field(row, 'Email address', 'Email', 'email'),
                        'phone': phone,
                        'location': get_field(row, 'Location', 'location'),
                        'bge_code': bge_code,
                        'top_skills': top_skills,
                        'status': 'approved',
                    }

                    bge_batch.append(BusinessGrowthExpert(**bge_data))

                    # Process batch when it reaches the batch size
                    if len(bge_batch) >= batch_size:
                        BusinessGrowthExpert.objects.bulk_create(bge_batch, ignore_conflicts=True)
                        success_count += len(bge_batch)
                        bge_batch = []

                except Exception:
                    error_count += 1

            # Process remaining items in the batch
            if bge_batch:
                BusinessGrowthExpert.objects.bulk_create(bge_batch, ignore_conflicts=True)
                success_count += len(bge_batch)

            # Provision accounts and send welcome emails for imported (or matched) BGEs.
            upload_time = _tz.now()
            # Iterate rows and ensure account exists for each row (idempotent)
            for index, row in df.iterrows():
                try:
                    name = get_field(row, 'Full name', 'Name', 'name')
                    email = get_field(row, 'Email address', 'Email', 'email')
                    # Find matching BGE by email first, then by name
                    bge = None
                    if email:
                        bge = BusinessGrowthExpert.objects.filter(email__iexact=email).first()
                    if not bge and name:
                        bge = BusinessGrowthExpert.objects.filter(name__iexact=name).first()
                    if bge:
                        try:
                            ensure_bge_account(bge, send_email=True)
                        except Exception:
                            # best-effort
                            pass
                except Exception:
                    continue

            messages.success(request, f'Successfully imported {success_count} BGEs. {error_count} errors occurred.')
        except Exception as e:
            messages.error(request, f'Error processing Excel file: {str(e)}')
        return redirect('bge_list')
    return render(request, 'portfolio/upload_bge.html')


@staff_member_required
@require_http_methods(["GET", "POST"])
def paste_bge_data(request):
    """Admin page: paste a plain-text or CSV list of BGEs and import them."""
    if request.method == 'POST':
        text = request.POST.get('bge_list', '')
        if not text.strip():
            messages.error(request, 'Please paste BGE rows into the input box.')
            return redirect('paste_bge_data')

        import csv
        from io import StringIO

        reader = csv.reader(StringIO(text))
        header = None
        rows = []
        for row in reader:
            # skip empty lines
            if not any(cell.strip() for cell in row):
                continue
            if header is None and len(row) > 1 and any(h.lower() in ('full name','name','email','phone') for h in row):
                header = [c.strip() for c in row]
                continue
            rows.append([c.strip() for c in row])

        success = 0
        errors = 0
        for r in rows:
            try:
                # If header mapped, create dict
                if header:
                    data = dict(zip(header, r))
                    name = data.get('Full name') or data.get('Name') or data.get('name') or ''
                    email = data.get('Email') or data.get('Email address') or data.get('email') or ''
                    phone = data.get('Phone number') or data.get('Phone') or data.get('phone') or ''
                    location = data.get('Location') or data.get('location') or ''
                    bge_code = data.get('BGE code') or data.get('BGE Code') or data.get('bge_code') or ''
                    skills = data.get('Specialisation') or data.get('Area of Expertise') or data.get('Skills') or ''
                else:
                    # best-effort positional parsing: name, phone, email, location, bge_code, skills
                    name = r[0] if len(r) > 0 else ''
                    phone = r[1] if len(r) > 1 else ''
                    email = r[2] if len(r) > 2 else ''
                    location = r[3] if len(r) > 3 else ''
                    bge_code = r[4] if len(r) > 4 else ''
                    skills = r[5] if len(r) > 5 else ''

                if not name:
                    errors += 1
                    continue

                # Normalize phone if numeric-like
                if email and isinstance(email, float):
                    email = str(email)

                # Create BGE if not exists by email or exact name
                existing = None
                if email:
                    existing = BusinessGrowthExpert.objects.filter(email__iexact=email).first()
                if not existing:
                    existing = BusinessGrowthExpert.objects.filter(name__iexact=name).first()

                if existing:
                    # update some fields
                    existing.phone = existing.phone or phone
                    existing.location = existing.location or location
                    existing.bge_code = existing.bge_code or bge_code
                    existing.top_skills = existing.top_skills or skills
                    existing.save()
                else:
                    BusinessGrowthExpert.objects.create(
                        name=name,
                        email=email,
                        phone=phone,
                        location=location,
                        bge_code=bge_code,
                        top_skills=skills,
                        status='approved',
                    )
                success += 1
            except Exception:
                errors += 1

        messages.success(request, f'Imported {success} BGEs. {errors} errors.')
        return redirect('bge_list')

    return render(request, 'portfolio/paste_bge.html')

def export_bge_excel(request):
    bges = BusinessGrowthExpert.objects.all()
    data = []
    for bge in bges:
        data.append({
            'Name': bge.name,
            'Email': bge.email,
            'Phone': bge.phone,
            'Top skills': bge.top_skills,
            'Location': bge.location,
            'Years of Experience': bge.years_of_experience,
            'Status': bge.get_status_display(),
        })
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='BGEs')
    output.seek(0)
    response = HttpResponse(output.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename=business_growth_experts.xlsx'
    return response

def bge_detail(request, bge_id):
    try:
        bge = BusinessGrowthExpert.objects.get(id=bge_id)
    except BusinessGrowthExpert.DoesNotExist:
        messages.error(request, 'Business Growth Expert not found.')
        return redirect('bge_list')
    return render(request, 'portfolio/bge_detail.html', {'bge': bge})

@login_required
def bge_edit(request, bge_id):
    try:
        bge = BusinessGrowthExpert.objects.get(id=bge_id)
    except BusinessGrowthExpert.DoesNotExist:
        messages.error(request, 'Business Growth Expert not found.')
        return redirect('bge_list')
    if request.method == 'POST':
        form = BGEForm(request.POST, instance=bge)
        if form.is_valid():
            form.save()
            messages.success(request, 'BGE updated successfully.')
            return redirect('bge_detail', bge_id=bge.id)
    else:
        form = BGEForm(instance=bge)
    return render(request, 'portfolio/bge_edit.html', {'form': form, 'bge': bge})

@login_required
def bge_delete(request, bge_id):
    if not request.user.is_staff and not request.user.is_superuser:
        messages.error(request, 'Only admins can delete BGEs.')
        return redirect('bge_detail', bge_id=bge_id)
    try:
        bge = BusinessGrowthExpert.objects.get(id=bge_id)
    except BusinessGrowthExpert.DoesNotExist:
        messages.error(request, 'Business Growth Expert not found.')
        return redirect('bge_list')
    if request.method == 'POST':
        bge.delete()
        messages.success(request, 'BGE deleted successfully.')
        return redirect('bge_list')
    return render(request, 'portfolio/bge_confirm_delete.html', {'bge': bge})

def export_msme_excel(request):
    msmes = MSME.objects.filter(is_active=True)
    data = []
    for msme in msmes:
        data.append({
            'MSME Code': msme.msme_code,
            'Business name': msme.business_name,
            'Location': f"{msme.city}, {msme.state}",
            'Owner name': msme.owner_name,
            'Sex of founder': msme.get_gender_display() if msme.gender else '',
            'Phone number': msme.phone,
            'Email address of founder': msme.email,
            'Business email': msme.business_email,
            'Age of founder': '',  # Not stored in current model
            'Industry': msme.get_sector_display(),
            'Scale of business': msme.get_business_type_display(),
            'Annual Revenue': msme.annual_revenue,
            'Employee Count': msme.employee_count,
            'Investment Needed': msme.investment_needed,
        })
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='MSMEs')
    output.seek(0)
    response = HttpResponse(output.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename=msmes.xlsx'
    return response

def support_request(request):
    matched_bges = None
    if request.method == 'POST':
        form = SupportRequestForm(request.POST)
        if form.is_valid():
            support_request = form.save(commit=False)
            msme = form.cleaned_data['msme']
            area_of_need = form.cleaned_data['area_of_need']
            support_request.msme_name = msme.business_name
            support_request.business_need = area_of_need
            support_request.latitude = form.cleaned_data.get('latitude')
            support_request.longitude = form.cleaned_data.get('longitude')
            support_request.save()
            # Matching logic: match BGE top_skills to area_of_need
            bges = BusinessGrowthExpert.objects.filter(status='approved')
            matched = []
            for bge in bges:
                skills = (bge.top_skills or '').lower()
                if area_of_need.lower() in skills:
                    matched.append(bge)
            support_request.matched_bges.set(matched)
            matched_bges = matched
            return render(request, 'portfolio/support_request_result.html', {'support_request': support_request, 'matched_bges': matched_bges})
    else:
        form = SupportRequestForm()
    return render(request, 'portfolio/support_request_form.html', {'form': form})

def bge_leaderboard(request):
    leaderboard = BusinessGrowthExpert.objects.filter(status='approved').annotate(
        demand_count=Count('support_requests', distinct=True)
    ).order_by('-demand_count', '-years_of_experience')[:10]
    return render(request, 'portfolio/bge_leaderboard.html', {'leaderboard': leaderboard})

def bge_signup(request):
    if request.method == 'POST':
        form = BGEPublicSignupForm(request.POST)
        if form.is_valid():
            bge = form.save(commit=False)
            bge.status = 'pending'
            bge.save()
            
            # Send welcome email
            try:
                subject = 'Welcome to PRUDEV II Business Growth Experts Program'
                message = f"""
Dear {bge.name},

Thank you for applying to become a Business Growth Expert (BGE) with the PRUDEV II Portfolio Manager program!

Your application has been received and is currently under review. Here are the details of your application:

Name: {bge.name}
Email: {bge.email}
Phone: {bge.phone}
Location: {bge.location}
Top Skills: {bge.top_skills}
Years of Experience: {bge.years_of_experience}

What happens next:
1. Our team will review your application within 3-5 business days
2. You will receive an email notification once your application has been approved or rejected
3. If approved, you will be able to start supporting MSMEs in your area of expertise

In the meantime, if you have any questions, please don't hesitate to contact us.

Best regards,
The PRUDEV II Team
                """
                
                from_email = settings.DEFAULT_FROM_EMAIL or 'noreply@prudev.org'
                to_email = [bge.email]
                
                send_mail(
                    subject,
                    message,
                    from_email,
                    to_email,
                    fail_silently=True  # Don't fail if email sending fails
                )
            except Exception as e:
                # Log the error but don't break the signup process
                print(f"Failed to send welcome email to {bge.email}: {str(e)}")
            
            return render(request, 'portfolio/bge_signup_success.html', {'bge': bge})
    else:
        form = BGEPublicSignupForm()
    return render(request, 'portfolio/bge_signup.html', {'form': form})

@staff_member_required
def bge_approval_list(request):
    # Get all BGEs ordered by status and creation date
    all_bges = BusinessGrowthExpert.objects.all().order_by('status', '-created_at')
    
    # Filter pending BGEs for the table
    pending_bges = BusinessGrowthExpert.objects.filter(status='pending').order_by('-created_at')
    
    # Calculate statistics
    pending_count = BusinessGrowthExpert.objects.filter(status='pending').count()
    approved_count = BusinessGrowthExpert.objects.filter(status='approved').count()
    total_count = BusinessGrowthExpert.objects.count()
    
    context = {
        'pending_bges': pending_bges,
        'all_bges': all_bges,
        'pending_count': pending_count,
        'approved_count': approved_count,
        'total_count': total_count,
    }
    return render(request, 'portfolio/bge_approval_list.html', context)

@staff_member_required
def bge_approve(request, bge_id):
    try:
        bge = BusinessGrowthExpert.objects.get(id=bge_id)
    except BusinessGrowthExpert.DoesNotExist:
        messages.error(request, 'Business Growth Expert not found.')
        return redirect('bge_approval_list')
    
    bge.status = 'approved'
    bge.save()
    
    # Send approval email
    try:
        subject = 'Congratulations! Your BGE Application Has Been Approved'
        message = f"""
Dear {bge.name},

Great news! Your application to become a Business Growth Expert (BGE) has been approved!

You are now officially part of the PRUDEV II Business Growth Experts program and can start supporting MSMEs in your area of expertise.

Your Profile:
Name: {bge.name}
Email: {bge.email}
Phone: {bge.phone}
Location: {bge.location}
Top Skills: {bge.top_skills}
Years of Experience: {bge.years_of_experience}

Next Steps:
1. You will be notified when MSMEs in your area need support
2. You can view your profile and update your information through the system
3. Start building your reputation by helping MSMEs grow their businesses

Thank you for joining our mission to support small and medium enterprises in Uganda!

Best regards,
The PRUDEV II Team
        """
        
        from_email = settings.DEFAULT_FROM_EMAIL or 'noreply@prudev.org'
        to_email = [bge.email]
        
        send_mail(
            subject,
            message,
            from_email,
            to_email,
            fail_silently=True
        )
    except Exception as e:
        print(f"Failed to send approval email to {bge.email}: {str(e)}")
    
    return redirect('bge_approval_list')

@staff_member_required
def bge_reject(request, bge_id):
    try:
        bge = BusinessGrowthExpert.objects.get(id=bge_id)
    except BusinessGrowthExpert.DoesNotExist:
        messages.error(request, 'Business Growth Expert not found.')
        return redirect('bge_approval_list')
    
    bge.status = 'rejected'
    bge.save()
    
    # Send rejection email
    try:
        subject = 'Update on Your BGE Application'
        message = f"""
Dear {bge.name},

Thank you for your interest in becoming a Business Growth Expert (BGE) with the PRUDEV II Portfolio Manager program.

After careful review of your application, we regret to inform you that we are unable to approve your application at this time.

Your Application Details:
Name: {bge.name}
Email: {bge.email}
Phone: {bge.phone}
Location: {bge.location}
Top Skills: {bge.top_skills}
Years of Experience: {bge.years_of_experience}

This decision does not reflect on your capabilities, and we encourage you to:
1. Gain more experience in your field
2. Consider reapplying in the future
3. Stay connected with our program for future opportunities

If you have any questions about this decision, please don't hesitate to contact us.

Thank you for your interest in supporting MSMEs in Uganda.

Best regards,
The PRUDEV II Team
        """
        
        from_email = settings.DEFAULT_FROM_EMAIL or 'noreply@prudev.org'
        to_email = [bge.email]
        
        send_mail(
            subject,
            message,
            from_email,
            to_email,
            fail_silently=True
        )
    except Exception as e:
        print(f"Failed to send rejection email to {bge.email}: {str(e)}")
    
    return redirect('bge_approval_list')

@staff_member_required
def bge_signups_list(request):
    # Get filter parameter
    status_filter = request.GET.get('status', '')
    
    # Get BGEs with optional status filter
    if status_filter:
        bges = BusinessGrowthExpert.objects.filter(status=status_filter).order_by('-created_at')
    else:
        bges = BusinessGrowthExpert.objects.all().order_by('-created_at')
    
    # Calculate statistics
    pending_count = BusinessGrowthExpert.objects.filter(status='pending').count()
    approved_count = BusinessGrowthExpert.objects.filter(status='approved').count()
    rejected_count = BusinessGrowthExpert.objects.filter(status='rejected').count()
    total_count = BusinessGrowthExpert.objects.count()
    
    context = {
        'bges': bges,
        'status_filter': status_filter,
        'pending_count': pending_count,
        'approved_count': approved_count,
        'rejected_count': rejected_count,
        'total_count': total_count,
    }
    return render(request, 'portfolio/bge_signups_list.html', context)

def session_list(request):
    sessions = TrainingSession.objects.all().order_by('-date')
    return render(request, 'portfolio/session_list.html', {'sessions': sessions})

def session_create(request):
    if request.method == 'POST':
        form = TrainingSessionForm(request.POST)
        if form.is_valid():
            session = form.save()
            form.save_m2m()
            return redirect('session_list')
    else:
        form = TrainingSessionForm()
    return render(request, 'portfolio/session_form.html', {'form': form})

def session_update(request, pk):
    session = get_object_or_404(TrainingSession, pk=pk)
    if request.method == 'POST':
        form = TrainingSessionForm(request.POST, instance=session)
        if form.is_valid():
            session = form.save()
            form.save_m2m()
            return redirect('session_list')
    else:
        form = TrainingSessionForm(instance=session)
    return render(request, 'portfolio/session_form.html', {'form': form, 'session': session})

def session_delete(request, pk):
    session = get_object_or_404(TrainingSession, pk=pk)
    if request.method == 'POST':
        session.delete()
        return redirect('session_list')
    return render(request, 'portfolio/session_confirm_delete.html', {'session': session})

@staff_member_required
def session_analytics(request):
    from django.db.models import Count, Q
    sessions = TrainingSession.objects.all().order_by('-date')
    msme_count = MSME.objects.count()
    total_sessions = sessions.count()
    attendance_data = []
    total_attendance = 0
    for session in sessions:
        present_count = Attendance.objects.filter(session=session, present=True).count()
        attendance_data.append({
            'session': session,
            'present_count': present_count,
            'percentage': (present_count / msme_count * 100) if msme_count else 0,
        })
        total_attendance += present_count
    avg_attendance = (total_attendance / total_sessions) if total_sessions else 0
    context = {
        'sessions': sessions,
        'msme_count': msme_count,
        'total_sessions': total_sessions,
        'avg_attendance': avg_attendance,
        'attendance_data': attendance_data,
    }
    return render(request, 'portfolio/session_analytics.html', context)

@staff_member_required
def attendance_mark(request, session_id):
    session = get_object_or_404(TrainingSession, pk=session_id)
    msmes = MSME.objects.all().order_by('business_name')
    attendance_dict = {a.msme_id: a for a in Attendance.objects.filter(session=session)}

    if request.method == 'POST':
        for msme in msmes:
            present = f'present_{msme.id}' in request.POST
            attendance, created = Attendance.objects.get_or_create(session=session, msme=msme)
            attendance.present = present
            attendance.save()
        return redirect('session_list')

    context = {
        'session': session,
        'msmes': msmes,
        'attendance_dict': attendance_dict,
    }
    return render(request, 'portfolio/attendance_mark.html', context)
