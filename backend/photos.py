"""Uploaded photos: validation and file storage (Supabase Storage, or memory for tests).

The browser shrinks photos to 512 px JPEGs before uploading, so files are small; the
server still checks the size and the file's real type from its first bytes.
"""

import urllib.error
import urllib.parse
import urllib.request

MAX_BYTES = 2 * 1024 * 1024
BUCKET = "photos"
SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
}
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp"}


class PhotoError(ValueError):
    pass


def sniff(data: bytes) -> str:
    """The image type of `data`, judged by its bytes rather than its name or headers."""
    if not data:
        raise PhotoError("That file is empty.")
    if len(data) > MAX_BYTES:
        raise PhotoError("That photo is too big (2 MB at most).")
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    for content_type, prefixes in SIGNATURES.items():
        if data.startswith(prefixes):
            return content_type
    raise PhotoError("Choose a PNG, JPEG, WebP, or GIF image.")


class MemoryPhotoStorage:
    def __init__(self):
        self.files: dict[str, tuple[bytes, str]] = {}

    def put(self, path: str, data: bytes, content_type: str) -> None:
        self.files[path] = (data, content_type)

    def get(self, path: str) -> tuple[bytes, str] | None:
        return self.files.get(path)

    def public_url(self, path: str) -> str | None:
        return None


class SupabasePhotoStorage:
    """Writes with the project's secret key; reads go straight to the public bucket URL."""

    def __init__(self, url: str, secret_key: str):
        self.url = url.rstrip("/")
        self.secret_key = secret_key

    def put(self, path: str, data: bytes, content_type: str) -> None:
        target = f"{self.url}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}"
        request = urllib.request.Request(target, data=data, method="POST")
        request.add_header("apikey", self.secret_key)
        request.add_header("Authorization", f"Bearer {self.secret_key}")
        request.add_header("Content-Type", content_type)
        request.add_header("Cache-Control", "max-age=31536000")
        request.add_header("x-upsert", "false")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                response.read()
        except urllib.error.HTTPError as error:
            raise PhotoError(f"Storage refused the photo (HTTP {error.code}).") from error
        except urllib.error.URLError as error:
            raise PhotoError("Couldn't reach photo storage. Try again.") from error

    def get(self, path: str) -> tuple[bytes, str] | None:
        return None

    def public_url(self, path: str) -> str:
        return f"{self.url}/storage/v1/object/public/{BUCKET}/{urllib.parse.quote(path)}"
