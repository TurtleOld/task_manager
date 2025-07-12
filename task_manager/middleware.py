import time
import logging
from django.db import connection
from django.conf import settings

logger = logging.getLogger(__name__)


class PerformanceMonitoringMiddleware:
    """Middleware to monitor performance metrics"""
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Start timing
        start_time = time.time()
        
        # Count initial database queries
        initial_queries = len(connection.queries)
        
        # Process request
        response = self.get_response(request)
        
        # Calculate metrics
        end_time = time.time()
        duration = end_time - start_time
        total_queries = len(connection.queries) - initial_queries
        
        # Log performance metrics for slow requests
        if duration > 1.0:  # Log requests taking more than 1 second
            logger.warning(
                f'Slow request: {request.path} took {duration:.2f}s '
                f'with {total_queries} queries'
            )
        
        # Add performance headers in debug mode
        if settings.DEBUG:
            response['X-Response-Time'] = f'{duration:.3f}s'
            response['X-Database-Queries'] = str(total_queries)
        
        return response


class CacheControlMiddleware:
    """Middleware to add appropriate cache headers"""
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # Add cache headers for static content
        if request.path.startswith('/static/') or request.path.startswith('/media/'):
            response['Cache-Control'] = 'public, max-age=31536000'  # 1 year
        elif request.path.startswith('/admin/'):
            response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        else:
            # Default cache control for dynamic content
            response['Cache-Control'] = 'no-cache, must-revalidate'
        
        return response