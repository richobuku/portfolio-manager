from django.test import TestCase
from django.utils import timezone
from .models import (
    MSME, BusinessGrowthExpert, BGEGroup, WorkOrder, MSMEReport, GroupReport,
    TrainingSession, TrainingReport, EnterpriseImprovementPlan, FinancialImprovementActionPlan,
)
from .pdf_reports import (
    render_work_order, render_msme_report, render_group_report,
    render_training_report, generate_enterprise_improvement_plan_pdf, generate_financial_improvement_plan_pdf,
    verify_pdf_printer_safe,
)


class PDFPrinterSafetyTests(TestCase):
    """
    Automated check verifying that every generated PDF is 100% printer-safe:
    1. pdffonts: All fonts must be fully embedded (emb == 'yes').
    2. pdfimages -list: Must contain NO transparency soft-masks (smask).
    3. qpdf --check: Must report zero errors.
    """

    def setUp(self):
        self.bge = BusinessGrowthExpert.objects.create(
            name="Rosemary Akello",
            bge_code="PRUDEV-BGE-01",
            email="rosemary@example.com",
            phone="+256700000001",
            top_skills="Financial Planning & Agribusiness",
        )
        self.msme = MSME.objects.create(
            business_name="Northern Agri Enterprise",
            msme_code="MSME-001",
            assigned_bge=self.bge,
            district="Gulu",
        )
        self.group = BGEGroup.objects.create(
            name="Acholi Growth Hub",
            team_lead=self.bge,
        )
        self.session = TrainingSession.objects.create(
            title="Financial Management and Record Keeping Workshop",
            date=timezone.now().date(),
            location="Gulu District Hall",
        )

    def test_work_order_pdf_printer_safe(self):
        wo = WorkOrder.objects.create(
            bge=self.bge,
            work_order_number="WO-PRUDEV-2026-TEST",
            work_order_type="permanent_assignee_support",
            status="signed",
            issue_date=timezone.now().date(),
            bge_signed_date=timezone.now().date(),
            objective="Deliver thematic coaching and accelerate enterprise growth.",
        )
        buf = render_work_order(wo)
        self.assertTrue(verify_pdf_printer_safe(buf))

    def test_msme_visit_report_pdf_printer_safe(self):
        report = MSMEReport.objects.create(
            msme=self.msme,
            bge=self.bge,
            visit_type="first_visit",
            visit_date=timezone.now().date(),
            status="submitted",
            key_achievement="Verified business accounts and conducted baseline.",
            concrete_takeaway="Maintain daily physical sales records.",
            coaching_focus_area="Financial Management",
        )
        buf = render_msme_report(report)
        self.assertTrue(verify_pdf_printer_safe(buf))

    def test_group_report_pdf_printer_safe(self):
        grep = GroupReport.objects.create(
            group=self.group,
            team_lead=self.bge,
            visit_date=timezone.now().date(),
            session_number=1,
            status="approved",
            session_overview="Successful collective coaching on cost accounting.",
        )
        buf = render_group_report(grep)
        self.assertTrue(verify_pdf_printer_safe(buf))

    def test_training_report_pdf_printer_safe(self):
        tr = TrainingReport.objects.create(
            session=self.session,
            bge=self.bge,
            status="submitted",
            training_title=self.session.title,
            training_dates=str(self.session.date),
            venue=self.session.location,
            district="Gulu",
        )
        buf = render_training_report(tr)
        self.assertTrue(verify_pdf_printer_safe(buf))

    def test_enterprise_improvement_plan_pdf_printer_safe(self):
        plan = EnterpriseImprovementPlan.objects.create(
            msme=self.msme,
            bge=self.bge,
            assessment_date=timezone.now().date(),
            status="signed",
        )
        pdf_bytes = generate_enterprise_improvement_plan_pdf(plan)
        self.assertTrue(verify_pdf_printer_safe(pdf_bytes))

    def test_financial_improvement_plan_pdf_printer_safe(self):
        plan = FinancialImprovementActionPlan.objects.create(
            msme=self.msme,
            bge=self.bge,
            assessment_date=timezone.now().date(),
            status="signed",
            category="credit_readiness",
            category_name="Credit Readiness & Access to Finance",
        )
        pdf_bytes = generate_financial_improvement_plan_pdf(plan)
        self.assertTrue(verify_pdf_printer_safe(pdf_bytes))
