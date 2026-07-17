import re
from rest_framework.exceptions import PermissionDenied
from ..models import CohortAdmin


def _managed_groups(user):
    """Return the ProgrammeGroup IDs a programme manager can access,
    or None for superusers/staff (meaning no restriction)."""
    if user.is_staff or user.is_superuser:
        return None
    try:
        return list(user.cohort_admin_profile.managed_groups.values_list('id', flat=True))
    except CohortAdmin.DoesNotExist:
        return None


def _is_viewer(user):
    """True only for accounts explicitly in the 'Viewer' Django group.
    Unlinked accounts (no bge_profile, no cohort_admin_profile) fall through to
    see NOTHING — they must be linked to a BGE profile or added to Viewer to gain access."""
    if user.is_staff or user.is_superuser:
        return False
    return user.groups.filter(name='Viewer').exists()


def _is_programme_manager(user):
    """True for cohort_admin accounts that are NOT full staff/superuser."""
    if user.is_staff or user.is_superuser:
        return False
    return hasattr(user, 'cohort_admin_profile')


class ViewerReadOnlyMixin:
    """Block create/update/delete for viewer accounts."""
    def _check_not_viewer(self):
        if _is_viewer(self.request.user):
            raise PermissionDenied("Viewer accounts have read-only access.")

    def create(self, request, *args, **kwargs):
        self._check_not_viewer()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_not_viewer()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_not_viewer()
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._check_not_viewer()
        return super().destroy(request, *args, **kwargs)


class ProgrammeManagerReadOnlyMixin:
    """Block create/update/delete for programme-manager (cohort_admin) accounts."""
    def _check_not_pm(self):
        if _is_programme_manager(self.request.user):
            raise PermissionDenied("Programme Managers have read-only access to this resource.")

    def create(self, request, *args, **kwargs):
        self._check_not_pm()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_not_pm()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_not_pm()
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._check_not_pm()
        return super().destroy(request, *args, **kwargs)


def _safe_filename(name):
    """Strip characters that could break or inject into a Content-Disposition header."""
    name = re.sub(r'[\r\n"]', '', str(name))
    return name.strip() or 'download'
