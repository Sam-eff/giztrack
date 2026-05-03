"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import re

from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path, re_path
from django.views.generic import RedirectView
from django.views.static import serve as media_serve
from utils.health import healthcheck

API_PREFIX = "api/v1/"
ADMIN_PANEL_PATH = "/giztrack-ctrl-panel/"

urlpatterns = [
    path('admin', RedirectView.as_view(url=ADMIN_PANEL_PATH, permanent=False)),
    path('admin/', RedirectView.as_view(url=ADMIN_PANEL_PATH, permanent=False)),
    path('tracknfix-ctrl-panel/', RedirectView.as_view(url=ADMIN_PANEL_PATH, permanent=False)),
    path('Giztrack-ctrl-panel/', RedirectView.as_view(url=ADMIN_PANEL_PATH, permanent=False)),
    path('giztrack-ctrl-panel/', admin.site.urls),
    path(f"{API_PREFIX}health/", healthcheck, name="api-healthcheck"),
    path(f"{API_PREFIX}auth/", include('apps.accounts.urls')),
    path(f"{API_PREFIX}shops/", include('apps.shops.urls')),
    path(f"{API_PREFIX}inventory/", include('apps.inventory.urls')),
    path(f"{API_PREFIX}sales/", include('apps.sales.urls')),
    path(f"{API_PREFIX}repairs/", include('apps.repairs.urls')),
    path(f"{API_PREFIX}customers/", include('apps.customers.urls')),
    path(f"{API_PREFIX}reports/", include('apps.reports.urls')),
    path(f"{API_PREFIX}subscriptions/", include('apps.subscriptions.urls')),
    path(f"{API_PREFIX}finance/", include('apps.finance.urls')),

]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif settings.SERVE_MEDIA:
    urlpatterns += [
        re_path(
            rf"^{re.escape(settings.MEDIA_URL.lstrip('/'))}(?P<path>.*)$",
            media_serve,
            kwargs={"document_root": settings.MEDIA_ROOT},
        )
    ]
