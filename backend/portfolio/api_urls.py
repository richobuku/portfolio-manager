from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import (
    PortfolioViewSet, InvestmentViewSet, TransactionViewSet,
    MSMEViewSet, BusinessGrowthExpertViewSet, SupportRequestViewSet,
    TrainingSessionViewSet, AttendanceViewSet, TrainingTopicViewSet,
    CohortViewSet, BGEGroupViewSet, MSMEReportViewSet, GroupReportViewSet,
    GroupReportContributionViewSet, BGEUserViewSet, WorkOrderViewSet,
    GroupReportAttendanceViewSet, ProgrammeGroupViewSet, MSMEGrowthSnapshotViewSet,
    VisitReportTemplateViewSet,
    push_subscribe, push_unsubscribe, push_vapid_key,
)
from .auth_views import login_view, logout_view, google_login_view, request_password_reset, confirm_password_reset
from .blockchain.api_views import (
    BlockchainTransactionViewSet, SmartContractViewSet, TokenViewSet,
    MSMEFundingContractViewSet, InvestmentPoolViewSet, DecentralizedIdentityViewSet,
)

router = DefaultRouter()
router.register(r'portfolios', PortfolioViewSet)
router.register(r'investments', InvestmentViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'msmes', MSMEViewSet)
router.register(r'experts', BusinessGrowthExpertViewSet)
router.register(r'cohorts', CohortViewSet)
router.register(r'bge-groups', BGEGroupViewSet)
router.register(r'programme-groups', ProgrammeGroupViewSet)
router.register(r'growth-snapshots', MSMEGrowthSnapshotViewSet, basename='growth-snapshot')
router.register(r'support-requests', SupportRequestViewSet)
router.register(r'training-sessions', TrainingSessionViewSet, basename='training-session')
router.register(r'attendance', AttendanceViewSet)
router.register(r'training-topics', TrainingTopicViewSet)
router.register(r'reports', MSMEReportViewSet, basename='report')
router.register(r'group-reports', GroupReportViewSet, basename='group-report')
router.register(r'group-report-contributions', GroupReportContributionViewSet, basename='group-report-contribution')
router.register(r'group-report-attendance', GroupReportAttendanceViewSet, basename='group-report-attendance')
router.register(r'bge-users', BGEUserViewSet, basename='bge-user')
router.register(r'work-orders', WorkOrderViewSet, basename='work-order')
router.register(r'visit-templates', VisitReportTemplateViewSet, basename='visit-template')
router.register(r'blockchain/transactions', BlockchainTransactionViewSet)
router.register(r'blockchain/contracts', SmartContractViewSet)
router.register(r'blockchain/tokens', TokenViewSet)
router.register(r'blockchain/funding-contracts', MSMEFundingContractViewSet)
router.register(r'blockchain/investment-pools', InvestmentPoolViewSet)
router.register(r'blockchain/identities', DecentralizedIdentityViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
    path('api/auth/login/', login_view, name='api_login'),
    path('api/auth/logout/', logout_view, name='api_logout'),
    path('api/auth/google/', google_login_view, name='api_google_login'),
    path('api/auth/password-reset/', request_password_reset, name='api_password_reset'),
    path('api/auth/password-reset/confirm/', confirm_password_reset, name='api_password_reset_confirm'),
    path('api/push/subscribe/', push_subscribe, name='push_subscribe'),
    path('api/push/unsubscribe/', push_unsubscribe, name='push_unsubscribe'),
    path('api/push/vapid-key/', push_vapid_key, name='push_vapid_key'),
]
