import json
from decimal import Decimal
from datetime import datetime

class CustomJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder che gestisce Decimal e datetime"""
    
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)