from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from django.db import transaction
from ..models import MSME, BusinessGrowthExpert
from .models import (
    BlockchainTransaction, SmartContract, Token, TokenBalance,
    MSMEFundingContract, InvestmentPool, DecentralizedIdentity
)
from .services import (
    BlockchainService, MSMEFundingService, InvestmentPoolService,
    DecentralizedIdentityService
)
from .serializers import (
    BlockchainTransactionSerializer, SmartContractSerializer,
    TokenSerializer, TokenBalanceSerializer, MSMEFundingContractSerializer,
    InvestmentPoolSerializer, DecentralizedIdentitySerializer
)

class BlockchainTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for blockchain transactions"""
    queryset = BlockchainTransaction.objects.all().order_by('-timestamp')
    serializer_class = BlockchainTransactionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = BlockchainTransaction.objects.all()
        
        # Filter by transaction type
        tx_type = self.request.query_params.get('type', None)
        if tx_type:
            queryset = queryset.filter(transaction_type=tx_type)
        
        # Filter by address
        address = self.request.query_params.get('address', None)
        if address:
            queryset = queryset.filter(
                models.Q(from_address=address) | models.Q(to_address=address)
            )
        
        return queryset.order_by('-timestamp')
    
    @action(detail=False, methods=['get'])
    def analytics(self, request):
        """Get blockchain analytics"""
        total_transactions = BlockchainTransaction.objects.count()
        total_volume = BlockchainTransaction.objects.aggregate(
            total=Sum('amount')
        )['total'] or 0
        
        # Transaction type distribution
        tx_types = BlockchainTransaction.objects.values('transaction_type').annotate(
            count=Count('id'),
            volume=Sum('amount')
        )
        
        # Recent transactions
        recent_transactions = BlockchainTransaction.objects.order_by('-timestamp')[:10]
        
        return Response({
            'total_transactions': total_transactions,
            'total_volume': total_volume,
            'transaction_types': tx_types,
            'recent_transactions': BlockchainTransactionSerializer(recent_transactions, many=True).data
        })

class SmartContractViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for smart contracts"""
    queryset = SmartContract.objects.filter(is_active=True)
    serializer_class = SmartContractSerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=True, methods=['post'])
    def execute_function(self, request, pk=None):
        """Execute a smart contract function"""
        contract = self.get_object()
        function_name = request.data.get('function')
        params = request.data.get('params', {})
        
        # This is a simplified execution
        # In a real blockchain, you'd interact with actual smart contracts
        
        return Response({
            'success': True,
            'contract_address': contract.contract_address,
            'function': function_name,
            'result': f"Function {function_name} executed successfully"
        })

class TokenViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for tokens"""
    queryset = Token.objects.filter(is_active=True)
    serializer_class = TokenSerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=True, methods=['post'])
    def transfer(self, request, pk=None):
        """Transfer tokens"""
        token = self.get_object()
        from_address = request.data.get('from_address')
        to_address = request.data.get('to_address')
        amount = request.data.get('amount')
        
        success = BlockchainService.transfer_tokens(
            from_address, to_address, token.token_address, amount
        )
        
        if success:
            return Response({'success': True, 'message': 'Transfer successful'})
        else:
            return Response(
                {'success': False, 'message': 'Transfer failed'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'])
    def balance(self, request, pk=None):
        """Get token balance for an address"""
        token = self.get_object()
        address = request.query_params.get('address')
        
        if not address:
            return Response(
                {'error': 'Address parameter required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        balance = BlockchainService.get_token_balance(address, token.token_address)
        
        return Response({
            'token_address': token.token_address,
            'token_symbol': token.symbol,
            'address': address,
            'balance': balance
        })

class MSMEFundingContractViewSet(viewsets.ModelViewSet):
    """ViewSet for MSME funding contracts"""
    queryset = MSMEFundingContract.objects.all()
    serializer_class = MSMEFundingContractSerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=True, methods=['post'])
    def contribute(self, request, pk=None):
        """Contribute to MSME funding"""
        funding_contract = self.get_object()
        investor_address = request.data.get('investor_address')
        amount = request.data.get('amount')
        
        try:
            success = MSMEFundingService.contribute_to_funding(
                funding_contract.id, investor_address, amount
            )
            
            if success:
                return Response({
                    'success': True,
                    'message': 'Contribution successful',
                    'funded_amount': funding_contract.funded_amount,
                    'remaining_amount': funding_contract.remaining_amount()
                })
            else:
                return Response(
                    {'success': False, 'message': 'Contribution failed'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except ValueError as e:
            return Response(
                {'success': False, 'message': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def repay(self, request, pk=None):
        """Process loan repayment"""
        funding_contract = self.get_object()
        repayment_amount = request.data.get('amount')
        
        success = MSMEFundingService.process_repayment(
            funding_contract.id, repayment_amount
        )
        
        if success:
            return Response({
                'success': True,
                'message': 'Repayment processed',
                'repaid_amount': funding_contract.repaid_amount,
                'repayment_progress': funding_contract.repayment_progress()
            })
        else:
            return Response(
                {'success': False, 'message': 'Repayment failed'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def create_contract(self, request):
        """Create a new MSME funding contract"""
        msme_id = request.data.get('msme_id')
        funding_amount = request.data.get('funding_amount')
        interest_rate = request.data.get('interest_rate')
        term_months = request.data.get('term_months')
        
        try:
            msme = MSME.objects.get(id=msme_id)
            funding_contract = MSMEFundingService.create_funding_contract(
                msme, funding_amount, interest_rate, term_months
            )
            
            return Response({
                'success': True,
                'contract_id': funding_contract.id,
                'contract_address': funding_contract.contract.contract_address,
                'message': 'Funding contract created successfully'
            })
        except MSME.DoesNotExist:
            return Response(
                {'success': False, 'message': 'MSME not found'},
                status=status.HTTP_404_NOT_FOUND
            )

class InvestmentPoolViewSet(viewsets.ModelViewSet):
    """ViewSet for investment pools"""
    queryset = InvestmentPool.objects.filter(is_active=True)
    serializer_class = InvestmentPoolSerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=True, methods=['post'])
    def invest(self, request, pk=None):
        """Invest in a pool"""
        pool = self.get_object()
        investor_address = request.data.get('investor_address')
        amount = request.data.get('amount')
        
        try:
            success = InvestmentPoolService.invest_in_pool(
                pool.id, investor_address, amount
            )
            
            if success:
                return Response({
                    'success': True,
                    'message': 'Investment successful',
                    'current_amount': pool.current_amount,
                    'funding_progress': pool.funding_progress()
                })
            else:
                return Response(
                    {'success': False, 'message': 'Investment failed'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except ValueError as e:
            return Response(
                {'success': False, 'message': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def create_pool(self, request):
        """Create a new investment pool"""
        name = request.data.get('name')
        description = request.data.get('description')
        target_amount = request.data.get('target_amount')
        min_investment = request.data.get('min_investment')
        max_investment = request.data.get('max_investment')
        
        pool = InvestmentPoolService.create_investment_pool(
            name, description, target_amount, min_investment, max_investment
        )
        
        return Response({
            'success': True,
            'pool_id': pool.id,
            'contract_address': pool.contract.contract_address,
            'message': 'Investment pool created successfully'
        })

class DecentralizedIdentityViewSet(viewsets.ModelViewSet):
    """ViewSet for decentralized identities"""
    queryset = DecentralizedIdentity.objects.all()
    serializer_class = DecentralizedIdentitySerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['post'])
    def create_identity(self, request):
        """Create a new decentralized identity"""
        identity_type = request.data.get('identity_type')
        public_key = request.data.get('public_key')
        entity_type = request.data.get('entity_type')
        entity_id = request.data.get('entity_id')
        
        # Get the related entity
        user = None
        msme = None
        expert = None
        
        if entity_type == 'user':
            user = request.user
        elif entity_type == 'msme':
            msme = MSME.objects.get(id=entity_id)
        elif entity_type == 'expert':
            expert = BusinessGrowthExpert.objects.get(id=entity_id)
        
        identity = DecentralizedIdentityService.create_identity(
            identity_type, public_key, user, msme, expert
        )
        
        return Response({
            'success': True,
            'did': identity.did,
            'identity_id': identity.id,
            'message': 'Identity created successfully'
        })
    
    @action(detail=False, methods=['post'])
    def verify_signature(self, request):
        """Verify an identity signature"""
        did = request.data.get('did')
        signature = request.data.get('signature')
        message = request.data.get('message')
        
        is_valid = DecentralizedIdentityService.verify_identity(did, signature, message)
        
        return Response({
            'success': True,
            'is_valid': is_valid,
            'did': did
        }) 