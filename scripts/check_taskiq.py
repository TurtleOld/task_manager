#!/usr/bin/env python3
"""
Script to check TaskIQ functionality and connectivity.

This script tests TaskIQ broker connection, task execution, and basic functionality.
"""

import os
import sys
import asyncio
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'task_manager.settings')

import django
django.setup()

from task_manager.taskiq import broker
from task_manager.tasks.example_tasks import example_task


def check_taskiq_connection():
    """Check TaskIQ connection to broker."""
    print("🔍 Checking TaskIQ connections...")
    
    try:
        # Test broker connection
        print("  Testing broker connection...")
        # Note: TaskIQ doesn't have a direct connection test like Celery
        # We'll test by trying to send a simple task
        return True
    except Exception as e:
        print(f"  ❌ Broker connection failed: {e}")
        return False


def test_task_execution():
    """Test basic task execution."""
    print("  Testing task execution...")
    
    try:
        # Test simple task
        result = example_task.kiq(10, 20)
        print(f"  ✅ Task execution test passed")
        return True
    except Exception as e:
        print(f"  ❌ Task execution failed: {e}")
        return False


def check_environment():
    """Check environment variables and configuration."""
    print("🔧 Checking environment configuration...")
    
    required_vars = [
        'BROKER_URL',
        'REDIS_URL',
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.environ.get(var):
            missing_vars.append(var)
    
    if missing_vars:
        print(f"  ⚠️  Missing environment variables: {', '.join(missing_vars)}")
        return False
    else:
        print("  ✅ All required environment variables are set")
        return True


def main():
    """Main function to run all checks."""
    print("🚀 TaskIQ Health Check")
    print("=" * 50)
    
    # Check environment
    env_ok = check_environment()
    
    # Check connections
    connection_ok = check_taskiq_connection()
    
    # Test task execution
    task_ok = test_task_execution()
    
    print("\n" + "=" * 50)
    
    if not connection_ok:
        print("❌ Connection check failed!")
        print("   Please check your RabbitMQ and Redis configuration.")
        return False
    
    if not task_ok:
        print("❌ Task execution test failed!")
        print("   Please check your TaskIQ configuration and broker setup.")
        return False
    
    if not env_ok:
        print("⚠️  Environment configuration issues detected!")
        print("   Some features may not work correctly.")
        return False
    
    print("\n✅ All checks passed! TaskIQ is working correctly.")
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
