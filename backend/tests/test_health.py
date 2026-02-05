from __future__ import annotations

import json

from django.test import Client


def test_health_ok(client: Client) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = json.loads(resp.content)
    assert data["status"] == "ok"
