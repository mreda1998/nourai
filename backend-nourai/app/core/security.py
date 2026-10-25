"""
Supabase JWT verification and authentication dependencies.

Supabase signs access tokens with the project's current JWT signing key:
ES256 (checked against the public keys the project publishes as a JWKS) or,
on projects still using the legacy secret, HS256 with the shared JWT secret.
"""
import asyncio
import logging
import time
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.user import UserProfile

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

ASYMMETRIC_ALGORITHMS = ("ES256", "RS256")
JWKS_TTL_SECONDS = 600  # Supabase's edge caches the JWKS for 10 minutes too
JWKS_MIN_REFETCH_SECONDS = 30  # so unknown key ids can't force a fetch per request


async def _fetch_jwks() -> dict:
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=5) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


class SigningKeys:
    """The project's public signing keys by key id, refreshed from its JWKS."""

    def __init__(self) -> None:
        self.keys: dict[str, dict] = {}
        self.fetched_at = float("-inf")
        self.lock = asyncio.Lock()

    def _stale(self, kid: str | None) -> bool:
        age = time.monotonic() - self.fetched_at
        return age > JWKS_TTL_SECONDS or (kid not in self.keys and age > JWKS_MIN_REFETCH_SECONDS)

    async def get(self, kid: str | None) -> dict | None:
        """Raises httpx.HTTPError only when the key set can't be fetched and `kid` isn't cached."""
        if self._stale(kid):
            async with self.lock:
                if self._stale(kid):  # another request may have refreshed while this one waited
                    try:
                        jwks = await _fetch_jwks()
                    except httpx.HTTPError as exc:
                        if kid not in self.keys:
                            raise
                        logger.warning("Supabase JWKS refresh failed, using cached keys: %s", exc)
                    else:
                        self.keys = {key["kid"]: key for key in jwks.get("keys", []) if "kid" in key}
                        self.fetched_at = time.monotonic()
        return self.keys.get(kid)


_signing_keys = SigningKeys()


class TokenPayload(BaseModel):
    """JWT token payload from Supabase."""

    sub: str  # User ID (UUID)
    email: str | None = None
    aud: str | None = None
    exp: int | None = None
    iat: int | None = None


def _invalid_token() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid token",
    )


async def verify_supabase_jwt(token: str) -> TokenPayload:
    """
    Verify JWT token from Supabase.

    The token's own header picks the check: ES256/RS256 against the project's
    published key with that key id, HS256 against the legacy shared secret.
    """
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise _invalid_token()

    algorithm = header.get("alg")
    if algorithm == "HS256" and settings.supabase_jwt_secret:
        key = settings.supabase_jwt_secret
    elif algorithm in ASYMMETRIC_ALGORITHMS:
        try:
            key = await _signing_keys.get(header.get("kid"))
        except httpx.HTTPError as exc:
            logger.error("Could not fetch Supabase JWKS: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Sign-in is temporarily unavailable",
            )
        if key is None:
            logger.warning("Rejected %s token with unknown key id %r", algorithm, header.get("kid"))
            raise _invalid_token()
    else:
        logger.warning("Rejected token with unsupported algorithm %r", algorithm)
        raise _invalid_token()

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            audience="authenticated",
        )
        return TokenPayload(**payload)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.JWTClaimsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
        )
    except JWTError as exc:
        logger.warning("Rejected %s token: %s", algorithm, exc)
        raise _invalid_token()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserProfile:
    """Get the current authenticated user, creating profile if needed."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = await verify_supabase_jwt(credentials.credentials)

    # Find or create user profile
    result = await db.execute(
        select(UserProfile).where(UserProfile.supabase_id == payload.sub)
    )
    user = result.scalar_one_or_none()

    if not user:
        user = UserProfile(
            supabase_id=payload.sub,
            email=payload.email,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


async def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserProfile | None:
    """Get the current user if authenticated, or None if not."""
    if not credentials:
        return None

    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None
