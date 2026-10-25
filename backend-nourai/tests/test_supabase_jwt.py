import json
import time

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from jose import jwk, jwt
from jose.utils import base64url_encode

from app.core import security
from app.core.config import settings

KID = "ec2008ea-32c9-46a4-9640-36378229abdb"
USER_ID = "58d79221-40ef-4f09-9378-cae900ad0e02"


@pytest.fixture
def anyio_backend():
    return 'asyncio'


@pytest.fixture(autouse=True)
def fresh_keys(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "legacy-test-secret")
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(security, "_signing_keys", security.SigningKeys())


def signing_key(kid=KID):
    private = ec.generate_private_key(ec.SECP256R1())
    pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public = jwk.construct(pem, "ES256").public_key().to_dict()
    return pem, {**public, "kid": kid, "alg": "ES256", "use": "sig"}


def claims(**changes):
    return {"sub": USER_ID, "aud": "authenticated", "role": "authenticated", "exp": int(time.time()) + 3600, **changes}


def es256(pem, kid=KID, **changes):
    return jwt.encode(claims(**changes), pem, algorithm="ES256", headers={"kid": kid})


def serve_jwks(monkeypatch, *key_sets):
    """Each JWKS fetch answers the next key set (the last one repeats); returns the fetch log."""
    fetches = []

    async def fetch():
        fetches.append(len(fetches))
        return {"keys": key_sets[min(len(fetches), len(key_sets)) - 1]}

    monkeypatch.setattr(security, "_fetch_jwks", fetch)
    return fetches


async def rejection(token):
    with pytest.raises(HTTPException) as rejected:
        await security.verify_supabase_jwt(token)
    return rejected.value.status_code, rejected.value.detail


@pytest.mark.anyio
async def test_accepts_es256_token_signed_by_a_published_key(monkeypatch):
    pem, public = signing_key()
    serve_jwks(monkeypatch, [public])

    assert (await security.verify_supabase_jwt(es256(pem))).sub == USER_ID


@pytest.mark.anyio
async def test_still_accepts_legacy_hs256_token(monkeypatch):
    fetches = serve_jwks(monkeypatch, [])
    token = jwt.encode(claims(), settings.supabase_jwt_secret, algorithm="HS256")

    assert (await security.verify_supabase_jwt(token)).sub == USER_ID
    assert fetches == []


@pytest.mark.anyio
async def test_hs256_is_refused_when_no_secret_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    serve_jwks(monkeypatch, [])

    assert (await rejection(jwt.encode(claims(), "", algorithm="HS256")))[0] == 401


@pytest.mark.anyio
async def test_rejects_es256_token_signed_by_another_key(monkeypatch):
    _, public = signing_key()
    forger_pem, _ = signing_key()
    serve_jwks(monkeypatch, [public])

    assert (await rejection(es256(forger_pem)))[0] == 401


@pytest.mark.anyio
async def test_rejects_hs256_token_signed_with_the_public_key(monkeypatch):
    _, public = signing_key()
    serve_jwks(monkeypatch, [public])
    token = jwt.encode(claims(), json.dumps(public), algorithm="HS256", headers={"kid": KID})

    assert (await rejection(token))[0] == 401


@pytest.mark.anyio
async def test_rejects_unsigned_token(monkeypatch):
    serve_jwks(monkeypatch, [])
    header = base64url_encode(b'{"alg":"none","typ":"JWT"}').decode()
    payload = base64url_encode(json.dumps(claims()).encode()).decode()

    assert (await rejection(f"{header}.{payload}."))[0] == 401


@pytest.mark.anyio
@pytest.mark.parametrize("changes, detail", [
    ({"aud": "anon"}, "Invalid token claims"),
    ({"exp": int(time.time()) - 60}, "Token has expired"),
])
async def test_rejects_es256_token_with_bad_claims(monkeypatch, changes, detail):
    pem, public = signing_key()
    serve_jwks(monkeypatch, [public])

    assert await rejection(es256(pem, **changes)) == (401, detail)


@pytest.mark.anyio
async def test_key_set_is_cached_between_requests(monkeypatch):
    pem, public = signing_key()
    fetches = serve_jwks(monkeypatch, [public])

    await security.verify_supabase_jwt(es256(pem))
    await security.verify_supabase_jwt(es256(pem))
    assert len(fetches) == 1


@pytest.mark.anyio
async def test_refetches_key_set_when_supabase_rotates_to_a_new_key(monkeypatch):
    monkeypatch.setattr(security, "JWKS_MIN_REFETCH_SECONDS", 0)
    old_pem, old_public = signing_key()
    new_pem, new_public = signing_key(kid="rotated-key")
    fetches = serve_jwks(monkeypatch, [old_public], [old_public, new_public])

    await security.verify_supabase_jwt(es256(old_pem))
    assert (await security.verify_supabase_jwt(es256(new_pem, kid="rotated-key"))).sub == USER_ID
    assert len(fetches) == 2


@pytest.mark.anyio
async def test_unknown_key_ids_cannot_force_a_fetch_per_request(monkeypatch):
    pem, public = signing_key()
    fetches = serve_jwks(monkeypatch, [public])

    await security.verify_supabase_jwt(es256(pem))
    for attempt in range(3):
        assert (await rejection(es256(pem, kid=f"bogus-{attempt}")))[0] == 401
    assert len(fetches) == 1


@pytest.mark.anyio
async def test_unreachable_key_set_is_a_server_error_not_a_sign_out(monkeypatch):
    pem, _ = signing_key()

    async def unreachable():
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(security, "_fetch_jwks", unreachable)

    assert (await rejection(es256(pem)))[0] == 503


@pytest.mark.anyio
async def test_known_keys_keep_working_while_the_key_set_cannot_refresh(monkeypatch):
    pem, public = signing_key()
    serve_jwks(monkeypatch, [public])
    await security.verify_supabase_jwt(es256(pem))

    async def unreachable():
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(security, "_fetch_jwks", unreachable)
    monkeypatch.setattr(security, "JWKS_TTL_SECONDS", 0)

    assert (await security.verify_supabase_jwt(es256(pem))).sub == USER_ID
