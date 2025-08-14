#!/usr/bin/env python3
"""
Test synchronous task sending only.
"""

import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'task_manager.settings')

import django
django.setup()

from task_manager.tasks.services import send_taskiq_task
from task_manager.tasks.tasks import send_message_about_adding_task


def test_service_task_sending():
    """Test task sending through service function."""
    print("🔍 Testing service task sending...")
    
    try:
        success = send_taskiq_task(
            send_message_about_adding_task,
            "Test Task Service", 
            "http://localhost:8000/tasks/test-task-service"
        )
        
        if success:
            print("  ✅ Service task sending successful")
            return True
        else:
            print("  ❌ Service task sending failed")
            return False
            
    except Exception as e:
        print(f"  ❌ Service task sending failed: {e}")
        import traceback
        print(f"  📋 Full traceback: {traceback.format_exc()}")
        return False


def main():
    """Run the test."""
    print("🚀 Synchronous Task Sending Test")
    print("=" * 50)
    
    # Test service sending
    service_ok = test_service_task_sending()
    print()
    
    print("=" * 50)
    
    if service_ok:
        print("✅ Test passed! Task sending is working.")
        return True
    else:
        print("❌ Test failed.")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
