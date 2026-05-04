"""
Custom Django email backend using Microsoft Graph API.

Replaces SMTP (which GOPA's tenant has disabled) with the Graph REST API.
Emails are sent from richard.obuku@gopa.eu via OAuth2 client-credentials flow.

Required environment variables (set in backend/.env):
    MS_TENANT_ID      — Azure AD tenant ID (Directory ID)
    MS_CLIENT_ID      — App registration client ID
    MS_CLIENT_SECRET  — App registration client secret
    MS_SENDER_EMAIL   — Mailbox to send from (richard.obuku@gopa.eu)
"""

import json
import logging
import msal
import requests
from django.core.mail.backends.base import BaseEmailBackend
from django.conf import settings

logger = logging.getLogger(__name__)


def _get_access_token():
    """Obtain an OAuth2 token via client-credentials flow."""
    tenant_id     = settings.MS_TENANT_ID
    client_id     = settings.MS_CLIENT_ID
    client_secret = settings.MS_CLIENT_SECRET

    authority = f"https://login.microsoftonline.com/{tenant_id}"
    app = msal.ConfidentialClientApplication(
        client_id,
        authority=authority,
        client_credential=client_secret,
    )
    result = app.acquire_token_for_client(
        scopes=["https://graph.microsoft.com/.default"]
    )
    if "access_token" not in result:
        error = result.get("error_description", result.get("error", "unknown"))
        raise RuntimeError(f"MS Graph token error: {error}")
    return result["access_token"]


def _build_graph_payload(email_message):
    """Convert a Django EmailMessage into a Graph API sendMail payload."""
    # Recipients
    to_recipients = [
        {"emailAddress": {"address": addr}} for addr in email_message.to
    ]
    cc_recipients = [
        {"emailAddress": {"address": addr}} for addr in (email_message.cc or [])
    ]

    # Body — prefer HTML alternative if present
    body_content = email_message.body
    body_type = "Text"
    for content, mimetype in getattr(email_message, "alternatives", []):
        if mimetype == "text/html":
            body_content = content
            body_type = "HTML"
            break

    payload = {
        "message": {
            "subject": email_message.subject,
            "body": {"contentType": body_type, "content": body_content},
            "toRecipients": to_recipients,
        },
        "saveToSentItems": "true",
    }
    if cc_recipients:
        payload["message"]["ccRecipients"] = cc_recipients

    return payload


class MicrosoftGraphEmailBackend(BaseEmailBackend):
    """
    Send emails through the Microsoft Graph API.
    Set EMAIL_BACKEND = 'portfolio.ms_graph_email.MicrosoftGraphEmailBackend'
    """

    def send_messages(self, email_messages):
        sender = getattr(settings, "MS_SENDER_EMAIL", "richard.obuku@gopa.eu")
        endpoint = f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail"

        try:
            token = _get_access_token()
        except Exception as exc:
            if not self.fail_silently:
                raise
            logger.error("MS Graph auth failed: %s", exc)
            return 0

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        sent = 0
        for msg in email_messages:
            try:
                payload = _build_graph_payload(msg)
                resp = requests.post(endpoint, headers=headers,
                                     data=json.dumps(payload), timeout=30)
                if resp.status_code == 202:
                    sent += 1
                else:
                    logger.error(
                        "Graph API send failed %s: %s", resp.status_code, resp.text
                    )
                    if not self.fail_silently:
                        raise RuntimeError(
                            f"Graph API error {resp.status_code}: {resp.text}"
                        )
            except requests.RequestException as exc:
                logger.error("Graph API request error: %s", exc)
                if not self.fail_silently:
                    raise

        return sent
