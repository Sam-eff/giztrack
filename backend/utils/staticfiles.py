from django.contrib.staticfiles.storage import ManifestStaticFilesStorage

try:
    from whitenoise.storage import CompressedManifestStaticFilesStorage
except ImportError:  # pragma: no cover - local environments may skip WhiteNoise
    CompressedManifestStaticFilesStorage = ManifestStaticFilesStorage


def _drop_sourcemap_patterns(patterns):
    filtered_patterns = []
    for extension, pattern_group in patterns:
        kept_patterns = []
        for pattern in pattern_group:
            pattern_source = pattern[0] if isinstance(pattern, (tuple, list)) else pattern
            if "sourceMappingURL" not in pattern_source:
                kept_patterns.append(pattern)
        if kept_patterns:
            filtered_patterns.append((extension, tuple(kept_patterns)))
    return tuple(filtered_patterns)


class TolerantCompressedManifestStaticFilesStorage(CompressedManifestStaticFilesStorage):
    """
    WhiteNoise storage that ignores sourcemap references during collectstatic.

    Some third-party admin assets include sourceMappingURL comments for map
    files they do not ship. Those maps are only useful for browser devtools, so
    missing maps should not block production deployment.
    """

    patterns = _drop_sourcemap_patterns(CompressedManifestStaticFilesStorage.patterns)
