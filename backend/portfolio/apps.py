from django.apps import AppConfig


class PortfolioConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'portfolio'

    def ready(self):
        # Import signal handlers so they register on app startup.
        # Anything that depends on models can only be imported here, not at
        # module top-level, to avoid the AppRegistryNotReady error.
        from . import signals  # noqa: F401
