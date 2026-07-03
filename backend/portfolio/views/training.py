import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q

from ..models import (
    TrainingSession, Attendance, TrainingTopic, TrainingFacilitationAssignment,
    VisitReportTemplate, TrainingReport, MentorTrainingReport, WorkOrder,
    Cohort as CohortModel,
)
from ..serializers import (
    TrainingSessionSerializer, AttendanceSerializer, TrainingTopicSerializer,
    TrainingFacilitationAssignmentSerializer, VisitReportTemplateSerializer,
)
from .mixins import (
    ViewerReadOnlyMixin, _managed_groups, _is_viewer, _is_programme_manager,
)

logger = logging.getLogger(__name__)


class TrainingSessionViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    serializer_class = TrainingSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TrainingSession.objects.select_related('topic').prefetch_related(
            'businesses',
            'facilitation_assignments__bge',
            'facilitation_assignments__work_order',
            'attendances__msme',
        ).all()
        user = self.request.user
        if user.is_staff or user.is_superuser:
            pass  # see everything
        elif _managed_groups(user) is not None or _is_viewer(user):
            pass  # programme managers and viewers see all sessions
        else:
            # BGEs see sessions they are assigned to (as lead or mentor)
            try:
                bge = user.bge_profile
                qs = qs.filter(
                    Q(topic_id__in=TrainingFacilitationAssignment.objects.filter(bge=bge).values('topic_id')) |
                    Q(facilitation_assignments__bge=bge)
                ).distinct()
            except Exception:
                return qs.none()
        work_order_id = self.request.query_params.get('work_order')
        if work_order_id:
            qs = qs.filter(facilitation_assignments__work_order_id=work_order_id)
        return qs

    @action(detail=True, methods=['post'])
    def mark_attendance(self, request, pk=None):
        """Legacy single-MSME toggle kept for backward compat."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can mark attendance.")
        session = self.get_object()
        msme_id = request.data.get('msme_id')
        present = request.data.get('present', True)
        qs = Attendance.objects.filter(session=session, msme_id=msme_id)
        if qs.exists():
            att = qs.first()
            att.present = present
            att.save()
        else:
            att = Attendance.objects.create(session=session, msme_id=msme_id, present=present)
        return Response(AttendanceSerializer(att).data)


class AttendanceViewSet(ViewerReadOnlyMixin, viewsets.ModelViewSet):
    queryset = Attendance.objects.select_related('msme', 'session').all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]

    def _check_session_scope(self, request, session_id):
        """BGEs may only record attendance for sessions they're assigned to facilitate/mentor."""
        user = request.user
        if user.is_staff or user.is_superuser or _is_programme_manager(user):
            return
        try:
            bge = user.bge_profile
        except Exception:
            raise PermissionDenied("You do not have access to record attendance.")
        if not TrainingFacilitationAssignment.objects.filter(bge=bge, session_id=session_id).exists():
            raise PermissionDenied("You can only record attendance for sessions you are assigned to.")

    def create(self, request, *args, **kwargs):
        session_id = request.data.get('session')
        if session_id:
            self._check_session_scope(request, session_id)
        return super().create(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        qs = Attendance.objects.select_related('msme', 'session').all()

        # SECURITY: scope attendance records to what the user is allowed to see.
        # Staff / superusers see all. Programme managers see their groups.
        # Viewers see all (read-only role). BGEs see only sessions they are
        # assigned to facilitate or mentor — not all sessions system-wide.
        if not (user.is_staff or user.is_superuser or _is_viewer(user)):
            if _is_programme_manager(user):
                group_ids = _managed_groups(user) or []
                qs = qs.filter(session__businesses__programme_groups__in=group_ids).distinct()
            else:
                # Regular BGE: limit to sessions where this BGE has a facilitation assignment
                try:
                    bge = user.bge_profile
                    assigned_session_ids = TrainingFacilitationAssignment.objects.filter(
                        bge=bge
                    ).values_list('session_id', flat=True)
                    qs = qs.filter(session_id__in=assigned_session_ids)
                except Exception:
                    return Attendance.objects.none()

        sid = self.request.query_params.get('session')
        if sid:
            qs = qs.filter(session_id=sid)
        cohort = self.request.query_params.get('cohort')
        if cohort:
            qs = qs.filter(msme__cohort_id=cohort)
        return qs

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Participation summary — demographic totals from attendance + BGE report counts.
        Filters: cohort, session, work_order, bge, date_from, date_to.
        Groups: by_session (per training session), by_cohort, by_work_order.

        NOTE: TrainingSession has no direct work_order FK. The link is through
        TrainingFacilitationAssignment, so we build a session→work_order map
        from that table rather than traversing a non-existent relation.
        """
        from ..models import (
            MSMEReport, GroupReport, WorkOrder,
            TrainingSession, TrainingReport, MentorTrainingReport,
            TrainingFacilitationAssignment,
        )

        cohort_id     = request.query_params.get('cohort')
        session_id    = request.query_params.get('session')
        work_order_id = request.query_params.get('work_order')
        bge_id        = request.query_params.get('bge')
        date_from     = request.query_params.get('date_from')
        date_to       = request.query_params.get('date_to')

        att_qs = Attendance.objects.filter(present=True)
        rep_qs = MSMEReport.objects.filter(status='submitted')
        grp_qs = GroupReport.objects.filter(status__in=['submitted', 'approved'])

        # Session → work_order mapping (via facilitation assignments)
        fa_qs = TrainingFacilitationAssignment.objects.filter(
            session__isnull=False, work_order__isnull=False
        ).values('session_id', 'work_order_id', 'bge_id')

        # Build {session_id: set(work_order_ids)} and {session_id: set(bge_ids)}
        session_to_wos = {}
        session_to_bges = {}
        for fa in fa_qs:
            session_to_wos.setdefault(fa['session_id'], set()).add(fa['work_order_id'])
            session_to_bges.setdefault(fa['session_id'], set()).add(fa['bge_id'])

        if cohort_id:
            att_qs = att_qs.filter(msme__cohort_id=cohort_id)
            rep_qs = rep_qs.filter(msme__cohort_id=cohort_id)
        if work_order_id:
            wo_session_ids = [sid for sid, wos in session_to_wos.items()
                              if int(work_order_id) in wos]
            att_qs = att_qs.filter(session_id__in=wo_session_ids)
            rep_qs = rep_qs.filter(bge__work_orders__id=work_order_id)
        if bge_id:
            bge_session_ids = [sid for sid, bges in session_to_bges.items()
                               if int(bge_id) in bges]
            att_qs = att_qs.filter(session_id__in=bge_session_ids)
            rep_qs = rep_qs.filter(bge_id=bge_id)
            grp_qs = grp_qs.filter(team_lead_id=bge_id)
        if session_id:
            att_qs = att_qs.filter(session_id=session_id)
        if date_from:
            att_qs = att_qs.filter(session__date__gte=date_from)
            rep_qs = rep_qs.filter(visit_date__gte=date_from)
            grp_qs = grp_qs.filter(visit_date__gte=date_from)
        if date_to:
            att_qs = att_qs.filter(session__date__lte=date_to)
            rep_qs = rep_qs.filter(visit_date__lte=date_to)
            grp_qs = grp_qs.filter(visit_date__lte=date_to)

        # Pull attendance in one query; aggregate in Python to avoid N+1
        att_rows = list(att_qs.values(
            'gender', 'age_group', 'refugee_status',
            'msme_id', 'msme__cohort_id', 'session_id',
        ))

        def _dem_rows(rows):
            youth = [r for r in rows if r['age_group'] == '18-34']
            adult = [r for r in rows if r['age_group'] in ('35-45', '46-55', '56+')]
            refs  = [r for r in rows if r['refugee_status'] == 'R']
            host  = [r for r in rows if r['refugee_status'] == 'H']
            return {
                'total':          len(rows),
                'male':           sum(1 for r in rows if r['gender'] == 'M'),
                'female':         sum(1 for r in rows if r['gender'] == 'F'),
                'male_youth':     sum(1 for r in youth if r['gender'] == 'M'),
                'female_youth':   sum(1 for r in youth if r['gender'] == 'F'),
                'male_adult':     sum(1 for r in adult if r['gender'] == 'M'),
                'female_adult':   sum(1 for r in adult if r['gender'] == 'F'),
                'refugees_total': len(refs),
                'refugee_male':   sum(1 for r in refs if r['gender'] == 'M'),
                'refugee_female': sum(1 for r in refs if r['gender'] == 'F'),
                'host_community': len(host),
            }

        overall = _dem_rows(att_rows)
        overall.update({
            'msme_reports':         rep_qs.count(),
            'unique_msmes_visited': rep_qs.values('msme').distinct().count(),
            'group_sessions':       grp_qs.count(),
        })

        # ── Per-session breakdown ──────────────────────────────────────────────
        tr_by_session = {tr.session_id: tr.id
                         for tr in TrainingReport.objects.only('id', 'session_id')}
        mr_by_session = {}
        for mr in MentorTrainingReport.objects.values('session_id', 'id'):
            mr_by_session.setdefault(mr['session_id'], []).append(mr['id'])

        sess_qs = TrainingSession.objects.select_related('topic').prefetch_related(
            'facilitation_assignments__bge',
        ).order_by('date')
        if date_from:
            sess_qs = sess_qs.filter(date__gte=date_from)
        if date_to:
            sess_qs = sess_qs.filter(date__lte=date_to)
        if session_id:
            sess_qs = sess_qs.filter(id=session_id)

        session_data = []
        for sess in sess_qs:
            s_rows = [r for r in att_rows if r['session_id'] == sess.id]
            dem = _dem_rows(s_rows)

            lead_name = None
            mentor_names = []
            for fa in sess.facilitation_assignments.all():
                if fa.role == 'lead' and fa.bge_id:
                    lead_name = fa.bge.name
                elif fa.role == 'mentor' and fa.bge_id:
                    mentor_names.append(fa.bge.name)

            topic_number = ''
            if sess.topic_id:
                t = sess.topic
                if t.section_number:
                    topic_number = f"{t.module_number}.{t.section_number}"
                else:
                    topic_number = str(t.module_number)

            dem.update({
                'session_id':          sess.id,
                'session_title':       sess.title,
                'session_date':        str(sess.date),
                'session_location':    sess.location or '',
                'topic_name':          sess.topic.name if sess.topic_id else '',
                'topic_number':        topic_number,
                'lead_bge_name':       lead_name or '',
                'mentor_names':        mentor_names,
                'has_training_report': sess.id in tr_by_session,
                'training_report_id':  tr_by_session.get(sess.id),
                'mentor_report_count': len(mr_by_session.get(sess.id, [])),
                'registered_count':    sess.businesses.count(),
            })
            session_data.append(dem)

        # ── Per-cohort breakdown ───────────────────────────────────────────────
        rep_by_cohort = {}
        for item in rep_qs.values('msme__cohort_id', 'msme_id'):
            cid = item['msme__cohort_id']
            if cid not in rep_by_cohort:
                rep_by_cohort[cid] = {'count': 0, 'msmes': set()}
            rep_by_cohort[cid]['count'] += 1
            rep_by_cohort[cid]['msmes'].add(item['msme_id'])

        cohorts_data = []
        for cohort in CohortModel.objects.all().order_by('name'):
            c_rows = [r for r in att_rows if r['msme__cohort_id'] == cohort.id]
            c_rep  = rep_by_cohort.get(cohort.id, {'count': 0, 'msmes': set()})
            if not c_rows and not c_rep['count']:
                continue
            row = _dem_rows(c_rows)
            row.update({'cohort_id': cohort.id, 'cohort_name': cohort.name,
                        'msme_reports': c_rep['count'],
                        'unique_msmes': len(c_rep['msmes'])})
            cohorts_data.append(row)

        # ── Per-work-order breakdown ───────────────────────────────────────────
        # Build {work_order_id: set(session_ids)} from the facilitation assignment map
        wo_to_sessions = {}
        for sid, wos in session_to_wos.items():
            for wid in wos:
                wo_to_sessions.setdefault(wid, set()).add(sid)

        rep_by_bge = {}
        for item in rep_qs.values('bge_id', 'msme_id'):
            bid = item['bge_id']
            if bid not in rep_by_bge:
                rep_by_bge[bid] = {'count': 0, 'msmes': set()}
            rep_by_bge[bid]['count'] += 1
            rep_by_bge[bid]['msmes'].add(item['msme_id'])

        wo_data = []
        for wo in WorkOrder.objects.select_related('bge').order_by('-issue_date'):
            wo_sids = wo_to_sessions.get(wo.id, set())
            w_rows  = [r for r in att_rows if r['session_id'] in wo_sids]
            w_rep   = rep_by_bge.get(wo.bge_id, {'count': 0, 'msmes': set()})
            if not w_rows and not w_rep['count']:
                continue
            row = _dem_rows(w_rows)
            row.update({
                'work_order_id':     wo.id,
                'work_order_number': wo.work_order_number,
                'work_order_type':   wo.get_work_order_type_display(),
                'bge_name':          wo.bge.name,
                'bge_code':          wo.bge.bge_code or '',
                'issue_date':        str(wo.issue_date),
                'start_date':        str(wo.start_date) if wo.start_date else None,
                'end_date':          str(wo.end_date) if wo.end_date else None,
                'status':            wo.status,
                'msme_reports':      w_rep['count'],
                'unique_msmes':      len(w_rep['msmes']),
            })
            wo_data.append(row)

        overall['by_session']    = session_data
        overall['by_cohort']     = cohorts_data
        overall['by_work_order'] = wo_data
        return Response(overall)


class TrainingTopicViewSet(viewsets.ModelViewSet):
    queryset = TrainingTopic.objects.all()
    serializer_class = TrainingTopicSerializer
    permission_classes = [IsAuthenticated]


class TrainingFacilitationAssignmentViewSet(viewsets.ModelViewSet):
    """
    Manage training facilitation assignments.
    - Admins/programme managers: full CRUD.
    - BGEs: read-only, scoped to their own assignments.
    """
    serializer_class = TrainingFacilitationAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = TrainingFacilitationAssignment.objects.select_related(
            'bge', 'topic', 'assigned_by', 'session', 'work_order'
        )
        # BGEs only see their own assignments
        if not (user.is_staff or user.is_superuser or hasattr(user, 'cohort_admin_profile')):
            try:
                bge = user.bge_profile
                return qs.filter(bge=bge)
            except Exception:
                return qs.none()
        # Optional filters
        session_id = self.request.query_params.get('session')
        if session_id:
            qs = qs.filter(session_id=session_id)
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        bge_id = self.request.query_params.get('bge')
        if bge_id:
            qs = qs.filter(bge_id=bge_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

    def create(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'cohort_admin_profile')):
            raise PermissionDenied("Only programme managers can create facilitation assignments.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'cohort_admin_profile')):
            raise PermissionDenied("Only programme managers can edit facilitation assignments.")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'cohort_admin_profile')):
            raise PermissionDenied("Only programme managers can remove facilitation assignments.")
        return super().destroy(request, *args, **kwargs)


class VisitReportTemplateViewSet(viewsets.ModelViewSet):
    """CRUD for visit report templates. List is public (authenticated); CUD is admin-only."""
    serializer_class = VisitReportTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = VisitReportTemplate.objects.all()
        if self.request.query_params.get('active_only') == '1':
            qs = qs.filter(is_active=True)
        return qs

    def _require_admin(self):
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            raise PermissionDenied("Only admins can manage report templates.")

    def create(self, request, *args, **kwargs):
        self._require_admin(); return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._require_admin(); return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._require_admin(); return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin(); return super().destroy(request, *args, **kwargs)
