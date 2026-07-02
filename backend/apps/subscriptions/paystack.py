"""
Thin wrapper around the Paystack API.
All HTTP calls to Paystack go through here — keeps views clean.
"""
from urllib.parse import quote

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

PAYSTACK_BASE = "https://api.paystack.co"


def _secret_key():
    secret_key = (settings.PAYSTACK_SECRET_KEY or "").strip()
    if not secret_key:
        raise ImproperlyConfigured("PAYSTACK_SECRET_KEY is required for Paystack API calls.")
    return secret_key


def _headers():
    return {
        "Authorization": f"Bearer {_secret_key()}",
        "Content-Type": "application/json",
    }


def _raise_for_status(resp):
    """
    Better than requests.raise_for_status() — includes the Paystack
    error message from the response body so it propagates to logs/UI.
    """
    if not resp.ok:
        try:
            body = resp.json()
            message = body.get("message", resp.text)
        except Exception:
            message = resp.text
        raise Exception(f"Paystack API error {resp.status_code}: {message}")


def create_customer(email, full_name, phone=""):
    """Creates a Paystack customer and returns the customer_code."""
    resp = requests.post(
        f"{PAYSTACK_BASE}/customer",
        json={"email": email, "full_name": full_name, "phone": phone},
        headers=_headers(),
        timeout=10,
    )
    _raise_for_status(resp)
    data = resp.json()
    return data["data"]["customer_code"]


def initialize_transaction(email, amount_kobo, plan_code=None, callback_url=None, metadata=None):
    """
    Initializes a Paystack transaction.
    Returns the authorization_url to redirect the user to.
    amount_kobo: amount in kobo (multiply naira by 100)
    plan_code: optional Paystack plan code for recurring subscriptions.
               If blank/None, creates a one-time charge instead.
    callback_url: where Paystack redirects the user after payment.
    """
    payload = {
        "email": email,
        "amount": amount_kobo,
        "metadata": metadata or {},
        "currency": "NGN",
    }
    # Only include plan if a valid plan code was provided
    if plan_code:
        payload["plan"] = plan_code
    # Tell Paystack where to redirect after checkout
    if callback_url:
        payload["callback_url"] = callback_url

    resp = requests.post(
        f"{PAYSTACK_BASE}/transaction/initialize",
        json=payload,
        headers=_headers(),
        timeout=10,
    )
    _raise_for_status(resp)
    data = resp.json()
    return {
        "authorization_url": data["data"]["authorization_url"],
        "access_code": data["data"]["access_code"],
        "reference": data["data"]["reference"],
    }


def verify_transaction(reference):
    """Verifies a transaction by reference. Returns the full data dict."""
    resp = requests.get(
        f"{PAYSTACK_BASE}/transaction/verify/{reference}",
        headers=_headers(),
        timeout=10,
    )
    _raise_for_status(resp)
    return resp.json()["data"]


def list_transactions(
    page=1,
    per_page=50,
    customer_id=None,
    status=None,
    date_from=None,
    date_to=None,
    amount=None,
):
    """Lists transactions on the integration, optionally filtered by customer."""
    params = {"page": page, "perPage": per_page}
    if customer_id:
        params["customer"] = customer_id
    if status:
        params["status"] = status
    if date_from:
        params["from"] = date_from
    if date_to:
        params["to"] = date_to
    if amount is not None:
        params["amount"] = amount

    resp = requests.get(
        f"{PAYSTACK_BASE}/transaction",
        headers=_headers(),
        params=params,
        timeout=10,
    )
    _raise_for_status(resp)
    return resp.json()["data"]


def list_subscriptions(page=1, per_page=50, customer_id=None):
    """Lists subscriptions on the integration."""
    params = {"page": page, "perPage": per_page}
    if customer_id:
        params["customer"] = customer_id

    resp = requests.get(
        f"{PAYSTACK_BASE}/subscription",
        headers=_headers(),
        params=params,
        timeout=10,
    )
    _raise_for_status(resp)
    return resp.json()["data"]


