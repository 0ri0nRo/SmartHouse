import psycopg2
import psycopg2.extras
from datetime import datetime
from scraper import TrainScraper

class TrainService:
    """Servizio per gestire i dati dei treni"""
    
    def __init__(self, db_config):
        self.db_config = db_config

    def fetch_and_save(self, train_destination):
        """Recupera e salva i dati dei treni per una destinazione"""
        url = "https://iechub.rfi.it/ArriviPartenze/ArrivalsDepartures/Monitor?placeId=2416&arrivals=False"
        scraper = TrainScraper(url, self.db_config)
        trains = scraper.parse_trains(train_destination)
        scraper.save_trains_to_db(trains)
        
        # Return train data from DB
        return self._get_trains_from_db(train_destination)
    
    def _get_trains_from_db(self, train_destination):
        """Ottiene i dati dei treni dal database"""
        conn = None
        cur = None
        try:
            conn = psycopg2.connect(**self.db_config)
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            now = datetime.now()
            
            # Query per treni passati
            query_old = """
                SELECT train_number, destination, time, delay, platform, stops, timestamp
                FROM trains
                WHERE time < %s AND stops ILIKE %s
                ORDER BY time DESC LIMIT %s;
            """
            cur.execute(query_old, (now.time(), f'%{train_destination}%', 4))
            results_old = cur.fetchall()
            
            # Query per treni futuri
            query_future = """
                SELECT train_number, destination, time, delay, platform, stops, timestamp
                FROM trains
                WHERE time > %s AND stops ILIKE %s
                ORDER BY time ASC LIMIT %s;
            """
            cur.execute(query_future, (now.time(), f'%{train_destination}%', 4))
            results = cur.fetchall()
            
            def serialize_row(row):
                return {
                    "train_number": row[0],
                    "destination": row[1],
                    "time": row[2].strftime('%H:%M'),
                    "delay": row[3],
                    "platform": row[4],
                    "stops": row[5],
                    "timestamp": row[6].isoformat()
                }
            
            return {
                "result": [serialize_row(r) for r in results],
                "result_old": [serialize_row(r) for r in results_old]
            }
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()