import feedparser
from flask import Blueprint, jsonify

news_bp = Blueprint('news', __name__)

@news_bp.route('/api/news')
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