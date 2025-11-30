"""
Activity Service
Business logic per il monitoraggio delle attività
"""

import re
import json
from datetime import datetime, timedelta, date
from typing import List, Dict, Optional, Tuple
from collections import defaultdict
import os
from client.GoogleCalendarClient import GoogleCalendarClient
from client.PostgresClient import PostgresHandler
from models.activity_models import (
    Category, Event, DailyStat, WeeklyStat, MonthlyStat,
    CREATE_TABLES_SQL
)

db_config = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_DATABASE'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD')
}

class ActivityService:
    """Service per gestire attività e statistiche"""
    
    def __init__(self, pg_client: PostgresHandler, gcal_client: GoogleCalendarClient):
        """
        Inizializza il service
        
        Args:
            pg_client: Client PostgreSQL
            gcal_client: Client Google Calendar
        """
        self.pg = pg_client
        self.gcal = gcal_client
        self.categories_cache = {}
        self._load_categories_cache()
    
    def initialize_database(self):
        """Crea le tabelle necessarie nel database"""
        print("Creazione tabelle database...")
        self.pg.execute_query(CREATE_TABLES_SQL)
        print("✓ Tabelle create")
    
    def load_categories_from_json(self, json_path: str = 'config/categories.json'):
        """
        Carica le categorie da file JSON e le inserisce nel database
        
        Args:
            json_path: Path al file JSON delle categorie
        """
        with open(json_path, 'r', encoding='utf-8') as f:
            categories_data = json.load(f)
        
        for cat_data in categories_data['categories']:
            query = """
                INSERT INTO activity_categories (code, macro_category, micro_category, color, icon)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (code) DO UPDATE SET
                    macro_category = EXCLUDED.macro_category,
                    micro_category = EXCLUDED.micro_category,
                    color = EXCLUDED.color,
                    icon = EXCLUDED.icon
            """
            self.pg.execute_query(query, (
                cat_data['code'],
                cat_data['macro_category'],
                cat_data['micro_category'],
                cat_data['color'],
                cat_data['icon']
            ))
        
        print(f"✓ Caricate {len(categories_data['categories'])} categorie")
        self._load_categories_cache()
    
    def _load_categories_cache(self):
        """Carica le categorie in cache per lookup veloci"""
        query = "SELECT * FROM activity_categories"
        results = self.pg.execute_query(query)
        
        self.categories_cache = {}
        for row in results:
            cat = Category.from_db_row(row)
            self.categories_cache[cat.code] = cat
    
    def get_all_categories(self) -> List[Category]:
        """Ritorna tutte le categorie"""
        query = "SELECT * FROM activity_categories ORDER BY macro_category, code"
        results = self.pg.execute_query(query)
        return [Category.from_db_row(row) for row in results]
    
    def get_category_by_code(self, code: str) -> Optional[Category]:
        """Ritorna una categoria per codice"""
        return self.categories_cache.get(code)
    
    def extract_category_code_from_title(self, title: str) -> Optional[str]:
        """
        Estrae il codice categoria dal titolo
        
        Args:
            title: Titolo dell'evento (es. "[L.1] Meeting progetto")
        
        Returns:
            Codice categoria (es. "L.1") o None
        """
        match = re.match(r'^\[([A-Z]+\.\d+)\]', title)
        return match.group(1) if match else None
    
    def classify_event(self, event: Event) -> Optional[int]:
        """
        Classifica un evento e ritorna l'ID della categoria
        
        Args:
            event: Evento da classificare
        
        Returns:
            ID della categoria o None se non classificato
        """
        # Metodo 1: Codice nel titolo
        code = self.extract_category_code_from_title(event.title)
        if code:
            category = self.get_category_by_code(code)
            if category:
                return category.id
        
        # Metodo 2: Pattern matching sul titolo
        # TODO: Implementare classificazione intelligente basata su keywords
        
        # Metodo 3: Basato sul calendario
        # TODO: Mappare nomi calendari a categorie
        
        return None
    
    def sync_events(self, start_date: Optional[datetime] = None, 
                   end_date: Optional[datetime] = None) -> Dict[str, int]:
        """
        Sincronizza gli eventi da Google Calendar al database
        
        Args:
            start_date: Data inizio sync (default: 30 giorni fa)
            end_date: Data fine sync (default: oggi)
        
        Returns:
            Dizionario con statistiche sync (added, updated, skipped)
        """
        if start_date is None:
            start_date = datetime.now() - timedelta(days=30)
        if end_date is None:
            end_date = datetime.now()
        
        print(f"Sincronizzazione eventi da {start_date.date()} a {end_date.date()}")
        
        # Recupera eventi da Google Calendar
        google_events = self.gcal.get_all_events_from_all_calendars(start_date, end_date)

        print(f"Trovati {len(google_events)} eventi")
        for g_event in google_events:
            print(g_event)

        stats = {'added': 0, 'updated': 0, 'skipped': 0, 'errors': 0}
        
        for g_event in google_events:
            try:
                event = Event.from_google_event(
                    g_event, 
                    g_event.get('_calendar_name', 'Unknown')
                )
                
                # Classifica l'evento
                category_id = self.classify_event(event)
                event.category_id = category_id
                
                # Verifica se esiste già
                check_query = "SELECT id FROM activity_events WHERE google_event_id = %s"
                existing = self.pg.execute_query(check_query, (event.google_event_id,))
                
                if existing:
                    # Update
                    update_query = """
                        UPDATE activity_events 
                        SET title = %s, category_id = %s, start_datetime = %s, 
                            end_datetime = %s, duration_minutes = %s, 
                            description = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE google_event_id = %s
                    """
                    self.pg.execute_query(update_query, (
                        event.title, event.category_id, event.start_datetime,
                        event.end_datetime, event.duration_minutes, event.description,
                        event.google_event_id
                    ))
                    stats['updated'] += 1
                else:
                    # Insert
                    insert_query = """
                        INSERT INTO activity_events 
                        (google_event_id, title, category_id, start_datetime, end_datetime, 
                         duration_minutes, calendar_name, is_all_day, description)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """
                    self.pg.execute_query(insert_query, (
                        event.google_event_id, event.title, event.category_id,
                        event.start_datetime, event.end_datetime, event.duration_minutes,
                        event.calendar_name, event.is_all_day, event.description
                    ))
                    stats['added'] += 1
                
            except Exception as e:
                print(f"Errore processando evento: {e}")
                stats['errors'] += 1
        
        print(f"✓ Sync completato: {stats}")
        return stats
    
    def calculate_daily_stats(self, target_date: date) -> List[DailyStat]:
        """
        Calcola le statistiche per una specifica data
        
        Args:
            target_date: Data target
        
        Returns:
            Lista di statistiche giornaliere per categoria
        """
        query = """
            SELECT 
                category_id,
                SUM(duration_minutes) as total_minutes,
                COUNT(*) as event_count
            FROM activity_events
            WHERE DATE(start_datetime) = %s 
                AND category_id IS NOT NULL
                AND is_all_day = FALSE
            GROUP BY category_id
        """
        
        results = self.pg.execute_query(query, (target_date,))
        
        # Calcola il totale per le percentuali
        total_minutes = sum(row[1] for row in results)
        
        daily_stats = []
        for row in results:
            category_id, minutes, count = row
            percentage = (minutes / total_minutes * 100) if total_minutes > 0 else 0
            
            stat = DailyStat(
                id=None,
                date=target_date,
                category_id=category_id,
                total_minutes=minutes,
                event_count=count,
                percentage=round(percentage, 2)
            )
            daily_stats.append(stat)
            
            # Salva nel database
            insert_query = """
                INSERT INTO activity_daily_stats 
                (date, category_id, total_minutes, event_count, percentage)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (date, category_id) DO UPDATE SET
                    total_minutes = EXCLUDED.total_minutes,
                    event_count = EXCLUDED.event_count,
                    percentage = EXCLUDED.percentage
            """
            self.pg.execute_query(insert_query, (
                stat.date, stat.category_id, stat.total_minutes,
                stat.event_count, stat.percentage
            ))
        
        return daily_stats
    
    def get_daily_stats(self, target_date: date) -> List[Dict]:
        """
        Recupera le statistiche giornaliere con dettagli categoria
        
        Args:
            target_date: Data target
        
        Returns:
            Lista di dizionari con statistiche e info categoria
        """
        query = """
            SELECT 
                ds.date,
                ds.category_id,
                ds.total_minutes,
                ds.event_count,
                ds.percentage,
                c.code,
                c.macro_category,
                c.micro_category,
                c.icon
            FROM activity_daily_stats ds
            JOIN activity_categories c ON ds.category_id = c.id
            WHERE ds.date = %s
            ORDER BY ds.total_minutes DESC
        """
        
        results = self.pg.execute_query(query, (target_date,))
        
        stats = []
        for row in results:
            stats.append({
                'date': row[0],
                'category_id': row[1],
                'total_minutes': row[2],
                'total_hours': round(row[2] / 60, 2),
                'event_count': row[3],
                'percentage': float(row[4]),
                'code': row[5],
                'macro_category': row[6],
                'micro_category': row[7],
                'icon': row[8]
            })
        
        return stats
    
    def get_weekly_stats(self, year: int, week: int) -> List[Dict]:
        """
        Calcola statistiche settimanali
        
        Args:
            year: Anno
            week: Numero settimana
        
        Returns:
            Lista di statistiche aggregate per categoria
        """
        query = """
            SELECT 
                c.code,
                c.macro_category,
                c.micro_category,
                c.icon,
                SUM(ds.total_minutes) as total_minutes,
                AVG(ds.total_minutes) as avg_daily_minutes,
                SUM(ds.event_count) as event_count
            FROM activity_daily_stats ds
            JOIN activity_categories c ON ds.category_id = c.id
            WHERE EXTRACT(YEAR FROM ds.date) = %s 
                AND EXTRACT(WEEK FROM ds.date) = %s
            GROUP BY c.id, c.code, c.macro_category, c.micro_category, c.icon
            ORDER BY total_minutes DESC
        """
        
        results = self.pg.execute_query(query, (year, week))
        
        stats = []
        for row in results:
            stats.append({
                'code': row[0],
                'macro_category': row[1],
                'micro_category': row[2],
                'icon': row[3],
                'total_minutes': row[4],
                'total_hours': round(row[4] / 60, 2),
                'avg_daily_minutes': round(float(row[5]), 2),
                'avg_daily_hours': round(float(row[5]) / 60, 2),
                'event_count': row[6]
            })
        
        return stats
    
    def get_monthly_stats(self, year: int, month: int) -> List[Dict]:
        """
        Calcola statistiche mensili
        
        Args:
            year: Anno
            month: Mese (1-12)
        
        Returns:
            Lista di statistiche aggregate per categoria
        """
        query = """
            SELECT 
                c.code,
                c.macro_category,
                c.micro_category,
                c.icon,
                SUM(ds.total_minutes) as total_minutes,
                AVG(ds.total_minutes) as avg_daily_minutes,
                SUM(ds.event_count) as event_count,
                COUNT(DISTINCT ds.date) as days_tracked
            FROM activity_daily_stats ds
            JOIN activity_categories c ON ds.category_id = c.id
            WHERE EXTRACT(YEAR FROM ds.date) = %s 
                AND EXTRACT(MONTH FROM ds.date) = %s
            GROUP BY c.id, c.code, c.macro_category, c.micro_category, c.icon
            ORDER BY total_minutes DESC
        """
        
        results = self.pg.execute_query(query, (year, month))
        
        stats = []
        for row in results:
            stats.append({
                'code': row[0],
                'macro_category': row[1],
                'micro_category': row[2],
                'icon': row[3],
                'total_minutes': row[4],
                'total_hours': round(row[4] / 60, 2),
                'avg_daily_minutes': round(float(row[5]), 2),
                'avg_daily_hours': round(float(row[5]) / 60, 2),
                'event_count': row[6],
                'days_tracked': row[7]
            })
        
        return stats
    
    def get_uncategorized_events(self, limit: int = 50) -> List[Dict]:
        """
        Recupera eventi non categorizzati
        
        Args:
            limit: Numero massimo di eventi
        
        Returns:
            Lista di eventi senza categoria
        """
        query = """
            SELECT 
                id, title, start_datetime, end_datetime, 
                duration_minutes, calendar_name
            FROM activity_events
            WHERE category_id IS NULL
                AND is_all_day = FALSE
            ORDER BY start_datetime DESC
            LIMIT %s
        """
        
        results = self.pg.execute_query(query, (limit,))
        
        events = []
        for row in results:
            events.append({
                'id': row[0],
                'title': row[1],
                'start_datetime': row[2].isoformat(),
                'end_datetime': row[3].isoformat(),
                'duration_minutes': row[4],
                'duration_hours': round(row[4] / 60, 2),
                'calendar_name': row[5]
            })
        
        return events

    def get_activity_service():
        """Helper per ottenere un'istanza di ActivityService"""
        pg_client = PostgresHandler(db_config=db_config)
        gcal_client = GoogleCalendarClient()
        
        # IMPORTANTE: Imposta la tua email Google
        gcal_client.set_user_email("alexandruandrei659.aa@gmail.com")
        
        return ActivityService(pg_client, gcal_client)