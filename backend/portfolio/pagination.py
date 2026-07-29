from rest_framework.pagination import PageNumberPagination


class MSMEPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class BGEPagination(PageNumberPagination):
    # Large default so all BGEs arrive in one shot for dropdowns,
    # while still giving callers the ability to cap with ?page_size=N.
    page_size = 200
    page_size_query_param = 'page_size'
    max_page_size = 500
