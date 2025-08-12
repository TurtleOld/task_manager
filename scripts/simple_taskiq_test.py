#!/usr/bin/env python3
"""
Simple TaskIQ test script.

This script tests basic TaskIQ functionality without decorators.
"""

import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'task_manager.settings')

import django
django.setup()

def test_taskiq_import():
    """Test basic TaskIQ imports."""
    print("🔍 Testing TaskIQ imports...")
    
    try:
        from task_manager.taskiq import broker
        print("  ✅ TaskIQ broker imported successfully")
        return True
    except Exception as e:
        print(f"  ❌ TaskIQ import failed: {e}")
        return False


def test_broker_configuration():
    """Test broker configuration."""
    print("🔧 Testing broker configuration...")
    
    try:
        from task_manager.taskiq import broker
        print(f"  ✅ Broker URL: {broker.url}")
        print(f"  ✅ Broker type: {type(broker).__name__}")
        return True
    except Exception as e:
        print(f"  ❌ Broker configuration failed: {e}")
        return False


def main():
    """Main function to run all tests."""
    print("🚀 Simple TaskIQ Test")
    print("=" * 50)
    
    # Test imports
    import_ok = test_taskiq_import()
    
    # Test configuration
    config_ok = test_broker_configuration()
    
    print("\n" + "=" * 50)
    
    if not import_ok:
        print("❌ Import test failed!")
        return False
    
    if not config_ok:
        print("❌ Configuration test failed!")
        return False
    
    print("\n✅ All basic tests passed! TaskIQ is configured correctly.")
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

