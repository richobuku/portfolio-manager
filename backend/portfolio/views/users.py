import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.contrib.auth.models import User

from ..models import BusinessGrowthExpert, CohortAdmin, ProgrammeGroup
from ..account_setup import ensure_bge_account, send_welcome_email
from .mixins import _managed_groups

logger = logging.getLogger(__name__)


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
        if not (request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'cohort_admin_profile')):
            raise PermissionDenied("Only admins can manage users.")
        users = User.objects.filter(is_staff=False, is_superuser=False).select_related('bge_profile', 'security_profile')
        data = []
        for u in users:
            try:
                profile = u.bge_profile
                bge_info = {'id': profile.id, 'name': profile.name, 'status': profile.status}
            except Exception:
                bge_info = None
            # Determine role
            try:
                ca = u.cohort_admin_profile
                role = 'cohort_admin'
                managed_groups = list(ca.managed_groups.values('id', 'name'))
            except CohortAdmin.DoesNotExist:
                managed_groups = []
                role = 'bge' if bge_info else 'viewer'
            try:
                viewer_approved = u.security_profile.viewer_approved
            except Exception:
                viewer_approved = True
            if role == 'viewer' and not viewer_approved:
                role = 'pending'
            data.append({
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'is_active': u.is_active,
                'date_joined': u.date_joined,
                'bge_profile': bge_info,
                'role': role,
                'managed_groups': managed_groups,
                'viewer_approved': viewer_approved,
            })
        return Response(data)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """Admin: approve a pending Google sign-in, granting it read-only viewer access."""
        self._require_admin(request)
        user, err = self._get_target_non_admin_user(pk, request)
        if err is not None:
            return err
        from ..models import UserSecurityProfile
        sec, _ = UserSecurityProfile.objects.get_or_create(user=user)
        sec.viewer_approved = True
        sec.save(update_fields=['viewer_approved'])
        return Response({'message': f'{user.username} approved for viewer access.'})

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """Admin: reject a pending Google sign-in, deactivating the account."""
        self._require_admin(request)
        user, err = self._get_target_non_admin_user(pk, request)
        if err is not None:
            return err
        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response({'message': f'{user.username} rejected and deactivated.'})

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
                if bge.user:
                    user.delete()
                    return Response({'error': 'This BGE already has a user account linked.'}, status=status.HTTP_400_BAD_REQUEST)
                type(bge).objects.filter(pk=bge.pk).update(user=user)
                bge.user = user
                send_welcome_email(bge, username, password)
                from ..account_setup import send_welcome_sms as _send_sms
                _send_sms(bge, username, password)
            except BusinessGrowthExpert.DoesNotExist:
                user.delete()
                return Response({'error': 'BGE profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({'id': user.id, 'username': user.username, 'email': user.email}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='bulk-create-missing')
    def bulk_create_missing(self, request):
        """Create login accounts for every BGE that doesn't have one yet.
        Admin-only. Each account gets a unique random temporary password,
        sent to the BGE via welcome email/SMS. Returns counts of created / skipped."""
        self._require_admin(request)
        unlinked = BusinessGrowthExpert.objects.filter(user__isnull=True).order_by('id')
        created = skipped = 0
        names = []
        for bge in unlinked:
            outcome = ensure_bge_account(bge, send_email=True)
            if outcome == 'created':
                created += 1
                names.append(bge.name or f'BGE #{bge.id}')
            else:
                skipped += 1
        return Response({'created': created, 'skipped': skipped, 'names': names})

    @action(detail=True, methods=['patch'], url_path='set-role')
    def set_role(self, request, pk=None):
        """Set or clear a user's programme-manager role and managed groups.

        Body:
          role        : 'viewer' | 'cohort_admin'
          group_ids   : [1, 2, ...]   (required when role='cohort_admin')
        """
        self._require_admin(request)
        user, err = self._get_target_non_admin_user(pk, request)
        if err:
            return err

        role = request.data.get('role', 'viewer')
        group_ids = request.data.get('group_ids', [])

        if role == 'cohort_admin':
            ca, _ = CohortAdmin.objects.get_or_create(user=user)
            ca.managed_groups.set(ProgrammeGroup.objects.filter(id__in=group_ids))
            ca.save()
            names = list(ca.managed_groups.values_list('name', flat=True))
            return Response({'role': 'cohort_admin', 'managed_groups': names})
        else:
            # viewer — remove cohort_admin if it exists
            CohortAdmin.objects.filter(user=user).delete()
            return Response({'role': 'viewer'})

    def _get_target_non_admin_user(self, pk, request):
        """Resolve a target user that is NOT a staff/superuser. Raises 403 if it
        is — admins managing other admins must use Django's admin site."""
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return None, Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        # Even an admin should not be able to demote / lock-out / re-password
        # another admin via this BGE-user endpoint. The list view already hides
        # them; close the loophole on the detail mutations too.
        if user.is_staff or user.is_superuser:
            return None, Response(
                {'error': 'Cannot manage staff/superuser accounts here. Use Django admin.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return user, None

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        self._require_admin(request)
        new_password = (request.data.get('password') or '').strip()
        if not new_password or len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        user, err = self._get_target_non_admin_user(pk, request)
        if err is not None:
            return err
        user.set_password(new_password)
        user.save()
        return Response({'message': f'Password updated for {user.username}.'})

    @action(detail=True, methods=['patch'], url_path='link-bge')
    def link_bge(self, request, pk=None):
        self._require_admin(request)
        bge_id = request.data.get('bge_id')
        user, err = self._get_target_non_admin_user(pk, request)
        if err is not None:
            return err
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
        user, err = self._get_target_non_admin_user(pk, request)
        if err is not None:
            return err
        user.is_active = not user.is_active
        user.save()
        return Response({'is_active': user.is_active})
