import asyncio

from httpx import ASGITransport, AsyncClient

from app.main import app


def get_response(path: str):
    async def request():
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            return await client.get(path)

    return asyncio.run(request())


def test_health_check_returns_versioned_api_status() -> None:
    response = get_response("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_check_returns_root_health_status() -> None:
    response = get_response("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_contains_versioned_health_route() -> None:
    response = get_response("/openapi.json")

    assert response.status_code == 200
    assert "/api/v1/health" in response.json()["paths"]


def test_models_endpoint_returns_openai_format() -> None:
    response = get_response("/v1/models")

    assert response.status_code == 200
    data = response.json()
    assert data["object"] == "list"
    assert isinstance(data["data"], list)