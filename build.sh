#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies using active Python interpreter
python -m pip install --upgrade pip
if [ -f "requirements.txt" ]; then
    python -m pip install -r requirements.txt
elif [ -f "backend/requirements.txt" ]; then
    python -m pip install -r backend/requirements.txt
fi

# Navigate to backend directory
cd backend

# Run migrations
python manage.py migrate

# Collect static files
python manage.py collectstatic --noinput

# Create superuser if it doesn't exist (optional)
echo "from django.contrib.auth.models import User; User.objects.create_superuser('admin', 'admin@example.com', 'admin123') if not User.objects.filter(username='admin').exists() else None" | python manage.py shell
 