import datetime
import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Q, Count
from django.http import HttpResponse
from django.utils import timezone

from ..models import PlannedVisit, MSME, BusinessGrowthExpert, MSMEReport
from ..serializers.planned_visits import PlannedVisitSerializer
from ..google_calendar_service import sync_visit_to_google
from .mixins import (
    ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin,
    _managed_groups, _is_viewer, _is_programme_manager,
)

logger = logging.getLogger(__name__)


class PlannedVisitViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
    """
    API endpoint for managing scheduled/planned MSME visits by BGEs.
    Supports month/agenda filtering, lifecycle status transitions (planned, completed, missed),
    and RFC 5545 iCalendar (.ics) exports for Outlook/Google Calendar synchronization.
    """
    serializer_class = PlannedVisitSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        group_ids = _managed_groups(user)

        if user.is_staff or user.is_superuser or _is_viewer(user):
            qs = PlannedVisit.objects.all()
        elif group_ids is not None:
            qs = PlannedVisit.objects.filter(msme__programme_groups__in=group_ids).distinct()
        else:
            try:
                bge = user.bge_profile
                qs = PlannedVisit.objects.filter(
                    Q(bge=bge) | Q(msme__assigned_bge=bge) | Q(msme__co_assigned_bges=bge)
                ).distinct()
            except Exception:
                qs = PlannedVisit.objects.none()

        # Query parameter filters
        bge_id = self.request.query_params.get('bge')
        if bge_id:
            qs = qs.filter(bge_id=bge_id)

        msme_id = self.request.query_params.get('msme')
        if msme_id:
            qs = qs.filter(msme_id=msme_id)

        visit_status = self.request.query_params.get('status')
        if visit_status:
            qs = qs.filter(status=visit_status)

        visit_type = self.request.query_params.get('visit_type')
        if visit_type:
            qs = qs.filter(visit_type=visit_type)

        district = self.request.query_params.get('district')
        if district:
            qs = qs.filter(msme__district__iexact=district.strip())

        cohort_id = self.request.query_params.get('cohort')
        if cohort_id:
            qs = qs.filter(msme__cohort_id=cohort_id)

        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(scheduled_date__gte=start_date)

        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(scheduled_date__lte=end_date)

        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        if month and year:
            try:
                qs = qs.filter(scheduled_date__year=int(year), scheduled_date__month=int(month))
            except (ValueError, TypeError):
                pass
        elif year:
            try:
                qs = qs.filter(scheduled_date__year=int(year))
            except (ValueError, TypeError):
                pass

        return qs.select_related('msme', 'bge', 'created_by', 'missed_recorded_by', 'completed_report')

    def perform_create(self, serializer):
        user = self.request.user
        extra_kwargs = {'created_by': user}

        # If user is a BGE and 'bge' wasn't passed, assign their own profile
        if 'bge' not in serializer.validated_data and not (user.is_staff or user.is_superuser):
            try:
                extra_kwargs['bge'] = user.bge_profile
            except Exception:
                raise PermissionDenied("No BGE profile associated with this account.")

        visit = serializer.save(**extra_kwargs)
        try:
            sync_visit_to_google(visit)
        except Exception as e:
            logger.warning(f"Could not auto-sync visit #{visit.id} to Google Calendar: {e}")

    def perform_update(self, serializer):
        visit = serializer.save()
        try:
            sync_visit_to_google(visit)
        except Exception as e:
            logger.warning(f"Could not auto-sync visit update #{visit.id} to Google Calendar: {e}")

    @action(detail=True, methods=['post'], url_path='mark-missed')
    def mark_missed(self, request, pk=None):
        """
        Record a scheduled visit as missed with mandatory reason and explanation.
        """
        visit = self.get_object()
        reason = request.data.get('missed_reason', '').strip()
        notes = (
            request.data.get('missed_reason_notes')
            or request.data.get('notes')
            or ''
        ).strip()

        if not reason:
            return Response(
                {'error': 'missed_reason is required when marking a visit as missed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_reasons = dict(PlannedVisit.MISSED_REASON_CHOICES)
        if reason not in valid_reasons:
            return Response(
                {'error': f"Invalid reason '{reason}'. Choices: {list(valid_reasons.keys())}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        visit.status = 'missed'
        visit.missed_reason = reason
        visit.missed_reason_notes = notes
        visit.missed_at = timezone.now()
        visit.missed_recorded_by = request.user
        visit.save(update_fields=[
            'status', 'missed_reason', 'missed_reason_notes',
            'missed_at', 'missed_recorded_by', 'updated_at'
        ])
        try:
            sync_visit_to_google(visit)
        except Exception as e:
            logger.warning(f"Could not sync missed status for visit #{visit.id} to Google Calendar: {e}")

        serializer = self.get_serializer(visit)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='mark-completed')
    def mark_completed(self, request, pk=None):
        """
        Mark a scheduled visit as completed, optionally linking an MSMEReport.
        """
        visit = self.get_object()
        completion_notes = (
            request.data.get('completion_notes')
            or request.data.get('notes')
            or ''
        ).strip()
        report_id = request.data.get('report_id')

        visit.status = 'completed'
        visit.completed_at = timezone.now()
        visit.completion_notes = completion_notes

        if report_id:
            try:
                report = MSMEReport.objects.get(pk=report_id)
                visit.completed_report = report
            except MSMEReport.DoesNotExist:
                pass

        visit.save(update_fields=['status', 'completed_at', 'completion_notes', 'completed_report', 'updated_at'])
        try:
            sync_visit_to_google(visit)
        except Exception as e:
            logger.warning(f"Could not sync completed status for visit #{visit.id} to Google Calendar: {e}")

        serializer = self.get_serializer(visit)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='reschedule')
    def reschedule(self, request, pk=None):
        """
        Reschedule a visit to a new date and time. Marks current visit as 'rescheduled'
        and creates a new planned visit linked back to the original.
        """
        visit = self.get_object()
        new_date_str = request.data.get('new_date')
        new_start_time = request.data.get('new_start_time')
        new_end_time = request.data.get('new_end_time')
        reason = request.data.get('reason', '').strip()

        if not new_date_str:
            return Response({'error': 'new_date (YYYY-MM-DD) is required to reschedule.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_date = datetime.date.fromisoformat(new_date_str)
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        # Mark previous visit as rescheduled
        visit.status = 'rescheduled'
        if reason and not visit.notes:
            visit.notes = f"Rescheduled: {reason}"
        elif reason:
            visit.notes += f"\nRescheduled: {reason}"

        # Create new planned visit
        new_visit = PlannedVisit.objects.create(
            msme=visit.msme,
            bge=visit.bge,
            scheduled_date=new_date,
            start_time=new_start_time or visit.start_time,
            end_time=new_end_time or visit.end_time,
            visit_type=visit.visit_type,
            title=visit.title,
            objectives=visit.objectives,
            agenda=visit.agenda,
            meeting_venue=visit.meeting_venue,
            meeting_venue_notes=visit.meeting_venue_notes,
            contact_person=visit.contact_person,
            contact_phone=visit.contact_phone,
            notes=f"Rescheduled from {visit.scheduled_date}. {reason}".strip(),
            status='planned',
            original_date=visit.original_date or visit.scheduled_date,
            created_by=request.user,
        )

        visit.rescheduled_to = new_visit
        visit.save(update_fields=['status', 'notes', 'rescheduled_to', 'updated_at'])
        try:
            sync_visit_to_google(visit)
            sync_visit_to_google(new_visit)
        except Exception as e:
            logger.warning(f"Could not sync rescheduled visit #{visit.id} to Google Calendar: {e}")

        serializer = self.get_serializer(new_visit)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Aggregated summary KPIs and breakdown of missed reasons for calendar analytics.
        """
        qs = self.get_queryset()

        total = qs.count()
        planned = qs.filter(status='planned').count()
        completed = qs.filter(status='completed').count()
        missed = qs.filter(status='missed').count()
        rescheduled = qs.filter(status='rescheduled').count()

        completion_rate = round((completed / total * 100), 1) if total > 0 else 0.0

        today = timezone.localdate()
        next_week = today + datetime.timedelta(days=7)
        upcoming_7_days = qs.filter(status='planned', scheduled_date__gte=today, scheduled_date__lte=next_week).count()

        # Missed reason breakdown
        missed_counts = (
            qs.filter(status='missed')
            .values('missed_reason')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        labels_map = dict(PlannedVisit.MISSED_REASON_CHOICES)
        missed_breakdown = [
            {
                'reason': row['missed_reason'],
                'label': labels_map.get(row['missed_reason'], row['missed_reason'] or 'Unspecified'),
                'count': row['count'],
            }
            for row in missed_counts
        ]

        return Response({
            'total': total,
            'planned': planned,
            'completed': completed,
            'missed': missed,
            'rescheduled': rescheduled,
            'completion_rate': completion_rate,
            'upcoming_7_days': upcoming_7_days,
            'missed_breakdown': missed_breakdown,
        })

    @action(detail=False, methods=['get'], url_path='export-ics', permission_classes=[AllowAny])
    def export_ics(self, request):
        """
        Export filtered planned visits as an RFC 5545 iCalendar (.ics) stream
        for Microsoft Outlook, Google Calendar, or Apple Calendar.
        Allows external calendar subscribers (e.g. Google Calendar Add by URL).
        """
        user = request.user
        if user.is_authenticated:
            qs = self.get_queryset()
        else:
            # Anonymous calendar crawler (e.g. Google Calendar server)
            qs = PlannedVisit.objects.exclude(status='cancelled')
            bge_id = request.query_params.get('bge')
            if bge_id:
                qs = qs.filter(bge_id=bge_id)
            msme_id = request.query_params.get('msme')
            if msme_id:
                qs = qs.filter(msme_id=msme_id)

        ics_content = self._build_ical_calendar(qs)
        response = HttpResponse(ics_content, content_type='text/calendar; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="prudev_msme_visits.ics"'
        return response

    @action(detail=True, methods=['get'], url_path='ics', permission_classes=[AllowAny])
    def single_ics(self, request, pk=None):
        """
        Export a single visit as an .ics file.
        """
        try:
            visit = PlannedVisit.objects.get(pk=pk)
        except PlannedVisit.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        ics_content = self._build_ical_calendar([visit])
        filename = f"visit_{visit.msme.msme_code or visit.msme_id}_{visit.scheduled_date}.ics"
        response = HttpResponse(ics_content, content_type='text/calendar; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def _build_ical_calendar(self, visits):
        """Helper to generate RFC 5545 valid VCALENDAR content."""
        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//PRUDEV II//BDS Calendar Planner//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:PRUDEV II MSME Visits",
            "X-WR-TIMEZONE:Africa/Kampala",
        ]

        now_str = timezone.now().strftime('%Y%m%dT%H%M%SZ')

        for v in visits:
            # Format dates/times
            s_date = v.scheduled_date
            if v.start_time:
                dtstart = f"{s_date.strftime('%Y%m%d')}T{v.start_time.strftime('%H%M%S')}"
                if v.end_time:
                    dtend = f"{s_date.strftime('%Y%m%d')}T{v.end_time.strftime('%H%M%S')}"
                else:
                    # Default duration: 1.5 hours
                    dtend = (
                        datetime.datetime.combine(s_date, v.start_time) + datetime.timedelta(hours=1, minutes=30)
                    ).strftime('%Y%m%dT%H%M%S')
            else:
                # All-day event
                dtstart = f"VALUE=DATE:{s_date.strftime('%Y%m%d')}"
                dtend = f"VALUE=DATE:{(s_date + datetime.timedelta(days=1)).strftime('%Y%m%d')}"

            status_map = {
                'planned': 'CONFIRMED',
                'completed': 'CONFIRMED',
                'missed': 'CANCELLED',
                'rescheduled': 'CANCELLED',
                'cancelled': 'CANCELLED',
            }
            ical_status = status_map.get(v.status, 'CONFIRMED')

            summary = f"[{v.get_status_display().upper()}] {v.get_visit_type_display()} — {v.msme.business_name} ({v.bge.name})"

            desc_parts = [
                f"MSME: {v.msme.business_name} ({v.msme.msme_code or 'No code'})",
                f"BGE: {v.bge.name} ({v.bge.bge_code or ''})",
                f"Type: {v.get_visit_type_display()}",
                f"Status: {v.get_status_display()}",
            ]
            if v.objectives:
                desc_parts.append(f"Objectives: {v.objectives}")
            if v.agenda:
                desc_parts.append(f"Agenda: {v.agenda}")
            if v.contact_person:
                desc_parts.append(f"Contact: {v.contact_person} {v.contact_phone}")
            if v.status == 'missed':
                desc_parts.append(f"MISSED REASON: {v.get_missed_reason_display()}")
                if v.missed_reason_notes:
                    desc_parts.append(f"Explanation: {v.missed_reason_notes}")
            if v.completion_notes:
                desc_parts.append(f"Completion Notes: {v.completion_notes}")

            description = "\\n".join(desc_parts).replace('\r', '').replace(',', '\\,')
            venue_display = v.get_meeting_venue_display()
            district = v.msme.district or 'Northern Uganda'
            location = f"{venue_display}, {v.msme.business_name}, {district}".replace(',', '\\,')

            lines.extend([
                "BEGIN:VEVENT",
                f"UID:planned-visit-{v.id}@prudev2.glowi.africa",
                f"DTSTAMP:{now_str}",
                f"DTSTART;{dtstart}" if "VALUE=DATE" in dtstart else f"DTSTART:{dtstart}",
                f"DTEND;{dtend}" if "VALUE=DATE" in dtend else f"DTEND:{dtend}",
                f"SUMMARY:{summary}",
                f"DESCRIPTION:{description}",
                f"LOCATION:{location}",
                f"STATUS:{ical_status}",
                "END:VEVENT",
            ])

        lines.append("END:VCALENDAR")
        return "\r\n".join(lines)
