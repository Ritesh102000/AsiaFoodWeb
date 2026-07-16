import hmac

from fastapi import HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import get_settings


COOKIE_NAME = "afc_admin"


def serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt="afc-admin")


def verify_credentials(username: str, password: str) -> bool:
    settings = get_settings()
    return hmac.compare_digest(username, settings.admin_username) and hmac.compare_digest(
        password, settings.admin_password
    )


def create_session() -> str:
    return serializer().dumps({"role": "admin"})


async def require_admin(request: Request) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin login required")
    try:
        value = serializer().loads(token, max_age=60 * 60 * 8)
        if value.get("role") != "admin":
            raise BadSignature("Invalid role")
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin session expired")
