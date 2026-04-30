import re
import uuid
from pathlib import PurePosixPath

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible
from django.utils.text import get_valid_filename


@deconstructible
class CloudinaryMediaStorage(Storage):
    """
    Store user-uploaded media in Cloudinary using Django's storage API.

    Existing ImageField upload_to paths are preserved as Cloudinary folders, so
    products, repairs, and shop logos keep their current organization.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            import cloudinary
            import cloudinary.uploader
            import cloudinary.utils
        except ImportError as exc:
            raise ImproperlyConfigured(
                "Install the cloudinary package to use CloudinaryMediaStorage."
            ) from exc

        self.cloudinary = cloudinary
        self.uploader = cloudinary.uploader
        self.cloudinary_url = cloudinary.utils.cloudinary_url
        self.folder = self._clean_folder(getattr(settings, "CLOUDINARY_FOLDER", "giztrack"))
        self.timeout = getattr(settings, "CLOUDINARY_TIMEOUT_SECONDS", 20)
        self._configure_cloudinary()

    def _configure_cloudinary(self):
        config = {"secure": True}
        if getattr(settings, "CLOUDINARY_CLOUD_NAME", ""):
            config["cloud_name"] = settings.CLOUDINARY_CLOUD_NAME
        if getattr(settings, "CLOUDINARY_API_KEY", ""):
            config["api_key"] = settings.CLOUDINARY_API_KEY
        if getattr(settings, "CLOUDINARY_API_SECRET", ""):
            config["api_secret"] = settings.CLOUDINARY_API_SECRET

        self.cloudinary.config(**config)
        current_config = self.cloudinary.config()
        if not current_config.cloud_name:
            raise ImproperlyConfigured(
                "Cloudinary is enabled but CLOUDINARY_CLOUD_NAME or CLOUDINARY_URL is missing."
            )

    def _save(self, name, content):
        public_id = self._build_public_id(name)
        if hasattr(content, "open"):
            content.open()

        self.uploader.upload(
            content,
            public_id=public_id,
            resource_type="image",
            overwrite=False,
            timeout=self.timeout,
        )
        return public_id

    def delete(self, name):
        public_id = self._normalize_public_id(name)
        if public_id:
            self.uploader.destroy(public_id, resource_type="image", invalidate=True)

    def exists(self, name):
        return False

    def url(self, name):
        public_id = self._normalize_public_id(name)
        url, _options = self.cloudinary_url(public_id, resource_type="image", secure=True)
        return url

    def _build_public_id(self, name):
        path = PurePosixPath(str(name).replace("\\", "/"))
        folder_parts = [self._slugify(part) for part in path.parts[:-1] if part not in ("", ".")]
        stem = self._slugify(path.stem) or "upload"
        unique_name = f"{stem}-{uuid.uuid4().hex[:12]}"
        parts = [part for part in [self.folder, *folder_parts, unique_name] if part]
        return "/".join(parts)

    def _normalize_public_id(self, name):
        value = str(name or "").strip()
        if not value:
            return ""
        if value.startswith("http://") or value.startswith("https://"):
            path = PurePosixPath(value.split("/upload/", 1)[-1].split("?", 1)[0])
            return path.with_suffix("").as_posix()
        return PurePosixPath(value.replace("\\", "/")).with_suffix("").as_posix()

    def _clean_folder(self, folder):
        return "/".join(self._slugify(part) for part in str(folder).split("/") if part)

    def _slugify(self, value):
        value = get_valid_filename(str(value)).strip("._-")
        return re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-_").lower()
