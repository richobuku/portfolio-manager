import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Sum

from ..models import Portfolio, Investment, Transaction
from ..serializers import PortfolioSerializer, InvestmentSerializer, TransactionSerializer

logger = logging.getLogger(__name__)


class PortfolioViewSet(viewsets.ModelViewSet):
    """Portfolio is per-user. Admins see everything; everyone else sees only
    their own portfolios. Previously every authenticated user could read or
    modify every portfolio in the system."""
    queryset = Portfolio.objects.all()
    serializer_class = PortfolioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Portfolio.objects.all()
        u = self.request.user
        if not (u.is_staff or u.is_superuser):
            qs = qs.filter(user=u)
        return qs

    def perform_create(self, serializer):
        # Ensure created portfolios are bound to the requesting user
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'])
    def analytics(self, request):
        portfolios = self.get_queryset()  # tenant-scoped
        total_value = sum(p.total_value() for p in portfolios)
        total_cost = sum(p.total_cost() for p in portfolios)
        total_return = total_value - total_cost
        total_return_pct = (total_return / total_cost * 100) if total_cost > 0 else 0
        investment_types = Investment.objects.filter(portfolio__in=portfolios).values('investment_type').annotate(
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
        u = self.request.user
        if not (u.is_staff or u.is_superuser):
            qs = qs.filter(portfolio__user=u)
        pid = self.request.query_params.get('portfolio')
        if pid:
            qs = qs.filter(portfolio_id=pid)
        return qs.select_related('portfolio')


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Transaction.objects.all()
        u = self.request.user
        if not (u.is_staff or u.is_superuser):
            qs = qs.filter(investment__portfolio__user=u)
        iid = self.request.query_params.get('investment')
        if iid:
            qs = qs.filter(investment_id=iid)
        return qs.select_related('investment', 'investment__portfolio').order_by('-transaction_date')
