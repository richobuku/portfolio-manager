from rest_framework import serializers
from ..models import Portfolio, Investment, Transaction


class PortfolioSerializer(serializers.ModelSerializer):
    total_value = serializers.ReadOnlyField()
    total_cost = serializers.ReadOnlyField()
    total_return = serializers.ReadOnlyField()
    total_return_percentage = serializers.ReadOnlyField()
    investment_count = serializers.SerializerMethodField()

    class Meta:
        model = Portfolio
        fields = '__all__'

    def get_investment_count(self, obj):
        return obj.investments.count()


class InvestmentSerializer(serializers.ModelSerializer):
    current_value = serializers.ReadOnlyField()
    total_cost = serializers.ReadOnlyField()
    total_return = serializers.ReadOnlyField()
    total_return_percentage = serializers.ReadOnlyField()

    class Meta:
        model = Investment
        fields = '__all__'


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'
