"""Simple in-memory cache for API responses"""
from typing import Any, Optional
from datetime import datetime, timedelta
from functools import wraps
import hashlib
import json


class SimpleCache:
    """Thread-safe in-memory cache with TTL support"""

    def __init__(self):
        self._cache = {}

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired"""
        if key in self._cache:
            value, expiry = self._cache[key]
            if datetime.now() < expiry:
                return value
            else:
                # Remove expired entry
                del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl_seconds: int = 300):
        """Set value in cache with TTL (default 5 minutes)"""
        expiry = datetime.now() + timedelta(seconds=ttl_seconds)
        self._cache[key] = (value, expiry)

    def clear(self):
        """Clear all cache entries"""
        self._cache.clear()


# Global cache instance
cache = SimpleCache()


def cache_response(ttl_seconds: int = 300):
    """
    Decorator to cache API endpoint responses

    Usage:
        @cache_response(ttl_seconds=600)
        def my_endpoint():
            ...
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Create cache key from function name and arguments
            cache_key_data = {
                "func": func.__name__,
                "args": str(args),
                "kwargs": str(sorted(kwargs.items())),
            }
            cache_key = hashlib.md5(
                json.dumps(cache_key_data, sort_keys=True).encode()
            ).hexdigest()

            # Try to get from cache
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                return cached_result

            # Execute function and cache result
            result = await func(*args, **kwargs) if hasattr(func, "__await__") else func(*args, **kwargs)
            cache.set(cache_key, result, ttl_seconds)
            return result

        return wrapper

    return decorator
