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
    assert scenario["definition"]["policies"] == []


def test_read_and_update_by_slug(client):
    slug = create(client)["slug"]
    definition = {
        "policies": [
            {"type": "vat", "name": "VAT", "rate": 0.03},
            {
                "type": "custom",
                "name": "National health insurance",
                "category": "spending",
                "annual_change_usd": 3e12,
                "index_to_inflation": True,
            },
        ]
    }
    response = client.put(
        f"/api/scenarios/{slug}", json={"name": "Renamed", "definition": definition}
    )
    assert response.status_code == 200, response.text

    scenario = client.get(f"/api/scenarios/{slug}").json()
    assert scenario["name"] == "Renamed"
    policies = scenario["definition"]["policies"]
    assert [p["type"] for p in policies] == ["vat", "custom"]
    assert policies[1]["annual_change_usd"] == 3e12

    listed = client.get("/api/scenarios").json()
    assert [s["slug"] for s in listed] == [slug]


def test_unknown_slug_is_404(client):
    assert client.get("/api/scenarios/nope").status_code == 404


def post_policies(client, policies):
    return client.post("/api/scenarios", json={"name": "Bad", "definition": {"policies": policies}})


def test_invalid_policy_is_rejected(client):
    assert post_policies(client, [{"type": "vat", "name": "VAT", "rate": 2}]).status_code == 422
    assert post_policies(client, [{"type": "unknown", "name": "?"}]).status_code == 422


def test_conflicting_policies_are_rejected(client):
    vat = {"type": "vat", "name": "VAT", "rate": 0.03}
    assert post_policies(client, [vat, vat]).status_code == 422

    path = "gov.irs.deductions.standard.amount.SINGLE"
    tax_a = {"type": "income_tax", "name": "A", "parameter_values": {path: 1}}
    tax_b = {"type": "income_tax", "name": "B", "parameter_values": {path: 2}}
    response = post_policies(client, [tax_a, tax_b])
    assert response.status_code == 422
    assert "'B' and 'A' both change" in response.text


def test_presets_are_valid_policies(client):
    presets = client.get("/api/presets").json()
    assert {p["type"] for p in presets} == {"income_tax", "vat"}
    response = post_policies(client, presets)
    assert response.status_code == 201, response.text


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
