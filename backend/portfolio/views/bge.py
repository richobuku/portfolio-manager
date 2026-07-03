import logging
import io as _io
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.db.models import Count, Q
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.http import HttpResponse
import pandas as pd
import io
from pywebpush import webpush, WebPushException
import json as _json

from ..models import (
    BusinessGrowthExpert, BGEGroup, SupportRequest, MSME, PushSubscription,
)
from ..serializers import (
    BusinessGrowthExpertSerializer, BGEGroupSerializer, SupportRequestSerializer,
    MSMESerializer,
)
from ..account_setup import ensure_bge_account, send_welcome_email, send_welcome_sms
from .mixins import (
    ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin,
    _managed_groups, _is_programme_manager,
)

logger = logging.getLogger(__name__)


def _bge_signature_bytes(bge):
    """Return raw PNG bytes of the BGE's stored signature, or None."""
    if bge.signature_data:
        return bytes(bge.signature_data)
    if bge.signature:
        try:
            with open(bge.signature.path, 'rb') as f:
                return f.read()
        except Exception:
            pass
    return None


def _clean_sig_for_pdf(raw_bytes):
    """
    Re-process a signature image before embedding in a PDF.

    Applies luminance + saturation-based background removal so that
    off-white or slightly yellowed paper backgrounds become fully
    transparent, giving a clean floating signature on any background.
    Returns PNG bytes ready for reportlab.
    """
    try:
        import PIL.Image as _PIL
        img = _PIL.open(_io.BytesIO(raw_bytes)).convert('RGBA')
        pixels = list(img.getdata())
        cleaned = []
        for r, g, b, a in pixels:
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            sat_range = max(r, g, b) - min(r, g, b)
            # Bright (lum > 205) AND low saturation (sat_range < 45)
            # → paper/background → transparent
            if lum > 205 and sat_range < 45:
                cleaned.append((r, g, b, 0))
            else:
                cleaned.append((r, g, b, a))
        img.putdata(cleaned)
        buf = _io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return buf.read()
    except Exception:
        return raw_bytes  # fall back to original on any error


# ── Push notification helpers ──────────────────────────────────────────────────

def _send_push(subscription_obj, title, body, url='/'):
    """Send a single Web Push notification.

    Errors are logged. 404/410 responses (subscription gone — user uninstalled
    the PWA or revoked permission) cause the row to be deleted so the next
    notify run doesn't waste a request on a dead endpoint.
    """
    import logging as _logging
    log = _logging.getLogger(__name__)
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
    except WebPushException as exc:
        # Prune subscriptions the push service has explicitly retired.
        status_code = getattr(getattr(exc, 'response', None), 'status_code', None)
        if status_code in (404, 410):
            try:
                subscription_obj.delete()
                log.info("Pruned dead push subscription id=%s (%s)",
                         subscription_obj.pk, status_code)
            except Exception:
                pass
        else:
            log.warning("Push send failed for subscription id=%s: %s",
                        getattr(subscription_obj, 'pk', '?'), exc)


def _notify_bge(bge, title, body, url='/'):
    """Send push notification to all active subscriptions for a BGE's linked user."""
    if not bge.user:
        return
    for sub in PushSubscription.objects.filter(user=bge.user):
        _send_push(sub, title, body, url)


