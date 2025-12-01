"""
Activity Monitor - Database Models
Gestisce le tabelle per categorie, eventi e statistiche
"""

from datetime import datetime
from typing import Optional, List
from dataclasses import dataclass
from enum import Enum


class MacroCategory(str, Enum):
    """Enumerazione delle macrocategorie"""
    SLEEP = "Sonno e Riposo"
    FOOD = "Alimentazione"
    WORK = "Lavoro e Produttività"
    STUDY = "Studio e Apprendimento"
    SPORT = "Sport e Benessere Fisico"
    PERSONAL_CARE = "Cura Personale"
    HOME = "Casa e Faccende"
    TRANSPORT = "Trasporti e Spostamenti"
    SOCIAL = "Socializzazione"
    ENTERTAINMENT = "Intrattenimento e Svago"
    DEVELOPMENT = "Sviluppo Personale"
    UNCATEGORIZED = "Tempo Non Categorizzato"


@dataclass
class Category:
    """Modello per una categoria di attività"""
    id: Optional[int]
    code: str  # Es: "L.1", "SP.2"
    macro_category: str
    micro_category: str
    color: str  # Hex color
    icon: str  # Emoji
    
    @staticmethod
    def from_db_row(row: tuple):
        """Crea un oggetto Category da una riga del database"""
        return Category(
            id=row[0],
            code=row[1],
            macro_category=row[2],
            micro_category=row[3],
            color=row[4],
            icon=row[5]
        )


@dataclass
class Event:
    """Modello per un evento del calendario"""
    id: Optional[int]
    google_event_id: str
    title: str
    category_id: Optional[int]
    start_datetime: datetime
    end_datetime: datetime
    duration_minutes: int
    calendar_name: str
    is_all_day: bool
    description: Optional[str]
    created_at: datetime
    
    @property
    def category_code(self) -> Optional[str]:
        """Estrae il codice categoria dal titolo se presente"""
        import re
        match = re.match(r'\[([A-Z]+\.\d+)\]', self.title)
        return match.group(1) if match else None
    
    @staticmethod
    def from_db_row(row: tuple):
        """Crea un oggetto Event da una riga del database"""
        return Event(
            id=row[0],
            google_event_id=row[1],
            title=row[2],
            category_id=row[3],
            start_datetime=row[4],
            end_datetime=row[5],
            duration_minutes=row[6],
            calendar_name=row[7],
            is_all_day=row[8],
            description=row[9],
            created_at=row[10]
        )
    
    @staticmethod
    def from_google_event(google_event: dict, calendar_name: str):
        """Crea un oggetto Event da un evento Google Calendar"""
        start = google_event['start'].get('dateTime', google_event['start'].get('date'))
        end = google_event['end'].get('dateTime', google_event['end'].get('date'))
        is_all_day = 'date' in google_event['start']
        
        if is_all_day:
            start_dt = datetime.strptime(start, '%Y-%m-%d')
            end_dt = datetime.strptime(end, '%Y-%m-%d')
        else:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
        
        duration = int((end_dt - start_dt).total_seconds() / 60)
        
        return Event(
            id=None,
            google_event_id=google_event['id'],
            title=google_event.get('summary', 'Senza titolo'),
            category_id=None,
            start_datetime=start_dt,
            end_datetime=end_dt,
            duration_minutes=duration,
            calendar_name=calendar_name,
            is_all_day=is_all_day,
            description=google_event.get('description'),
            created_at=datetime.now()
        )


@dataclass
class DailyStat:
    """Modello per le statistiche giornaliere"""
    id: Optional[int]
    date: datetime.date
    category_id: int
    total_minutes: int
    event_count: int
    percentage: float
    
    @property
    def total_hours(self) -> float:
        """Ritorna le ore totali"""
        return round(self.total_minutes / 60, 2)
    
    @staticmethod
    def from_db_row(row: tuple):
        """Crea un oggetto DailyStat da una riga del database"""
        return DailyStat(
            id=row[0],
            date=row[1],
            category_id=row[2],
            total_minutes=row[3],
            event_count=row[4],
            percentage=row[5]
        )


@dataclass
class WeeklyStat:
    """Modello per le statistiche settimanali"""
    week_number: int
    year: int
    category_id: int
    total_minutes: int
    avg_daily_minutes: float
    event_count: int
    
    @property
    def total_hours(self) -> float:
        return round(self.total_minutes / 60, 2)
    
    @property
    def avg_daily_hours(self) -> float:
        return round(self.avg_daily_minutes / 60, 2)


@dataclass
class MonthlyStat:
    """Modello per le statistiche mensili"""
    month: int
    year: int
    category_id: int
    total_minutes: int
    avg_daily_minutes: float
    event_count: int
    days_tracked: int
    
    @property
    def total_hours(self) -> float:
        return round(self.total_minutes / 60, 2)
    
    @property
    def avg_daily_hours(self) -> float:
        return round(self.avg_daily_minutes / 60, 2)


# SQL per creare le tabelle
CREATE_TABLES_SQL = """
-- Tabella categorie
CREATE TABLE IF NOT EXISTS activity_categories (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    macro_category VARCHAR(100) NOT NULL,
    micro_category VARCHAR(200) NOT NULL,
    color VARCHAR(7) NOT NULL,
    icon VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella eventi
CREATE TABLE IF NOT EXISTS activity_events (
    id SERIAL PRIMARY KEY,
    google_event_id VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    category_id INTEGER REFERENCES activity_categories(id),
    start_datetime TIMESTAMP NOT NULL,
    end_datetime TIMESTAMP NOT NULL,
    duration_minutes INTEGER NOT NULL,
    calendar_name VARCHAR(100) NOT NULL,
    is_all_day BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella statistiche giornaliere
CREATE TABLE IF NOT EXISTS activity_daily_stats (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    category_id INTEGER REFERENCES activity_categories(id),
    total_minutes INTEGER NOT NULL,
    event_count INTEGER NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, category_id)
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_events_start_date ON activity_events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_events_category ON activity_events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_google_id ON activity_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON activity_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_category ON activity_daily_stats(category_id);
"""