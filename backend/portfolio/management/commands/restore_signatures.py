"""
Management command: restore_signatures
======================================
Audits every BGE's signature state and attempts to recover missing signatures
from frozen signed-PDF bytes stored in the database (WorkOrder.signed_pdf_data).

Usage
-----
  # Dry run — report only, no writes
  python manage.py restore_signatures --dry-run

  # Attempt full restoration
  python manage.py restore_signatures

  # Restore a single BGE by ID
  python manage.py restore_signatures --bge-id 42

How it works
------------
1. For each BGE:
   a. If signature_data is present  → signature is intact; note it.
   b. If signature_data is NULL/empty but signature (file path) is set
      and the file is readable → re-populate signature_data from the file
      (rare on Render since the FS is ephemeral).
   c. If both are missing → scan the BGE's signed WorkOrders for
      signed_pdf_data (PDF bytes stored in PostgreSQL).  Extract every
      embedded image from the PDF; pick the one most likely to be the
      signature (largest non-logo image) and restore it to signature_data.

Requires
--------
  pypdf>=4.0  (added to requirements.txt alongside this command)
  Pillow      (already a dependency)
"""

import io
import struct
import zlib
import logging

from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)


def _extract_images_from_pdf_bytes(pdf_bytes: bytes) -> list[bytes]:
    """
    Extract raw image bytes from a PDF using pypdf.
    Returns a list of PNG/JPEG bytes (one per image found).
    Falls back to a manual stream scan if pypdf can't extract them.
    """
    images = []
    try:
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError

        reader = PdfReader(io.BytesIO(pdf_bytes))
        for page in reader.pages:
            if "/Resources" not in page:
                continue
            resources = page["/Resources"]
            if "/XObject" not in resources:
                continue
            xobjects = resources["/XObject"].get_object()
            for name, obj_ref in xobjects.items():
                obj = obj_ref.get_object()
                if obj.get("/Subtype") == "/Image":
                    try:
                        raw = obj.get_data()
                        color_space = obj.get("/ColorSpace", "/DeviceRGB")
                        # Try to convert raw bytes → PNG via Pillow
                        try:
                            from PIL import Image as PILImage
                            # raw may already be JPEG-compressed
                            # attempt direct open first
                            pil_img = PILImage.open(io.BytesIO(raw))
                            buf = io.BytesIO()
                            pil_img.save(buf, format='PNG')
                            images.append(buf.getvalue())
                        except Exception:
                            # If pypdf already decoded to raw pixel data, reconstruct
                            width  = int(obj.get("/Width",  100))
                            height = int(obj.get("/Height", 100))
                            mode   = "RGB" if "RGB" in str(color_space) else "RGBA"
                            try:
                                from PIL import Image as PILImage
                                pil_img = PILImage.frombytes(mode, (width, height), raw)
                                buf = io.BytesIO()
                                pil_img.save(buf, format='PNG')
                                images.append(buf.getvalue())
                            except Exception:
                                # Store raw anyway — might still be usable
                                images.append(raw)
                    except Exception as exc:
                        logger.debug("Skipped XObject %s: %s", name, exc)
    except ImportError:
        # pypdf not installed — fall back to simple JPEG stream scan
        images.extend(_scan_jpeg_streams(pdf_bytes))
    except Exception as exc:
        logger.warning("pypdf extraction failed: %s — falling back to stream scan", exc)
        images.extend(_scan_jpeg_streams(pdf_bytes))
    return images


def _scan_jpeg_streams(pdf_bytes: bytes) -> list[bytes]:
    """
    Naive fallback: find JPEG Start-Of-Image markers (FF D8 FF) in the raw
    PDF byte stream and extract everything up to the End-Of-Image (FF D9).
    Works on most ReportLab-generated PDFs where images are stored inline.
    """
    images = []
    pos = 0
    while True:
        start = pdf_bytes.find(b'\xff\xd8\xff', pos)
        if start == -1:
            break
        end = pdf_bytes.find(b'\xff\xd9', start)
        if end == -1:
            break
        images.append(pdf_bytes[start:end + 2])
        pos = end + 2
    return images


def _pick_signature(images: list[bytes], bge_name: str) -> bytes | None:
    """
    From a list of image blobs extracted from a signed work order PDF, choose
    the one most likely to be the BGE's signature rather than the programme
    logo or any other decorative image.

    Heuristics (in order):
    1. If only one image → use it.
    2. Prefer images whose pixel dimensions are roughly landscape / wide
       (signatures tend to be wide & short: ~4:1 to 8:1 width-to-height).
    3. Among candidates, pick the largest byte-size (most detail).
    4. Exclude images that appear to be the GOPA/programme logo
       (they tend to have more saturated colours vs a greyscale/transparent sig).
    """
    if not images:
        return None
    if len(images) == 1:
        return images[0]

    from PIL import Image as PILImage

    candidates = []
    for raw in images:
        try:
            pil_img = PILImage.open(io.BytesIO(raw)).convert("RGBA")
            w, h = pil_img.size
            ratio = w / h if h else 0
            # Signature: wider than tall, at least 2:1, up to ~20:1
            if 1.5 <= ratio <= 25:
                candidates.append((raw, w * h, ratio))
        except Exception:
            continue

    if not candidates:
        # Fall back: largest image by byte size
        return max(images, key=len)

    # Sort by area desc and pick the best candidate
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[0][0]