def _send_co_assignment_alert(existing_bge, new_bge, msme):
    """Email the existing/primary BGE to inform them that a second BGE
    has been co-assigned to visit the same MSME.

    Fails silently so the assignment itself is never blocked by an email error.
    """
    if not existing_bge.email:
        return
    import logging as _logging
    _log = _logging.getLogger(__name__)
    from django.utils.html import escape as _esc

    subject = (
        f"PRUDEV II — Joint Deployment Notice: "
        f"{new_bge.name} has also been assigned to {msme.business_name}"
    )

    # ── Plain text ─────────────────────────────────────────────────────────────
    lines = [
        f"Dear {existing_bge.name},",
        "",
        "This is to inform you that a second Business Growth Expert (BGE) has been "
        "co-assigned to visit one of the MSMEs currently in your portfolio.",
        "",
        "SHARED MSME",
        "─" * 40,
        f"  {msme.business_name} ({msme.msme_code or 'No code'})",
    ]
    if msme.owner_name: lines.append(f"  Owner:    {msme.owner_name}")
    if msme.city:       lines.append(f"  Location: {msme.city}")
    if msme.phone:      lines.append(f"  Phone:    {msme.phone}")
    lines += ["", "CO-ASSIGNED BGE", "─" * 40,
              f"  Name:  {new_bge.name} ({new_bge.bge_code or 'No code'})"]
    if new_bge.phone:  lines.append(f"  Phone: {new_bge.phone}")
    if new_bge.email:  lines.append(f"  Email: {new_bge.email}")
    if new_bge.deployment_objectives:
        obj_preview = new_bge.deployment_objectives[:300]
        lines += ["  Objectives:", f"    {obj_preview}" + ("…" if len(new_bge.deployment_objectives) > 300 else "")]
    lines += [
        "",
        "This BGE will submit a separate work order and report for their visit.",
        "Please coordinate where possible to ensure visits are complementary and not duplicated.",
        "",
        "Best regards,",
        "PRUDEV II BDS Team",
        "GIZ · GOPA AFC",
    ]
    body_text = "\n".join(lines)

    # ── HTML ────────────────────────────────────────────────────────────────────
    msme_detail_parts = []
    if msme.owner_name: msme_detail_parts.append(f"Owner: {_esc(msme.owner_name)}")
    if msme.city:       msme_detail_parts.append(f"Location: {_esc(msme.city)}")
    if msme.phone:      msme_detail_parts.append(f"Phone: {_esc(msme.phone)}")
    msme_detail_html = " &nbsp;·&nbsp; ".join(msme_detail_parts)

    contact_parts = []
    if new_bge.phone: contact_parts.append(f"📞 {_esc(new_bge.phone)}")
    if new_bge.email: contact_parts.append(f"✉ {_esc(new_bge.email)}")
    contact_html = " &nbsp;·&nbsp; ".join(contact_parts)

    obj_html = ""
    if new_bge.deployment_objectives:
        snippet = _esc(new_bge.deployment_objectives[:300]) + (
            "…" if len(new_bge.deployment_objectives) > 300 else ""
        )
        obj_html = f"""
            <div style="background:#f8f9fa;border-left:3px solid #C8102E;padding:8px 12px;
                        border-radius:0 4px 4px 0;margin-top:8px;">
              <p style="margin:0 0 3px;font-size:10px;font-weight:700;text-transform:uppercase;
                        letter-spacing:.05em;color:#C8102E;">Their Visit Objectives</p>
              <p style="margin:0;font-size:12px;color:#555;line-height:1.55;
                        white-space:pre-line;">{snippet}</p>
            </div>"""

    body_html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:#1A2E42;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><p style="margin:0;color:#fff;font-size:20px;font-weight:700;">PRUDEV II</p>
                <p style="margin:2px 0 0;color:rgba(255,255,255,.65);font-size:12px;">
                  MSME Portfolio Management Programme</p></td>
            <td align="right"><p style="margin:0;color:#C8102E;font-size:11px;
                font-weight:700;letter-spacing:.05em;">GIZ · GOPA AFC</p></td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;color:#333;font-size:15px;">
            Dear <strong>{_esc(existing_bge.name)}</strong>,
          </p>
          <p style="margin:0 0 20px;color:#555;line-height:1.6;">
            This is to inform you that a second BGE has been co-assigned to visit one of the
            MSMEs currently in your portfolio. They will submit their own separate work order
            and visit report.
          </p>

          <!-- Shared MSME -->
          <p style="font-weight:700;color:#1A2E42;font-size:12px;text-transform:uppercase;
                    letter-spacing:.05em;margin:0 0 8px;">Shared MSME</p>
          <div style="background:#E3F2FD;border:1px solid #90CAF9;border-radius:6px;
                      padding:14px 16px;margin-bottom:20px;">
            <p style="margin:0;font-weight:700;color:#1A2E42;font-size:14px;">
              {_esc(msme.business_name)}</p>
            <p style="margin:2px 0 0;font-size:11px;color:#888;">
              {_esc(msme.msme_code or 'No code')}</p>
            {f'<p style="margin:6px 0 0;font-size:12px;color:#555;">{msme_detail_html}</p>'
              if msme_detail_html else ''}
          </div>

          <!-- Co-Assigned BGE -->
          <p style="font-weight:700;color:#1A2E42;font-size:12px;text-transform:uppercase;
                    letter-spacing:.05em;margin:0 0 8px;">Co-Assigned BGE</p>
          <div style="background:#FFF3E0;border:1px solid #FFCC80;border-radius:6px;
                      padding:14px 16px;">
            <p style="margin:0 0 4px;font-weight:700;color:#1A2E42;font-size:14px;">
              {_esc(new_bge.name)}</p>
            <p style="margin:0 0 6px;font-size:11px;color:#888;">
              BGE Code: {_esc(new_bge.bge_code or 'No code')}</p>
            {f'<p style="margin:0 0 8px;font-size:12px;color:#555;">{contact_html}</p>'
              if contact_html else ''}
            {obj_html}
          </div>

          <p style="margin:24px 0 0;color:#555;font-size:13px;line-height:1.7;
                    border-top:1px solid #e8edf2;padding-top:20px;">
            Please coordinate where possible to ensure visits are complementary and not
            duplicated. Log in to the
            <strong>PRUDEV II Portfolio Management System</strong> for full details.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #e8edf2;">
          <p style="margin:0;color:#777;font-size:12px;">
            Best regards,<br><strong>PRUDEV II BDS Team</strong><br>GIZ · GOPA AFC</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=body_text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[existing_bge.email],
            reply_to=[getattr(settings, 'EMAIL_REPLY_TO', 'richard.obuku@gopa.eu')],
        )
        msg.attach_alternative(body_html, "text/html")
        msg.send(fail_silently=False)
    except Exception as exc:
        _log.warning("Co-assignment alert to %s failed: %s", existing_bge.email, exc)


