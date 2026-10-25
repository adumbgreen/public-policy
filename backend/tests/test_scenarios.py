from app import worker


def create(client, **overrides):
    body = {"name": "Test scenario", **overrides}
    response = client.post("/api/scenarios", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_fills_definition_defaults(client):
    scenario = create(client)
    assert len(scenario["slug"]) == 8
    assert scenario["definition"]["options"] == {
        "start_year": 2026,
        "years": 10,
        "labor_supply_responses": False,
    }
    assert scenario["definition"]["vat"]["enabled"] is False


def test_read_and_update_by_slug(client):
    slug = create(client)["slug"]
    definition = {
        "vat": {"enabled": True, "rate": 0.03, "excluded_categories": ["healthcare", "housing"]},
        "spending_changes": [{"line_code": "defense", "mode": "percent", "value": -25}],
    }
    response = client.put(
        f"/api/scenarios/{slug}", json={"name": "Renamed", "definition": definition}
    )
    assert response.status_code == 200, response.text

    scenario = client.get(f"/api/scenarios/{slug}").json()
    assert scenario["name"] == "Renamed"
    assert scenario["definition"]["vat"]["rate"] == 0.03
    assert scenario["definition"]["spending_changes"][0]["value"] == -25

    listed = client.get("/api/scenarios").json()
    assert [s["slug"] for s in listed] == [slug]


def test_unknown_slug_is_404(client):
    assert client.get("/api/scenarios/nope").status_code == 404


def test_invalid_definition_is_rejected(client):
    response = client.post(
        "/api/scenarios", json={"name": "Bad", "definition": {"vat": {"rate": 2}}}
    )
    assert response.status_code == 422


def test_identical_definitions_share_a_run(client):
    first = create(client)["slug"]
    second = create(client, name="Same policy")["slug"]
    run_a = client.post(f"/api/scenarios/{first}/runs").json()
    run_b = client.post(f"/api/scenarios/{second}/runs").json()
    assert run_a["status"] == "queued"
    assert run_a["id"] == run_b["id"]


def test_worker_records_engine_failure(client):
    slug = create(client)["slug"]
    run_id = client.post(f"/api/scenarios/{slug}/runs").json()["id"]

    assert worker.process_next() is True
    assert worker.process_next() is False

    run = client.get(f"/api/runs/{run_id}").json()
    assert run["status"] == "failed"
    assert "isn't built yet" in run["error"]

    # A failed run isn't reused; asking again queues a new one.
    retry = client.post(f"/api/scenarios/{slug}/runs").json()
    assert retry["id"] != run_id


def test_sources_starts_empty(client):
    assert client.get("/api/sources").json() == []
