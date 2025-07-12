import time
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
from task_manager.tasks.models import Task, Stage

User = get_user_model()


class PerformanceTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.stage = Stage.objects.create(name='Test Stage', order=1)
        
        # Create test tasks
        for i in range(10):
            Task.objects.create(
                name=f'Test Task {i}',
                description=f'Description {i}',
                author=self.user,
                stage=self.stage,
                order=i
            )

    def test_kanban_view_performance(self):
        """Test that Kanban view loads efficiently"""
        self.client.force_login(self.user)
        
        start_time = time.time()
        response = self.client.get(reverse('tasks:list'))
        end_time = time.time()
        
        # Should load in under 500ms
        self.assertLess(end_time - start_time, 0.5)
        self.assertEqual(response.status_code, 200)
        
        # Check that tasks are loaded
        self.assertIn('tasks', response.context)
        self.assertIn('stages', response.context)

    def test_task_view_performance(self):
        """Test that individual task view loads efficiently"""
        self.client.force_login(self.user)
        task = Task.objects.first()
        
        start_time = time.time()
        response = self.client.get(
            reverse('tasks:view_task', kwargs={'slug': task.slug})
        )
        end_time = time.time()
        
        # Should load in under 300ms
        self.assertLess(end_time - start_time, 0.3)
        self.assertEqual(response.status_code, 200)

    def test_static_files_optimized(self):
        """Test that static files are properly optimized"""
        response = self.client.get('/static/css/style.min.css')
        self.assertEqual(response.status_code, 200)
        
        # Check that minified CSS is smaller than original
        response_original = self.client.get('/static/css/style.css')
        if response_original.status_code == 200:
            self.assertLess(
                len(response.content),
                len(response_original.content)
            )

    def test_cache_headers(self):
        """Test that appropriate cache headers are set"""
        # Static files should have long cache headers
        response = self.client.get('/static/css/style.min.css')
        self.assertIn('Cache-Control', response)
        self.assertIn('max-age=31536000', response['Cache-Control'])
        
        # Dynamic pages should have no-cache headers
        self.client.force_login(self.user)
        response = self.client.get(reverse('tasks:list'))
        self.assertIn('Cache-Control', response)
        self.assertIn('no-cache', response['Cache-Control'])

    def test_database_query_optimization(self):
        """Test that database queries are optimized"""
        self.client.force_login(self.user)
        
        # Count queries for Kanban view
        with self.assertNumQueries(less_than=10):  # Should be optimized
            response = self.client.get(reverse('tasks:list'))
            self.assertEqual(response.status_code, 200)

    def test_bulk_operations(self):
        """Test that bulk operations work efficiently"""
        tasks = list(Task.objects.all())
        
        # Test bulk update performance
        start_time = time.time()
        for i, task in enumerate(tasks):
            task.order = i + 100
        
        Task.objects.bulk_update(tasks, ['order'], batch_size=100)
        end_time = time.time()
        
        # Bulk update should be fast
        self.assertLess(end_time - start_time, 0.1)