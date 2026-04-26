import feedparser
from flask import Blueprint, jsonify
from utils.redis_cache import cache_json_response

news_bp = Blueprint('news', __name__)

@news_bp.route('/api/news')
@cache_json_response(ttl_seconds=600)
def get_news():
    try:
        feed = feedparser.parse('https://feeds.bbci.co.uk/news/world/rss.xml')
        items = [
            {
                'title': e.get('title', ''),
                'link':  e.get('link', '#'),
                'date':  e.get('published', ''),
            }
            for e in feed.entries[:5]
        ]
        return jsonify({'items': items, 'success': True})
    except Exception as e:
        return jsonify({'items': [], 'success': False, 'error': str(e)}), 500