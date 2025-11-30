"""
Activity Routes
API endpoints per il sistema di monitoraggio attività
"""

from flask import Blueprint, jsonify, request, render_template
from datetime import datetime, date, timedelta
from services.activity_service import ActivityService
from client.GoogleCalendarClient import GoogleCalendarClient
from client.PostgresClient import PostgresHandler
import traceback
import os

db_config = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_DATABASE'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD')
}

# Crea il blueprint
activity_bp = Blueprint('activity', __name__, url_prefix='/api/activity')


def get_activity_service():
    """Helper per ottenere un'istanza di ActivityService"""
    pg_client = PostgresHandler(db_config=db_config)
    gcal_client = GoogleCalendarClient()
    return ActivityService(pg_client, gcal_client)


# ==================== ROUTES HTML ====================

@activity_bp.route('/dashboard')
def dashboard():
    """Pagina dashboard principale"""
    return render_template('activities.html')


# ==================== API ENDPOINTS ====================

@activity_bp.route('/categories', methods=['GET'])
def get_categories():
    """GET /api/activity/categories - Ritorna tutte le categorie disponibili"""
    try:
        service = get_activity_service()
        categories = service.get_all_categories()
        
        result = [{
            'id': cat.id,
            'code': cat.code,
            'macro_category': cat.macro_category,
            'micro_category': cat.micro_category,
            'color': cat.color,
            'icon': cat.icon
        } for cat in categories]
        
        return jsonify({
            'success': True,
            'data': result,
            'count': len(result)
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@activity_bp.route('/sync', methods=['POST'])
def sync_events():
    try:
        # Evita crash se non c'è JSON
        data = request.get_json(silent=True) or {}
        
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d') if 'start_date' in data else None
        end_date = datetime.strptime(data['end_date'], '%Y-%m-%d') if 'end_date' in data else None
        
        service = get_activity_service()
        stats = service.sync_events(start_date, end_date)
        
        return jsonify({'success': True, 'stats': stats})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@activity_bp.route('/stats/daily', methods=['GET'])
def get_daily_stats():
    """GET /api/activity/stats/daily?date=YYYY-MM-DD - Statistiche per una data"""
    try:
        date_str = request.args.get('date')
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date() if date_str else date.today()
        
        service = get_activity_service()
        service.calculate_daily_stats(target_date)
        stats = service.get_daily_stats(target_date)
        
        total_minutes = sum(s['total_minutes'] for s in stats)
        total_hours = round(total_minutes / 60, 2)
        
        return jsonify({
            'success': True,
            'date': target_date.isoformat(),
            'total_minutes': total_minutes,
            'total_hours': total_hours,
            'stats': stats,
            'count': len(stats)
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@activity_bp.route('/stats/weekly', methods=['GET'])
def get_weekly_stats():
    """GET /api/activity/stats/weekly?year=YYYY&week=N - Statistiche settimanali"""
    try:
        year = request.args.get('year', type=int)
        week = request.args.get('week', type=int)
        
        if not year or not week:
            today = date.today()
            year = today.year
            week = today.isocalendar()[1]
        
        service = get_activity_service()
        stats = service.get_weekly_stats(year, week)
        
        total_minutes = sum(s['total_minutes'] for s in stats)
        total_hours = round(total_minutes / 60, 2)
        
        return jsonify({
            'success': True,
            'year': year,
            'week': week,
            'total_minutes': total_minutes,
            'total_hours': total_hours,
            'stats': stats,
            'count': len(stats)
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@activity_bp.route('/stats/monthly', methods=['GET'])
def get_monthly_stats():
    """GET /api/activity/stats/monthly?year=YYYY&month=N - Statistiche mensili"""
    try:
        year = request.args.get('year', type=int)
        month = request.args.get('month', type=int)
        
        if not year or not month:
            today = date.today()
            year = today.year
            month = today.month
        
        service = get_activity_service()
        stats = service.get_monthly_stats(year, month)
        
        total_minutes = sum(s['total_minutes'] for s in stats)
        total_hours = round(total_minutes / 60, 2)
        
        return jsonify({
            'success': True,
            'year': year,
            'month': month,
            'total_minutes': total_minutes,
            'total_hours': total_hours,
            'stats': stats,
            'count': len(stats)
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@activity_bp.route('/stats/range', methods=['GET'])
def get_range_stats():
    """GET /api/activity/stats/range?start=YYYY-MM-DD&end=YYYY-MM-DD - Statistiche per range di date"""
    try:
        start_str = request.args.get('start')
        end_str = request.args.get('end')
        if not start_str or not end_str:
            return jsonify({'success': False, 'error': 'start and end parameters are required'}), 400
        
        start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
        
        service = get_activity_service()
        all_stats = []
        current_date = start_date
        while current_date <= end_date:
            service.calculate_daily_stats(current_date)
            daily_stats = service.get_daily_stats(current_date)
            all_stats.extend(daily_stats)
            current_date += timedelta(days=1)
        
        from collections import defaultdict
        aggregated = defaultdict(lambda: {'total_minutes': 0, 'event_count': 0})
        for stat in all_stats:
            key = stat['code']
            aggregated[key]['code'] = stat['code']
            aggregated[key]['macro_category'] = stat['macro_category']
            aggregated[key]['micro_category'] = stat['micro_category']
            aggregated[key]['icon'] = stat['icon']
            aggregated[key]['total_minutes'] += stat['total_minutes']
            aggregated[key]['event_count'] += stat['event_count']
        
        result = []
        for data in aggregated.values():
            data['total_hours'] = round(data['total_minutes'] / 60, 2)
            result.append(data)
        
        result.sort(key=lambda x: x['total_minutes'], reverse=True)
        total_minutes = sum(s['total_minutes'] for s in result)
        total_hours = round(total_minutes / 60, 2)
        
        return jsonify({
            'success': True,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'total_minutes': total_minutes,
            'total_hours': total_hours,
            'stats': result,
            'count': len(result)
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


@activity_bp.route('/uncategorized', methods=['GET'])
def get_uncategorized():
    """GET /api/activity/uncategorized?limit=N - Eventi non categorizzati"""
    try:
        limit = request.args.get('limit', default=50, type=int)
        service = get_activity_service()
        events = service.get_uncategorized_events(limit)
        return jsonify({'success': True, 'events': events, 'count': len(events)})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


@activity_bp.route('/events', methods=['GET'])
def get_events():
    """GET /api/activity/events?start=YYYY-MM-DD&end=YYYY-MM-DD - Eventi in un range di date"""
    try:
        start_str = request.args.get('start')
        end_str = request.args.get('end')
        if not start_str or not end_str:
            return jsonify({'success': False, 'error': 'start and end parameters are required'}), 400
        
        # TODO: Implementare query reali dal DB
        return jsonify({'success': True, 'message': 'Endpoint in development', 'events': []})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


@activity_bp.route('/initialize', methods=['POST'])
def initialize_system():
    """POST /api/activity/initialize - Inizializza il sistema"""
    try:
        service = get_activity_service()
        service.initialize_database()
        service.load_categories_from_json()
        return jsonify({'success': True, 'message': 'Sistema inizializzato con successo'})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


@activity_bp.route('/health', methods=['GET'])
def health_check():
    """GET /api/activity/health - Health check del servizio"""
    try:
        service = get_activity_service()
        gcal_ok = service.gcal.test_connection()
        return jsonify({'success': True, 'status': 'healthy', 'google_calendar': 'connected' if gcal_ok else 'disconnected'})
    
    except Exception as e:
        return jsonify({'success': False, 'status': 'unhealthy', 'error': str(e)}), 500


@activity_bp.route('/save_today', methods=['POST'])
def save_today_events():
    """POST /api/activity/save_today - Salva tutti gli eventi di oggi da Google Calendar nel DB"""
    try:
        service = get_activity_service()

        # Data di oggi
        today = datetime.now().date()
        start_datetime = datetime.combine(today, datetime.min.time())
        end_datetime = datetime.combine(today, datetime.max.time())

        # Recupera eventi di oggi dal Google Calendar
        events = service.gcal.get_events(start=start_datetime, end=end_datetime)
        saved_count = 0
        for g_event in events:
            event_obj = Event.from_google_event(g_event, calendar_name=g_event.get('organizer', {}).get('email', 'Unknown'))
            saved = service.save_event(event_obj)  # Metodo che inserisce/aggiorna DB
            if saved:
                saved_count += 1

        return jsonify({
            'success': True,
            'date': today.isoformat(),
            'events_found': len(events),
            'events_saved': saved_count
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500