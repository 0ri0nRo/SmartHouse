import time
import json
import os
import redis
from services.network_service import NetworkService

r = redis.Redis(
    host=os.getenv('REDIS_HOST', 'redis'),
    port=6379,
    decode_responses=True
)

scanner = NetworkService()

while True:
    try:
        devices = scanner.scan_network()
        r.set('network:devices', json.dumps(devices), ex=300)
        print(f"[scanner] {len(devices)} devices found")
    except Exception as e:
        print(f"[scanner] Error: {e}")
    time.sleep(30)