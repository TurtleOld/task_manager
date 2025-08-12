#!/usr/bin/env python3
"""
Script to check Celery functionality and connectivity.

This script tests:
- Connection to RabbitMQ broker
- Connection to Redis backend
- Task execution
- Result retrieval
"""

import os
import sys
import django
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'task_manager.settings')
django.setup()

from celery import current_app
from task_manager.celery import debug_task
from task_manager.tasks.example_tasks import example_task


def check_celery_connection():
    """Check Celery connection to broker and backend."""
    print("🔍 Checking Celery connections...")
    
    try:
        # Check broker connection
        print("  📡 Testing broker connection...")
        inspect = current_app.control.inspect()
        stats = inspect.stats()
        
        if stats:
            print("  ✅ Broker connection: OK")
        else:
            print("  ⚠️  Broker connection: No workers found")
            
    except Exception as e:
        print(f"  ❌ Broker connection failed: {e}")
        return False
    
    try:
        # Check backend connection
        print("  🗄️  Testing backend connection...")
        result = debug_task.delay()
        result.get(timeout=10)
        print("  ✅ Backend connection: OK")
        
    except Exception as e:
        print(f"  ❌ Backend connection failed: {e}")
        return False
    
    return True


def test_task_execution():
    """Test basic task execution."""
    print("\n🧪 Testing task execution...")
    
    try:
        # Test simple task
        print("  📝 Testing simple task...")
        result = example_task.delay(10, 20)
        task_result = result.get(timeout=10)
        
        if task_result == 30:
            print("  ✅ Simple task: OK")
        else:
            print(f"  ❌ Simple task failed: expected 30, got {task_result}")
            return False
            
    except Exception as e:
        print(f"  ❌ Task execution failed: {e}")
        return False
    
    return True


def check_worker_status():
    """Check if workers are running."""
    print("\n👷 Checking worker status...")
    
    try:
        inspect = current_app.control.inspect()
        
        # Check active workers
        active = inspect.active()
        if active:
            print("  ✅ Active workers found:")
            for worker, tasks in active.items():
                print(f"    - {worker}: {len(tasks)} active tasks")
        else:
            print("  ⚠️  No active workers found")
        
        # Check registered tasks
        registered = inspect.registered()
        if registered:
            print("  ✅ Registered tasks:")
            for worker, tasks in registered.items():
                print(f"    - {worker}: {len(tasks)} tasks")
        else:
            print("  ⚠️  No registered tasks found")
            
    except Exception as e:
        print(f"  ❌ Worker status check failed: {e}")
        return False
    
    return True


def main():
    """Main function to run all checks."""
    print("🚀 Celery Health Check")
    print("=" * 50)
    
    # Check connections
    if not check_celery_connection():
        print("\n❌ Connection check failed. Please check your configuration.")
        sys.exit(1)
    
    # Check worker status
    if not check_worker_status():
        print("\n⚠️  Worker status check failed. Workers might not be running.")
    
    # Test task execution
    if not test_task_execution():
        print("\n❌ Task execution failed.")
        sys.exit(1)
    
    print("\n✅ All checks passed! Celery is working correctly.")
    print("\n📊 Monitoring URLs:")
    print("  - Flower: http://localhost:5555")
    print("  - RabbitMQ: http://localhost:15672")


if __name__ == '__main__':
    main()
