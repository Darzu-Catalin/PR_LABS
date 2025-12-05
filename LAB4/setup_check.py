#!/usr/bin/env python3
"""
Setup verification script for the distributed key-value store.
Run this to ensure your environment is ready before starting the lab.
"""

import sys
import subprocess
import shutil

def check_command(command, name):
    """Check if a command is available."""
    if shutil.which(command):
        try:
            result = subprocess.run([command, '--version'], 
                                  capture_output=True, text=True, timeout=5)
            version = result.stdout.split('\n')[0] if result.stdout else result.stderr.split('\n')[0]
            print(f"✓ {name}: {version}")
            return True
        except:
            print(f"✓ {name}: installed")
            return True
    else:
        print(f"✗ {name}: NOT FOUND")
        return False

def check_python_package(package, import_name=None):
    """Check if a Python package is installed."""
    if import_name is None:
        import_name = package
    
    try:
        __import__(import_name)
        print(f"✓ Python package '{package}': installed")
        return True
    except ImportError:
        print(f"✗ Python package '{package}': NOT INSTALLED")
        return False

def main():
    """Run all checks."""
    print("=" * 60)
    print("Environment Setup Verification")
    print("=" * 60)
    print()
    
    all_good = True
    
    # Check Docker
    print("Checking required tools:")
    print("-" * 60)
    all_good &= check_command('docker', 'Docker')
    all_good &= check_command('docker-compose', 'Docker Compose')
    all_good &= check_command('python3', 'Python 3')
    all_good &= check_command('curl', 'curl')
    
    print()
    print("Checking Python packages (for local testing):")
    print("-" * 60)
    py_flask = check_python_package('flask')
    py_requests = check_python_package('requests')
    py_matplotlib = check_python_package('matplotlib')
    py_numpy = check_python_package('numpy')
    
    print()
    print("=" * 60)
    
    if not all_good:
        print("❌ MISSING REQUIRED TOOLS")
        print()
        print("Please install the missing tools:")
        print("  - Docker: https://docs.docker.com/get-docker/")
        print("  - Docker Compose: https://docs.docker.com/compose/install/")
        print()
        return 1
    
    if not (py_flask and py_requests and py_matplotlib and py_numpy):
        print("⚠️  MISSING PYTHON PACKAGES")
        print()
        print("Python packages are optional for running the Docker cluster,")
        print("but required for running tests locally.")
        print()
        print("To install Python packages:")
        print("  pip install -r requirements.txt")
        print()
        print("However, you can still run the cluster without them:")
        print("  ./run.sh start")
        print()
        return 0
    
    print("✅ ALL CHECKS PASSED")
    print()
    print("You're ready to start the lab!")
    print()
    print("Quick start:")
    print("  1. ./run.sh start       # Start the cluster")
    print("  2. ./run.sh test        # Run tests")
    print("  3. ./run.sh analyze     # Run performance analysis")
    print()
    return 0

if __name__ == "__main__":
    sys.exit(main())