def fetch_subscription(subscription_code):
    """Fetches one subscription directly by its Paystack code."""
    code = (subscription_code or "").strip()
    if not code:
        raise ValueError("subscription_code is required")

    resp = requests.get(
        f"{PAYSTACK_BASE}/subscription/{quote(code, safe='')}",
        headers=_headers(),
        timeout=10,
    )
    _raise_for_status(resp)
    return resp.json()["data"]


def fetch_customer(email_or_code):
    """Fetches a Paystack customer, including their subscription records."""
    identifier = (email_or_code or "").strip()
    if not identifier:
        raise ValueError("email_or_code is required")

    resp = requests.get(
        f"{PAYSTACK_BASE}/customer/{quote(identifier, safe='')}",
        headers=_headers(),
        timeout=10,
    )
    _raise_for_status(resp)
    return resp.json()["data"]


def find_subscription(
    subscription_code=None,
    customer_code=None,
    customer_email=None,
    plan_code=None,
    statuses=None,
    max_pages=10,
):
    """
    Finds the most relevant subscription by customer and/or plan.
    We filter locally because Paystack's list endpoint is easiest to query this way
    from the identifiers we already store.
    """
    allowed_statuses = set(statuses or ["active"])

    def mapping(value):
        return value if isinstance(value, dict) else {}

    def status_matches(record):
        record_status = (record.get("status") or "").strip().lower()
        return not allowed_statuses or record_status in allowed_statuses

    def matches(record):
        if customer_code:
            record_customer_code = (
                mapping(record.get("customer")).get("customer_code") or ""
            ).strip()
            if record_customer_code != customer_code:
                return False
        if plan_code:
            record_plan_code = (
                mapping(record.get("plan")).get("plan_code") or ""
            ).strip()
            if record_plan_code != plan_code:
                return False
        return status_matches(record)

    def result(record):
        return {
            "subscription_code": record.get("subscription_code") or "",
            "email_token": record.get("email_token") or "",
            "status": (record.get("status") or "").strip().lower(),
            "raw": record,
        }

    if subscription_code:
        try:
            record = fetch_subscription(subscription_code)
        except Exception:
            if not customer_code and not customer_email:
                raise
        else:
            # The exact subscription code is the strongest identifier. Customer
            # and plan values may legitimately become stale after account or plan
            # changes, so recover them from this authoritative record.
            if status_matches(record):
                return result(record)

    per_page = 50
    if subscription_code or customer_code:
        for page in range(1, max_pages + 1):
            records = list_subscriptions(page=page, per_page=per_page)
            for record in records:
                if subscription_code:
                    record_subscription_code = (record.get("subscription_code") or "").strip()
                    if not customer_code and record_subscription_code != subscription_code:
                        continue
                if not matches(record):
                    continue
                return result(record)
            if len(records) < per_page:
                break

    if customer_email:
        customer = fetch_customer(customer_email)
        recovered_customer_code = (customer.get("customer_code") or "").strip()
        customer_records = []
        customer_id = customer.get("id")
        if customer_id:
            for page in range(1, max_pages + 1):
                records = list_subscriptions(
                    page=page,
                    per_page=per_page,
                    customer_id=customer_id,
                )
                customer_records.extend(records)
                if len(records) < per_page:
                    break
        if not customer_records:
            customer_records = customer.get("subscriptions") or []

        candidates = []
        for record in customer_records:
            if not isinstance(record, dict) or not status_matches(record):
                continue
            record_plan_code = (
                mapping(record.get("plan")).get("plan_code") or ""
            ).strip()
            if plan_code and record_plan_code != plan_code:
                continue
            normalized_record = dict(record)
            normalized_record["customer"] = {
                "customer_code": recovered_customer_code,
                "email": customer.get("email") or customer_email,
            }
            candidates.append(normalized_record)

        if candidates:
            candidates.sort(
                key=lambda record: (
                    record.get("next_payment_date") or "",
                    record.get("updatedAt") or record.get("updated_at") or "",
                ),
                reverse=True,
            )
            return result(candidates[0])

    return None


def cancel_subscription(subscription_code, email_token):
    """Cancels a Paystack subscription."""
    resp = requests.post(
        f"{PAYSTACK_BASE}/subscription/disable",
        json={"code": subscription_code, "token": email_token},
        headers=_headers(),
        timeout=10,
    )
    _raise_for_status(resp)
    return resp.json()
