"""task_manager URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.0/topics/http/urls/

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

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.shortcuts import render
from django.urls import include, path
from django.views.generic import TemplateView

from task_manager.users.views import IndexView, LoginUser, LogoutUser
from task_manager.users.webhooks import webhooks

urlpatterns = [
    path('', IndexView.as_view(), name='index'),
    path('users/', include('task_manager.users.urls'), name='users_list'),
    path('labels/', include('task_manager.labels.urls'), name='labels_list'),
    path(
        'tasks/',
        include('task_manager.tasks.urls', namespace='task'),
        name='tasks_list',
    ),
    path('login/', LoginUser.as_view(), name='login'),
    path(
        'logout/',
        LogoutUser.as_view(),
        {'next_page': settings.LOGOUT_REDIRECT_URL},
        name='logout',
    ),
    path('admin/', admin.site.urls),
    path('webhooks/', webhooks, name='webhooks'),
    path(
        'test-themes/',
        TemplateView.as_view(template_name='test-themes.html'),
        name='test_themes',
    ),
    path(
        'test-mobile/',
        lambda request: render(request, 'test-mobile.html'),
        name='test_mobile',
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
