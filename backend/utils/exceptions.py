from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination


def custom_exception_handler(exc, context):
    """
    Wraps DRF errors in a consistent shape:
    { "error": "...", "details": {...} }
    """
    response = exception_handler(exc, context)

    if response is not None:
        error_data = {
            "error": "request_failed",
            "details": response.data,
        }
        # Surface a readable top-level message when possible
        if isinstance(response.data, dict):
            non_field = response.data.get("non_field_errors") or response.data.get("detail")
            if non_field:
                message = non_field[0] if isinstance(non_field, list) else str(non_field)
                error_data["message"] = message
                error_data["detail"] = message
        response.data = error_data

    return response


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response(
            {
                "count": self.page.paginator.count,
                "total_pages": self.page.paginator.num_pages,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
            }
        )
