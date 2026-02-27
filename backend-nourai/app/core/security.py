"""
Supabase JWT verification and authentication dependencies.

Supabase uses HS256 algorithm with a shared JWT secret.
"""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.user import UserProfile


security = HTTPBearer(auto_error=False)


class TokenPayload(BaseModel):
    """JWT token payload from Supabase."""

    sub: str  # User ID (UUID)
    email: str | None = None
    aud: str | None = None
    exp: int | None = None
    iat: int | None = None


def verify_supabase_jwt(token: str) -> TokenPayload:
    """
    Verify JWT token from Supabase.

    Supabase uses HS256 with a shared JWT secret.
    """
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
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
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


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

    payload = verify_supabase_jwt(credentials.credentials)

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