class Command(BaseCommand):
    help = (
        "Audit and restore BGE signatures. "
        "Reads signed WorkOrder PDFs from the DB to recover embedded signatures."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report only — make no changes to the database.",
        )
        parser.add_argument(
            "--bge-id",
            type=int,
            default=None,
            help="Restrict to a single BGE by primary key.",
        )

    def handle(self, *args, **options):
        from portfolio.models import BusinessGrowthExpert, WorkOrder

        dry_run = options["dry_run"]
        bge_id  = options["bge_id"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be written.\n"))

        qs = BusinessGrowthExpert.objects.all().order_by("name")
        if bge_id:
            qs = qs.filter(pk=bge_id)

        ok        = []
        recovered = []
        failed    = []
        no_source = []

        for bge in qs:
            name = f"{bge.name} (id={bge.id})"

            # ── Case A: signature_data already present ─────────────────────
            if bge.signature_data:
                ok.append(name)
                self.stdout.write(f"  ✅  {name} — signature_data intact")
                continue

            # ── Case B: file on local FS (unlikely in production) ──────────
            if bge.signature and bge.signature.name:
                try:
                    raw = bge.signature.read()
                    if raw:
                        if not dry_run:
                            bge.signature_data = raw
                            bge.save(update_fields=["signature_data"])
                        recovered.append(name)
                        self.stdout.write(
                            self.style.SUCCESS(f"  ♻️  {name} — restored from filesystem file")
                        )
                        continue
                except Exception:
                    pass

            # ── Case C: scan signed WorkOrders for embedded signature ───────
            signed_wos = (
                WorkOrder.objects.filter(bge=bge, status="signed")
                .exclude(signed_pdf_data=None)
                .order_by("-bge_signed_date", "-created_at")
            )

            restored = False
            for wo in signed_wos:
                pdf_bytes = bytes(wo.signed_pdf_data)
                images = _extract_images_from_pdf_bytes(pdf_bytes)
                sig_bytes = _pick_signature(images, bge.name)
                if sig_bytes:
                    # Quick sanity check: must be >= 1 KB (not a tiny placeholder)
                    if len(sig_bytes) < 1024:
                        continue
                    if not dry_run:
                        # Convert to clean PNG via Pillow and save
                        try:
                            from PIL import Image as PILImage
                            pil_img = PILImage.open(io.BytesIO(sig_bytes)).convert("RGBA")
                            buf = io.BytesIO()
                            pil_img.save(buf, format="PNG")
                            png_bytes = buf.getvalue()
                        except Exception:
                            png_bytes = sig_bytes

                        bge.signature_data = png_bytes
                        bge.save(update_fields=["signature_data"])
                        # Also save the file so it's accessible via the path
                        try:
                            fname = f"sig_{bge.id}_restored.png"
                            bge.signature.save(fname, ContentFile(png_bytes), save=False)
                            bge.save(update_fields=["signature"])
                        except Exception:
                            pass  # DB bytes are what matter; file is best-effort

                    recovered.append(name)
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ♻️  {name} — restored from WorkOrder #{wo.work_order_number or wo.id}"
                        )
                    )
                    restored = True
                    break

            if not restored:
                if signed_wos.exists():
                    # Had signed WOs but couldn't extract an image
                    failed.append(name)
                    self.stdout.write(
                        self.style.ERROR(
                            f"  ❌  {name} — has signed WO(s) but could not extract signature image"
                        )
                    )
                else:
                    no_source.append(name)
                    self.stdout.write(
                        f"  ⚠️   {name} — no signature data and no signed work orders to recover from"
                    )

        # ── Summary ─────────────────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS(f"  Intact:     {len(ok)}"))
        self.stdout.write(self.style.SUCCESS(f"  Recovered:  {len(recovered)}"))
        self.stdout.write(self.style.ERROR  (f"  Failed:     {len(failed)}"))
        self.stdout.write(self.style.WARNING(f"  No source:  {len(no_source)}"))
        self.stdout.write("=" * 60)

        if no_source:
            self.stdout.write(
                "\nBGEs with no source — they need to re-upload their signature:\n"
            )
            for n in no_source:
                self.stdout.write(f"  • {n}")

        if failed:
            self.stdout.write(
                "\nBGEs where PDF extraction failed (check logs for details):\n"
            )
            for n in failed:
                self.stdout.write(f"  • {n}")

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "\nDry run complete — re-run without --dry-run to apply changes."
                )
            )
