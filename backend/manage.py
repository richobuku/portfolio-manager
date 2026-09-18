#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
import subprocess
from pathlib import Path


def _ensure_dependencies():
    """Ensure Django and core dependencies are installed in the active environment."""
    try:
        import django  # noqa: F401
    except ImportError:
        current_dir = Path(__file__).resolve().parent
        candidates = [
            current_dir / 'requirements.txt',
            current_dir.parent / 'requirements.txt',
        ]
        req_file = next((c for c in candidates if c.is_file()), None)
        if req_file:
            print(f"==> Django not found in {sys.executable}. Auto-installing from {req_file}...")
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', str(req_file)])
            print("==> Dependencies installed successfully!")
        else:
            raise ImportError(
                "Couldn't import Django and could not find requirements.txt to install it. "
                "Are you sure it's installed and available on your PYTHONPATH environment variable?"
            )


def main():
    """Run administrative tasks."""
    _ensure_dependencies()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
