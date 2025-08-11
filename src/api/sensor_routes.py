from flask import Blueprint, jsonify, render_template, request
from datetime import datetime
from models.database import handle_db_error
from services.sensor_service import SensorService
from config.settings import get_config

sensor_bp = Blueprint('sensor', __name__)
config = get_config()
sensor_service = SensorService(config['DB_CONFIG'])

@sensor_bp.route('/')
def index():
    """Pagina principale con grafici dei sensori"""
    data = sensor_service.get_hourly_today()
    last_entry = sensor_service.get_latest()
    
    labels = [f"{int(entry['hour'])}:00" for entry in data] if data else []
    temperatures = [entry['avg_temperature'] for entry in data] if data else []
    labels.reverse()
    temperatures.reverse()
    
    last_temperature = last_entry.get('temperature_c', 'N/A') if last_entry else 'N/A'
    last_humidity = last_entry.get('humidity', 'N/A') if last_entry else 'N/A'
    
    return render_template('index.html', 
                         labels=labels, 
                         temperatures=temperatures, 
                         last_temperature=last_temperature, 
                         last_humidity=last_humidity)

@sensor_bp.route('/api_sensors')
@handle_db_error
def api_sensors():
    """API per ottenere dati dei sensori con statistiche"""
    data = sensor_service.get_hourly_today()
    last_entry = sensor_service.get_latest()
    
    if not data:
        return jsonify({'error': 'Nessun dato disponibile.'}), 404
    
    try:
        min_temp = min(e['avg_temperature'] for e in data)
        max_temp = max(e['avg_temperature'] for e in data)
        
        hums = [e['humidity'] for e in data if e.get('humidity') is not None]
        min_hum = min(hums) if hums else None
        max_hum = max(hums) if hums else None
        avg_hum = (sum(hums)/len(hums)) if hums else None
        
        chart_temp = [f"{e['avg_temperature']:.2f}" for e in data]
        chart_hum = [f"{(e['humidity'] or 0):.2f}" for e in data]
        
        return jsonify({
            'temperature': {
                'current': f"{float(last_entry.get('temperature_c', 0)):.2f}" if last_entry else 'N/A',
                'minMaxLast24Hours': [f"{min_temp:.2f}", f"{max_temp:.2f}"],
                'chartData': chart_temp
            },
            'humidity': {
                'current': f"{float(last_entry.get('humidity', 0)):.2f}" if last_entry else 'N/A',
                'minMaxLast24Hours': [
                    f"{min_hum:.2f}" if min_hum is not None else "N/A", 
                    f"{max_hum:.2f}" if max_hum is not None else "N/A"
                ],
                'average': f"{avg_hum:.2f}" if avg_hum is not None else "N/A",
                'chartData': chart_hum
            },
            'labels': [f"{int(entry['hour'])}:00" for entry in data]
        })
    except KeyError as e:
        return jsonify({'error': f'Chiave mancante: {e}'}), 500

@sensor_bp.route('/api/today_temperature', methods=['GET'])
@handle_db_error
def api_today_temperature():
    """API per temperatura oraria di oggi"""
    return jsonify(sensor_service.get_today_hourly_temperature())

@sensor_bp.route('/api/today_humidity', methods=['GET'])
@handle_db_error
def api_today_humidity():
    """API per umidità oraria di oggi"""
    return jsonify(sensor_service.get_today_hourly_humidity())

@sensor_bp.route('/api/monthly_temperature')
@handle_db_error
def api_monthly_temperature():
    """API per dati mensili di temperatura"""
    return jsonify(sensor_service.get_monthly_temperature_data())

@sensor_bp.route('/api/monthly_average_temperature')
@handle_db_error
def api_monthly_avg_temp_default():
    """API per temperatura media mensile (anno corrente)"""
    return jsonify(sensor_service.get_monthly_average_temperature())

