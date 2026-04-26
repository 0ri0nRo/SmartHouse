import json
import logging
import os
from functools import wraps

import redis
from flask import jsonify, make_response, request

logger = logging.getLogger(__name__)

_redis_client = None
_redis_disabled = False


def get_redis_client():
    global _redis_client, _redis_disabled

    if _redis_disabled:
        return None
    if _redis_client is not None:
        return _redis_client

    host = os.getenv('REDIS_HOST', 'localhost')
    port = int(os.getenv('REDIS_PORT', '6379'))
    db = int(os.getenv('REDIS_DB', '0'))

    try:
        client = redis.Redis(
            host=host,
            port=port,
            db=db,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        client.ping()
        _redis_client = client
        return _redis_client
    except Exception as exc:
        logger.warning("Redis cache disabled: %s", exc)
        _redis_disabled = True
        return None


def _cache_key() -> str:
    return f"smarthouse:cache:{request.full_path.rstrip('?')}"


def cache_json_response(ttl_seconds: int = 300):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            client = get_redis_client()
            key = _cache_key()

            if client is not None:
                cached = client.get(key)
                if cached:
                    try:
                        payload = json.loads(cached)
                        response = jsonify(payload['body'])
                        response.status_code = payload['status']
                        response.headers['X-Redis-Cache'] = 'HIT'
                        return response
                    except Exception:
                        client.delete(key)

            response = make_response(func(*args, **kwargs))
            if response.status_code == 200:
                body = response.get_json(silent=True)
                if body is not None and client is not None:
                    client.setex(
                        key,
                        ttl_seconds,
                        json.dumps({'status': response.status_code, 'body': body}),
                    )
                    response.headers['X-Redis-Cache'] = 'MISS'
            return response

        return wrapper

    return decorator


def invalidate_cached_paths(*paths: str) -> int:
    client = get_redis_client()
    if client is None:
        return 0

    deleted = 0
    for path in paths:
        prefix = f"smarthouse:cache:{path}"
        for key in client.scan_iter(match=f"{prefix}*"):
            deleted += client.delete(key)
    return deleted