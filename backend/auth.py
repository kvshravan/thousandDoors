"""Signed-in users. The browser signs in with Supabase Auth and sends its access token
as `Authorization: Bearer <token>`; Flask verifies the token's signature against the
project's public signing keys (JWKS), so no shared secret is needed.
"""

import time
from dataclasses import dataclass
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request

ALGORITHMS = ["ES256", "RS256"]


@dataclass(frozen=True)
class User:
    id: str
    email: str

    def claims(self) -> dict:
        return {
            "sub": self.id,
            "email": self.email,
            "role": "authenticated",
            "aud": "authenticated",
        }


class TokenVerifier:
    """Verifies Supabase access tokens from a JWKS URL, or from a JWKS dict (tests)."""

    def __init__(self, *, issuer: str, jwks_url: str | None = None, jwks: dict | None = None):
        self.issuer = issuer
        self._client = (
            jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=3600) if jwks_url else None
        )
        self._keys = {key["kid"]: jwt.PyJWK(key) for key in (jwks or {}).get("keys", [])}

    def verify(self, token: str) -> User:
        header = jwt.get_unverified_header(token)
        if self._client:
            key = self._client.get_signing_key_from_jwt(token)
        else:
            key = self._keys.get(header.get("kid"))
            if not key:
                raise jwt.InvalidTokenError("Unknown signing key.")
        claims = jwt.decode(
            token,
            key=key,
            algorithms=ALGORITHMS,
            audience="authenticated",
            issuer=self.issuer,
            leeway=30,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
        if claims.get("role") != "authenticated":
            raise jwt.InvalidTokenError("Not a signed-in user.")
        return User(id=claims["sub"], email=claims.get("email", ""))


def current_user() -> User | None:
    """The signed-in user for this request, or None. Invalid tokens count as signed out."""
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        try:
            g.user = current_app.extensions["doors.auth"].verify(header.removeprefix("Bearer "))
        except (jwt.PyJWTError, KeyError, ValueError) as error:
            current_app.logger.info("Rejected access token: %s", type(error).__name__)
    return g.user


def require_user(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            message = "Sign in first."
            return jsonify(error={"code": "unauthorized", "message": message}), 401
        return view(*args, **kwargs)

    return wrapped


class TestSigner:
    """Signs tokens like Supabase does, for tests (never used outside TESTING)."""

    def __init__(self, issuer: str):
        from cryptography.hazmat.primitives.asymmetric import ec

        self.issuer = issuer
        self._key = ec.generate_private_key(ec.SECP256R1())
        public = jwt.algorithms.ECAlgorithm.to_jwk(self._key.public_key(), as_dict=True)
        self.jwks = {"keys": [{**public, "kid": "test-key", "alg": "ES256", "use": "sig"}]}

    def token(
        self, user_id: str, email: str, lifetime: int = 3600, name: str | None = None
    ) -> tuple[str, int]:
        expires = int(time.time()) + lifetime
        claims = {
            "sub": user_id,
            "email": email,
            "role": "authenticated",
            "aud": "authenticated",
            "iss": self.issuer,
            "exp": expires,
        }
        if name:
            claims["user_metadata"] = {"full_name": name}
        token = jwt.encode(claims, self._key, algorithm="ES256", headers={"kid": "test-key"})
        return token, expires