@sensor_bp.route('/api/monthly_average_temperature/<int:anno>', methods=['GET'])
@handle_db_error
def api_monthly_avg_temp_by_year(anno):
    """API per temperatura media mensile per un anno specifico"""
    if anno < 1900 or anno > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400
    return jsonify(sensor_service.get_monthly_average_temperature(anno))

@sensor_bp.route('/api/daily_temperature/<int:month>/', methods=['GET'])
@handle_db_error
def api_daily_temp(month):
    """API per temperatura giornaliera di un mese"""
    if month < 1 or month > 12:
        return jsonify({'error': 'Mese non valido.'}), 400
    data = sensor_service.get_daily_for_month(month)
    if not data:
        return jsonify({'error': 'Nessun dato per il mese.'}), 404
    return jsonify(data)

@sensor_bp.route('/api/monthly_average_temperature/<int:mese>/<int:anno>', methods=['GET'])
@handle_db_error
def api_daily_temp_by_month_year(mese, anno):
    """API per temperatura giornaliera di un mese/anno specifico"""
    if mese < 1 or mese > 12:
        return jsonify({'error': 'Mese non valido.'}), 400
    if anno < 1900 or anno > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400
    data = sensor_service.get_daily_for_month(mese, anno)
    if not data:
        return jsonify({'error': 'Nessun dato.'}), 404
    return jsonify(data)

@sensor_bp.route('/api/temperature_average/<start_datetime>/<end_datetime>', methods=['GET'])
@handle_db_error
def api_temperature_average(start_datetime, end_datetime):
    """API per temperatura media in un range di date"""
    try:
        s = datetime.fromisoformat(start_datetime)
        e = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Formato data non valido. Usa ISO8601'}), 400
    
    data = sensor_service.get_average_temperatures(s, e)
    if data is None:
        return jsonify({'error': 'Errore fetching'}), 500
    return jsonify(data), 200

@sensor_bp.route('/api/humidity_average/<start_datetime>/<end_datetime>', methods=['GET'])
@handle_db_error
def api_humidity_average(start_datetime, end_datetime):
    """API per umidità media in un range di date"""
    try:
        s = datetime.fromisoformat(start_datetime)
        e = datetime.fromisoformat(end_datetime)
    except ValueError:
        return jsonify({'error': 'Formato data non valido. Usa ISO8601'}), 400
    
    data = sensor_service.get_average_humidity(s, e)
    if data is None:
        return jsonify({'error': 'Errore fetching'}), 500
    return jsonify(data), 200

@sensor_bp.route('/last_temp', methods=['GET'])
def last_temp():
    """API per ultima temperatura"""
    try:
        from client.PostgresClient import PostgresHandler
        db = PostgresHandler(config['DB_CONFIG'])
        return db.last_temp_db()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"last_temp error: {e}")
        return jsonify({'error': 'Errore'}), 500

# Pagine template
@sensor_bp.route('/temp')
def page_temp():
    """Pagina per visualizzare temperature"""
    return render_template('temperature.html')

@sensor_bp.route('/umid')
def page_umid():
    """Pagina per visualizzare umidità"""
    return render_template('umid.html')

@sensor_bp.route('/api/monthly_average_humidity/<int:mese>/<int:anno>', methods=['GET'])
@handle_db_error
def api_daily_humidity_by_month_year(mese, anno):
    """API per umidità giornaliera di un mese/anno specifico"""
    if mese < 1 or mese > 12:
        return jsonify({'error': 'Mese non valido.'}), 400
    if anno < 1900 or anno > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400
    data = sensor_service.get_daily_humidity_for_month(mese, anno)
    if not data:
        return jsonify({'error': 'Nessun dato.'}), 404
    return jsonify(data)

@sensor_bp.route('/api/monthly_average_humidity/<int:anno>', methods=['GET'])
@handle_db_error
def api_monthly_avg_humidity_by_year(anno):
    """API per umidità media mensile di un anno specifico"""
    if anno < 1900 or anno > datetime.now().year:
        return jsonify({'error': 'Anno non valido.'}), 400
    return jsonify(sensor_service.get_monthly_average_humidity(anno))