class BusinessGrowthExpertViewSet(ProgrammeManagerReadOnlyMixin, ViewerReadOnlyMixin, viewsets.ModelViewSet):
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
        # Prefetch the relations the serializer pulls in (assigned_msmes,
        # bge_groups). Without this, listing N BGEs caused 2*N extra queries
        # (each BGE serialized triggered .assigned_msmes.all() and .bge_groups.all()).
        return qs.prefetch_related('assigned_msmes', 'bge_groups').order_by('-created_at')

    def destroy(self, request, *args, **kwargs):
        if not request.user.is_staff and not request.user.is_superuser:
            raise PermissionDenied("Only admins can delete experts.")
        return super().destroy(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can create expert profiles.")
        return super().create(request, *args, **kwargs)

    def _check_can_write(self, request, pk):
        user = request.user
        if user.is_staff or user.is_superuser:
            return
        own_bge = getattr(user, 'bge_profile', None)
        if own_bge is None or str(own_bge.id) != str(pk):
            raise PermissionDenied("You can only update your own profile.")

    def update(self, request, *args, **kwargs):
        self._check_can_write(request, kwargs.get('pk'))
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_can_write(request, kwargs.get('pk'))
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def leaderboard(self, request):
        bges = (BusinessGrowthExpert.objects
                .filter(status='approved')
                .prefetch_related('assigned_msmes', 'bge_groups')
                .annotate(support_count=Count('support_requests'))
                .order_by('-support_count'))
        return Response(BusinessGrowthExpertSerializer(bges, many=True).data)

    @staticmethod
    def _bge_all_msme_ids(bge):
        """Return all MSME IDs visible to a BGE: direct, co-assigned, and group MSME assignments."""
        from django.db.models import Q
        direct = set(bge.assigned_msmes.values_list('id', flat=True))
        co_assigned = set(MSME.objects.filter(co_assigned_bges=bge).values_list('id', flat=True))
        via_group = set(MSME.objects.filter(
            assigned_group__in=bge.bge_groups.all()
        ).values_list('id', flat=True))
        return direct | co_assigned | via_group

    @staticmethod
    def _already_assigned_bges(bge):
        """Return other BGEs whose issued/signed work orders overlap in date with
        any of this BGE's active work orders AND share at least one MSME.

        Detection uses (in priority order):
          1. msme_ids_snapshot — set at issue time, survives re-assignment
          2. current direct + group MSME assignments — fallback for legacy records
        Both sides use the union so legacy and new records all work.
        """
        from ..models import WorkOrder as _WO

        # Best-available MSME set for this BGE: snapshot union current
        my_current = BusinessGrowthExpertViewSet._bge_all_msme_ids(bge)
        my_wos = _WO.objects.filter(bge=bge, status__in=['issued', 'signed'])
        already = {}

        for my_wo in my_wos:
            if not (my_wo.start_date and my_wo.end_date):
                continue
            # Union snapshot with current so re-assigned MSMEs are still detected
            my_msme_ids = set(my_wo.msme_ids_snapshot or []) | my_current
            if not my_msme_ids:
                continue

            overlapping = _WO.objects.filter(
                status__in=['issued', 'signed'],
                start_date__lte=my_wo.end_date,
                end_date__gte=my_wo.start_date,
            ).exclude(bge=bge).exclude(id=my_wo.id).select_related('bge')

            for owo in overlapping:
                if owo.bge_id in already:
                    continue
                other_current = BusinessGrowthExpertViewSet._bge_all_msme_ids(owo.bge)
                other_msme_ids = set(owo.msme_ids_snapshot or []) | other_current
                shared_ids = my_msme_ids & other_msme_ids
                if shared_ids:
                    shared_msmes = list(
                        MSME.objects.filter(id__in=shared_ids)
                        .values('id', 'business_name', 'msme_code')
                        .order_by('business_name')
                    )
                    already[owo.bge_id] = {
                        'bge': owo.bge,
                        'work_order_number': owo.work_order_number,
                        'objectives': (owo.objective or owo.bge.deployment_objectives or '').strip(),
                        'shared_msmes': shared_msmes,
                    }
        return list(already.values())

    def _build_assignment_email(self, bge):
        """Build plain-text + HTML email for a BGE assignment. Shared by preview and send."""
        from django.db.models import Q
        # Include both primary and co-assigned MSMEs so the email reflects everything
        # the BGE is expected to work on — whether they are the primary or joint BGE.
        msmes = MSME.objects.filter(
            Q(assigned_bge=bge) | Q(co_assigned_bges=bge),
            is_active=True,
        ).distinct().order_by('business_name')
        count = msmes.count()
        already_assigned = self._already_assigned_bges(bge)

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
        if already_assigned:
            lines += ["PLEASE NOTE — ANOTHER BGE IS ALREADY ASSIGNED", "─" * 40]
            lines.append(
                "Another BGE has already been assigned to work with some of the same MSMEs "
                "during this period. Please be aware of their work and coordinate accordingly."
            )
            lines.append("")
            for aa in already_assigned:
                other = aa['bge']
                lines.append(f"  BGE Name:   {other.name} ({other.bge_code or 'No code'})")
                lines.append(f"  Work Order: {aa['work_order_number']}")
                if other.phone:  lines.append(f"  Phone:      {other.phone}")
                if other.email:  lines.append(f"  Email:      {other.email}")
                if aa.get('shared_msmes'):
                    lines.append(f"  Shared MSMEs ({len(aa['shared_msmes'])}):")
                    for m in aa['shared_msmes']:
                        lines.append(f"    • {m['business_name']} ({m['msme_code'] or 'No code'})")
                if aa['objectives']:
                    lines.append(f"  Their Objectives:")
                    lines.append(f"    {aa['objectives'][:300]}")
                lines.append("")

        lines += [
            "Please log in to the PRUDEV II Portfolio Management System to view full details and submit visit reports.",
            "", "Best regards,", "PRUDEV II BDS Team", "GIZ · GOPA AFC",
        ]
        body_text = "\n".join(lines)

        # ── HTML version (renders beautifully in Outlook) ─────────────────────
        from django.utils.html import escape as _esc
        objectives_html = ""
        if bge.deployment_objectives:
            objectives_html = f"""
            <div style="background:#f8f9fa;border-left:4px solid #1A2E42;padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;">
              <p style="font-weight:700;color:#1A2E42;margin:0 0 6px 0;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Deployment Objectives</p>
              <p style="margin:0;color:#333;white-space:pre-line;">{_esc(bge.deployment_objectives)}</p>
            </div>"""

        msme_rows_html = ""
        for i, m in enumerate(msmes, 1):
            details = []
            if m.owner_name: details.append(f"<span style='color:#555;'>Owner:</span> {_esc(m.owner_name)}")
            if m.sector:     details.append(f"<span style='color:#555;'>Sector:</span> {_esc(m.sector)}")
            if m.city:       details.append(f"<span style='color:#555;'>Location:</span> {_esc(m.city)}")
            if m.phone:      details.append(f"<span style='color:#555;'>Phone:</span> {_esc(m.phone)}")
            details_html = " &nbsp;·&nbsp; ".join(details)
            bg = "#ffffff" if i % 2 == 0 else "#f9fafb"
            msme_rows_html += f"""
            <tr style="background:{bg};">
              <td style="padding:10px 14px;font-weight:600;color:#1A2E42;width:28px;vertical-align:top;">{i}.</td>
              <td style="padding:10px 14px;">
                <strong>{_esc(m.business_name)}</strong>
                <span style="color:#888;font-size:12px;margin-left:6px;">({_esc(m.msme_code or 'No code')})</span>
                {'<br><span style="font-size:12px;color:#666;">' + details_html + '</span>' if details_html else ''}
              </td>
            </tr>"""

        # ── Already-assigned BGE notice (HTML) ───────────────────────────────
        co_bge_html = ""
        if already_assigned:
            aa_cards = ""
            for aa in already_assigned:
                other = aa['bge']
                obj_snippet = (_esc(aa['objectives'][:300]) + ('…' if len(aa['objectives']) > 300 else '')) if aa['objectives'] else '<em style="color:#999;">No objectives recorded for this BGE yet.</em>'
                contact_parts = []
                if other.phone: contact_parts.append(f"📞 {_esc(other.phone)}")
                if other.email: contact_parts.append(f"✉ {_esc(other.email)}")
                contact_line = " &nbsp;·&nbsp; ".join(contact_parts)
                # Build shared MSME list HTML
                shared_msmes_html = ''
                if aa.get('shared_msmes'):
                    msme_items = ''.join(
                        f'<li style="margin:3px 0;font-size:12px;color:#333;">'
                        f'<strong>{_esc(m["business_name"])}</strong>'
                        f'<span style="color:#888;margin-left:6px;">({_esc(m["msme_code"] or "No code")})</span>'
                        f'</li>'
                        for m in aa['shared_msmes']
                    )
                    shared_msmes_html = f"""
                  <div style="background:#E8F5E9;border-left:3px solid #2E7D32;padding:8px 12px;border-radius:0 4px 4px 0;margin-top:8px;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#2E7D32;">
                      Shared MSMEs ({len(aa['shared_msmes'])})
                    </p>
                    <ul style="margin:0;padding-left:16px;">{msme_items}</ul>
                  </div>"""
                aa_cards += f"""
                <div style="background:#fff;border:1px solid #e8edf2;border-radius:6px;padding:14px 16px;margin-top:10px;">
                  <p style="margin:0 0 4px;font-weight:700;color:#1A2E42;font-size:14px;">{_esc(other.name)}</p>
                  <p style="margin:0 0 8px;font-size:11px;color:#888;">Work Order: {_esc(aa['work_order_number'])} &nbsp;·&nbsp; {_esc(other.bge_code or 'No code')}</p>
                  {f'<p style="margin:0 0 8px;font-size:12px;color:#555;">{contact_line}</p>' if contact_line else ''}
                  {shared_msmes_html}
                  <div style="background:#f8f9fa;border-left:3px solid #C8102E;padding:8px 12px;border-radius:0 4px 4px 0;margin-top:8px;">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#C8102E;">Their Visit Objectives</p>
                    <p style="margin:0;font-size:12px;color:#555;line-height:1.55;white-space:pre-line;">{obj_snippet}</p>
                  </div>
                </div>"""
            co_bge_html = f"""
            <div style="background:#FFF3E0;border:1px solid #FFCC80;border-radius:8px;padding:18px 20px;margin-top:24px;">
              <p style="margin:0 0 8px;font-weight:700;color:#E65100;font-size:13px;">
                ⚠ Please Note — Another BGE Has Already Been Assigned
              </p>
              <p style="margin:0 0 12px;color:#555;font-size:13px;line-height:1.6;">
                Another BGE has already been assigned to work with some of the same MSMEs during
                this period. Please be aware of their work and coordinate accordingly to ensure
                your visits are complementary and not duplicated.
              </p>
              {aa_cards}
            </div>"""

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
          <p style="margin:0 0 16px;color:#333;font-size:15px;">Dear <strong>{_esc(bge.name)}</strong>,</p>
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

          {co_bge_html}

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #e8edf2;">
          <p style="margin:0;color:#777;font-size:12px;">Best regards,<br><strong>PRUDEV II BDS Team</strong><br>GIZ · GOPA AFC</p>
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
        if not (request.user.is_staff or request.user.is_superuser or _managed_groups(request.user) is not None):
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
        if not (request.user.is_staff or request.user.is_superuser or _managed_groups(request.user) is not None):
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

    @action(detail=True, methods=['post'], url_path='provision-account')
    def provision_account(self, request, pk=None):
        """Admin: provision or resend a BGE login account and welcome messages."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can provision BGE accounts.")
        bge = self.get_object()
        if bge.user_id:
            sent_email = send_welcome_email(bge, bge.user.username, None)
            sent_sms = send_welcome_sms(bge, bge.user.username)
            return Response({
                'result': 'resent',
                'message': f'Welcome email and SMS resent to {bge.name or "BGE"}.',
                'sent_email': sent_email,
                'sent_sms': sent_sms,
                'username': bge.user.username,
            })

        outcome = ensure_bge_account(bge, send_email=True)
        if outcome == 'created':
            return Response({
                'result': outcome,
                'message': f'Account created for {bge.name or "BGE"}.',
                'username': bge.user.username if bge.user else None,
            })
        if outcome == 'already_linked':
            return Response({
                'result': outcome,
                'message': 'This BGE already has a linked login account.',
                'username': bge.user.username if bge.user else None,
            })
        return Response({
            'result': outcome,
            'message': 'Account could not be created. Missing usable name/email/code.',
        })

    @action(detail=True, methods=['post'], url_path='upload-signature')
    def upload_signature(self, request, pk=None):
        """BGE or admin can upload / replace the BGE's signature image.

        The image is processed with Pillow: converted to RGBA and white/near-white
        pixels are made transparent, producing a clean signature on any background.
        """
        bge = self.get_object()
        # BGEs can only update their own signature; admins can update any.
        is_admin = request.user.is_staff or request.user.is_superuser
        try:
            requester_bge = request.user.bge_profile
        except Exception:
            requester_bge = None
        if not is_admin and (requester_bge is None or requester_bge.id != bge.id):
            raise PermissionDenied("You can only upload your own signature.")

        sig_file = request.FILES.get('signature')
        if not sig_file:
            return Response({'error': 'No signature file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if sig_file.size > 5 * 1024 * 1024:  # 5 MB hard cap
            return Response({'error': 'Signature file must be under 5 MB.'}, status=status.HTTP_400_BAD_REQUEST)
        if not sig_file.content_type.startswith('image/'):
            return Response({'error': 'File must be a JPEG or PNG image.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from PIL import Image as PilImage

            img = PilImage.open(sig_file).convert('RGBA')

            # Make near-white pixels transparent so the signature floats cleanly
            datas = img.getdata()
            new_data = []
            threshold = 230  # pixels brighter than this in all channels → transparent
            for item in datas:
                r, g, b, a = item
                if r > threshold and g > threshold and b > threshold:
                    new_data.append((r, g, b, 0))
                else:
                    new_data.append((r, g, b, a))
            img.putdata(new_data)

            # Normalise size: cap at 600px wide keeping aspect ratio
            max_w = 600
            if img.width > max_w:
                ratio = max_w / img.width
                img = img.resize((max_w, int(img.height * ratio)), PilImage.LANCZOS)

            buf = _io.BytesIO()
            img.save(buf, format='PNG')
            png_bytes = buf.getvalue()

            from django.core.files.base import ContentFile
            filename = f'sig_{bge.bge_code or bge.id}.png'
            bge.signature.delete(save=False)  # remove old file if present
            bge.signature.save(filename, ContentFile(png_bytes), save=False)
            # Also persist bytes in DB so signature survives Render filesystem wipes
            bge.signature_data = png_bytes
            bge.save(update_fields=['signature', 'signature_data'])

        except Exception as exc:
            return Response({'error': f'Image processing failed: {exc}'},
                            status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'signature_url': request.build_absolute_uri(f'/api/experts/{bge.id}/signature-image/') if _bge_signature_bytes(bge) else None,
            'detail': 'Signature uploaded and processed successfully.',
        })

    @action(detail=True, methods=['get'], url_path='signature-image')
    def signature_image(self, request, pk=None):
        """Serve the BGE's stored signature as a PNG.

        Reads from ``signature_data`` (DB-backed) so it works in production
        where ``/media/`` is not served and the filesystem copy may be wiped.
        """
        bge = self.get_object()
        raw = _bge_signature_bytes(bge)
        if not raw:
            return Response({'detail': 'No signature found for this BGE.'}, status=status.HTTP_404_NOT_FOUND)
        return HttpResponse(raw, content_type='image/png')

    @action(detail=True, methods=['post'], url_path='rotate-signature')
    def rotate_signature(self, request, pk=None):
        """Admin: rotate a BGE's stored signature 90° CCW or CW and save permanently."""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can rotate signatures.")
        bge = self.get_object()
        direction = request.data.get('direction', 'ccw')  # 'ccw' or 'cw'
        # PIL rotate: positive degrees = counter-clockwise
        degrees = 90 if direction == 'ccw' else -90

        raw = _bge_signature_bytes(bge)
        if not raw:
            return Response({'detail': 'No signature found for this BGE.'},
                            status=status.HTTP_404_NOT_FOUND)
        try:
            from PIL import Image as _PilImg
            img = _PilImg.open(_io.BytesIO(raw)).convert('RGBA')
            rotated = img.rotate(degrees, expand=True)
            buf = _io.BytesIO()
            rotated.save(buf, format='PNG')
            png_bytes = buf.getvalue()

            from django.core.files.base import ContentFile
            bge.signature_data = png_bytes
            fname = f'sig_{bge.bge_code or bge.id}.png'
            bge.signature.delete(save=False)
            bge.signature.save(fname, ContentFile(png_bytes), save=False)
            bge.save(update_fields=['signature', 'signature_data'])
        except Exception as exc:
            return Response({'detail': f'Rotation failed: {exc}'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'detail': f'Signature rotated {direction.upper()} 90° and saved.',
            'signature_url': request.build_absolute_uri(f'/api/experts/{bge.id}/signature-image/') if _bge_signature_bytes(bge) else None,
        })

    @action(detail=True, methods=['post'], url_path='clean-signature')
    def clean_signature(self, request, pk=None):
        """Admin: remove background from a BGE's stored signature.

        Uses BFS flood-fill seeded from all four edges to detect the background
        colour and erase connected regions of similar colour. This handles
        white, grey, cream, or any solid-colour background — not just pure white.
        A luminance sweep pass follows to catch any disconnected bright patches.
        Tolerance is configurable via POST body {'tolerance': 50} (default 50).
        """
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can clean signatures.")

        bge = self.get_object()
        raw = _bge_signature_bytes(bge)
        if not raw:
            return Response({'detail': 'No signature found for this BGE.'},
                            status=status.HTTP_404_NOT_FOUND)

        tolerance = int(request.data.get('tolerance', 50))
        tolerance = max(10, min(tolerance, 150))  # clamp to sane range

        try:
            from PIL import Image as _PilImg
            import math as _math

            img = _PilImg.open(_io.BytesIO(raw)).convert('RGBA')
            width, height = img.size
            pixels = img.load()

            # ── Step 1: sample background colour from ALL border pixels ──────
            edge_samples = []
            for x in range(width):
                edge_samples.append(pixels[x, 0][:3])
                edge_samples.append(pixels[x, height - 1][:3])
            for y in range(1, height - 1):
                edge_samples.append(pixels[0, y][:3])
                edge_samples.append(pixels[width - 1, y][:3])

            bg_r = sum(s[0] for s in edge_samples) // len(edge_samples)
            bg_g = sum(s[1] for s in edge_samples) // len(edge_samples)
            bg_b = sum(s[2] for s in edge_samples) // len(edge_samples)

            # ── Step 2: BFS flood-fill seeded from ALL four edges ────────────
            from collections import deque
            visited = [[False] * height for _ in range(width)]
            queue = deque()

            # Seed every pixel on all four edges
            for x in range(width):
                for y_seed in (0, height - 1):
                    if not visited[x][y_seed]:
                        visited[x][y_seed] = True
                        queue.append((x, y_seed))
            for y in range(1, height - 1):
                for x_seed in (0, width - 1):
                    if not visited[x_seed][y]:
                        visited[x_seed][y] = True
                        queue.append((x_seed, y))

            neighbours = [(1, 0), (-1, 0), (0, 1), (0, -1)]
            while queue:
                x, y = queue.popleft()
                r, g, b, a = pixels[x, y]
                dist = _math.sqrt((r - bg_r) ** 2 + (g - bg_g) ** 2 + (b - bg_b) ** 2)
                if dist > tolerance:
                    continue  # not background — stop expanding
                pixels[x, y] = (r, g, b, 0)  # erase
                for dx, dy in neighbours:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height and not visited[nx][ny]:
                        visited[nx][ny] = True
                        queue.append((nx, ny))

            # ── Step 3: erase isolated near-background pixels (JPEG artefacts)
            data = list(img.getdata())
            new_data = []
            for r, g, b, a in data:
                if a == 0:
                    new_data.append((r, g, b, 0))
                    continue
                dist = _math.sqrt((r - bg_r) ** 2 + (g - bg_g) ** 2 + (b - bg_b) ** 2)
                if dist < tolerance * 0.75:
                    new_data.append((r, g, b, 0))
                else:
                    new_data.append((r, g, b, a))
            img.putdata(new_data)

            # ── Step 4: luminance sweep to catch bright non-connected patches ─
            # Handles off-white paper in scanned/photographed signatures
            data2 = list(img.getdata())
            new_data2 = []
            for r, g, b, a in data2:
                if a == 0:
                    new_data2.append((r, g, b, 0))
                    continue
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                sat_range = max(r, g, b) - min(r, g, b)
                if lum > 210 and sat_range < 40:
                    new_data2.append((r, g, b, 0))
                else:
                    new_data2.append((r, g, b, a))
            img.putdata(new_data2)

            # ── Step 5: save ──────────────────────────────────────────────────
            buf = _io.BytesIO()
            img.save(buf, format='PNG')
            png_bytes = buf.getvalue()

            from django.core.files.base import ContentFile
            bge.signature_data = png_bytes
            fname = f'sig_{bge.bge_code or bge.id}.png'
            bge.signature.delete(save=False)
            bge.signature.save(fname, ContentFile(png_bytes), save=False)
            bge.save(update_fields=['signature', 'signature_data'])

        except Exception as exc:
            return Response({'detail': f'Cleaning failed: {exc}'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'detail': 'Signature background removed successfully.',
            'signature_url': request.build_absolute_uri(f'/api/experts/{bge.id}/signature-image/') if _bge_signature_bytes(bge) else None,
        })

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
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can change group membership.")
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
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can change group membership.")
        group = self.get_object()
        bge_id = request.data.get('bge_id')
        try:
            bge = BusinessGrowthExpert.objects.get(pk=bge_id)
            group.members.remove(bge)
            # If the BGE we just removed was the team lead, clear that role too
            # so they can't keep submitting reports on a group they no longer
            # belong to (the write-permission check matches on team_lead_id).
            if group.team_lead_id == bge.id:
                group.team_lead = None
                group.save(update_fields=['team_lead'])
            return Response(BGEGroupSerializer(group).data)
        except BusinessGrowthExpert.DoesNotExist:
            return Response({'error': 'Expert not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'], url_path='assign-msmes')
    def assign_msmes(self, request, pk=None):
        """Bulk-assign MSMEs to this group.
        Body: {msme_ids: [...], session_number?: int, objectives?: str}.
        Every BGE in the group's `members` will then see these MSMEs in their dashboard.
        """
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can assign MSMEs to groups.")
        group = self.get_object()
        msme_ids = request.data.get('msme_ids', [])
        if not isinstance(msme_ids, list) or not msme_ids:
            return Response({'error': 'msme_ids must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)

        session_number = request.data.get('session_number')
        objectives     = request.data.get('objectives', '').strip()

        update_fields = {'assigned_group': group}
        if session_number is not None:
            try:
                update_fields['session_number'] = int(session_number)
            except (TypeError, ValueError):
                return Response({'error': 'session_number must be an integer'}, status=status.HTTP_400_BAD_REQUEST)
        # Use the form-supplied objectives if any, otherwise fall back to the group's
        # canonical objectives so each MSME inherits its team's mission.
        effective_objectives = objectives or (group.objectives or '').strip()
        if effective_objectives:
            update_fields['assignment_objectives'] = effective_objectives

        updated = MSME.objects.filter(id__in=msme_ids, is_active=True).update(**update_fields)
        return Response({
            'group_id': group.id,
            'group_name': group.name,
            'assigned': updated,
            'msme_ids': msme_ids,
        })

    @action(detail=True, methods=['post'], url_path='unassign-msmes')
    def unassign_msmes(self, request, pk=None):
        """Remove the group assignment from given MSMEs (or all if msme_ids omitted).
        Body: {msme_ids?: [...]}"""
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can unassign MSMEs from groups.")
        group = self.get_object()
        msme_ids = request.data.get('msme_ids')
        qs = MSME.objects.filter(assigned_group=group)
        if isinstance(msme_ids, list) and msme_ids:
            qs = qs.filter(id__in=msme_ids)
        cleared = qs.update(assigned_group=None, session_number=None)
        return Response({'group_id': group.id, 'cleared': cleared})

    @action(detail=True, methods=['get'], url_path='msmes')
    def list_msmes(self, request, pk=None):
        """Return all MSMEs currently assigned to this group."""
        group = self.get_object()
        msmes = group.assigned_msmes.filter(is_active=True).order_by('session_number', 'business_name')
        return Response(MSMESerializer(msmes, many=True).data)


class SupportRequestViewSet(viewsets.ModelViewSet):
    queryset = SupportRequest.objects.all()
    serializer_class = SupportRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # BGEs only see SupportRequests that they're matched on; admins see all
        u = self.request.user
        qs = SupportRequest.objects.all()
        if not (u.is_staff or u.is_superuser):
            try:
                bge = u.bge_profile
                qs = qs.filter(matched_bges=bge).distinct()
            except Exception:
                qs = qs.none()
        return qs

    def create(self, request, *args, **kwargs):
        # Public-form flow leaves an MSME's request — but an authenticated user
        # creating one must still be the MSME-owner / admin. Restrict here so a
        # logged-in BGE cannot inject support requests on behalf of others.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        support_request = serializer.save()
        nearby = BusinessGrowthExpert.objects.filter(
            status='approved', location__icontains=support_request.location
        )[:3]
        support_request.matched_bges.set(nearby)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can edit support requests.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can edit support requests.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied("Only admins can delete support requests.")
        return super().destroy(request, *args, **kwargs)
