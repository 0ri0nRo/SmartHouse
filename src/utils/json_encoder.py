"""
Custom JSON encoder for handling special data types
"""

import json
from decimal import Decimal
from datetime import datetime


class CustomJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle Decimal and datetime objects"""
    
    def default(self, obj):
        """Convert special objects to JSON serializable format"""
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super(CustomJSONEncoder, self).default(obj)