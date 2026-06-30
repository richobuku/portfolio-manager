from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create Simon Okello as a Business Growth Expert (idempotent) and optionally send welcome email'

    def add_arguments(self, parser):
        parser.add_argument('--email', default='smnokello@gmail.com', help='Email address for Simon')
        parser.add_argument('--name', default='Simon Okello', help='Full name')
        parser.add_argument('--phone', default='', help='Phone number')
        parser.add_argument('--location', default='', help='Location')
        parser.add_argument('--bge-code', dest='bge_code', default='SOKELLO', help='BGE code')
        parser.add_argument('--send-email', action='store_true', dest='send_email', help='Send welcome/reset email after creating the account')

    def handle(self, *args, **options):
        from portfolio.models import BusinessGrowthExpert
        from portfolio.account_setup import ensure_bge_account

        email = (options.get('email') or '').strip()
        name = (options.get('name') or '').strip()
        phone = (options.get('phone') or '').strip()
        location = (options.get('location') or '').strip()
        bge_code = (options.get('bge_code') or '').strip()
        send_email = bool(options.get('send_email'))

        existing = None
        if email:
            existing = BusinessGrowthExpert.objects.filter(email__iexact=email).first()
        if not existing and name:
            existing = BusinessGrowthExpert.objects.filter(name__iexact=name).first()

        if existing:
            self.stdout.write(self.style.WARNING(f'BGE already exists: id={existing.id} name="{existing.name}" email="{existing.email}"'))
            if send_email:
                res = ensure_bge_account(existing, send_email=True)
                self.stdout.write(self.style.SUCCESS(f'ensure_bge_account result: {res}'))
            return

        bge = BusinessGrowthExpert.objects.create(
            name=name,
            email=email,
            phone=phone,
            location=location,
            bge_code=bge_code,
            top_skills='',
            status='approved',
        )

        self.stdout.write(self.style.SUCCESS(f'Created BGE: id={bge.id} name="{bge.name}" email="{bge.email}"'))

        try:
            res = ensure_bge_account(bge, send_email=send_email)
            self.stdout.write(self.style.SUCCESS(f'ensure_bge_account result: {res}'))
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f'Error provisioning account: {exc}'))
