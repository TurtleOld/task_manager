#!/usr/bin/env python3
"""
Simple test to debug TaskIQ connection.
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

print("🔍 Testing TaskIQ configuration...")

# Test 1: Check if broker can be imported
try:
    from task_manager.taskiq import broker
    print("✅ Broker imported successfully")
    print(f"   Broker URL: {broker.url}")
except Exception as e:
    print(f"❌ Failed to import broker: {e}")
    sys.exit(1)

# Test 2: Check if tasks can be imported
try:
    from task_manager.tasks.tasks import send_message_about_adding_task
    print("✅ Tasks imported successfully")
except Exception as e:
    print(f"❌ Failed to import tasks: {e}")
    sys.exit(1)

# Test 3: Check if services can be imported
try:
    from task_manager.tasks.services import send_taskiq_task
    print("✅ Services imported successfully")
except Exception as e:
    print(f"❌ Failed to import services: {e}")
    sys.exit(1)

# Test 4: Check Django settings
from django.conf import settings
print(f"✅ Django settings loaded")
print(f"   TASKIQ_ENABLED: {getattr(settings, 'TASKIQ_ENABLED', 'Not set')}")
print(f"   TASKIQ_BROKER_URL: {getattr(settings, 'TASKIQ_BROKER_URL', 'Not set')}")

print("\n🎉 All imports successful!")
