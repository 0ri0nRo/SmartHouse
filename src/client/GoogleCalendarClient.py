#!/usr/bin/env python3
"""
Google Calendar Client - Service Account Version
Recupera e salva gli eventi di oggi in un file JSON.
"""

import os
import json
from datetime import datetime, time, timedelta, timezone
from typing import List, Dict, Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from config.settings import get_config

config = get_config()
# ===== CONFIG =====
CREDENTIALS_FILE = config['CREDENTIALS_PATH']
# Email del calendario condiviso con il service account
CALENDAR_ID = "alexandruandrei659.aa@gmail.com"
# Fuso orario locale (CET/CEST)
LOCAL_UTC_OFFSET = 2  # +1 inverno, +2 estate

class GoogleCalendarClient:
    """Client per interagire con Google Calendar usando Service Account"""
    
    SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']
    
    def __init__(self, credentials_file: str = CREDENTIALS_FILE, calendar_id: str = CALENDAR_ID):
        self.credentials_file = credentials_file
        self.calendar_id = calendar_id
        self.service = self._authenticate()
    
    def _authenticate(self):
        if not os.path.exists(self.credentials_file):
            raise FileNotFoundError(f"Credentials file not found: {self.credentials_file}")
        credentials = service_account.Credentials.from_service_account_file(
            self.credentials_file, scopes=self.SCOPES
        )
        return build('calendar', 'v3', credentials=credentials)
    
    def get_today_events(self) -> List[Dict]:
        """Recupera tutti gli eventi di oggi dal calendario"""
        today = datetime.now()
        tz_offset = timedelta(hours=LOCAL_UTC_OFFSET)
        start_of_day = datetime.combine(today, time.min).astimezone(timezone(tz_offset))
        end_of_day = datetime.combine(today, time.max).astimezone(timezone(tz_offset))

        try:
            events_result = self.service.events().list(
                calendarId=self.calendar_id,
                timeMin=start_of_day.isoformat(),
                timeMax=end_of_day.isoformat(),
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            events = events_result.get('items', [])
            return events
        except HttpError as e:
            print(f"Errore nel recupero eventi: {e}")
            return []

    def save_events_to_json(self, events: List[Dict], filename: Optional[str] = None):
        """Salva gli eventi in un file JSON"""
        if filename is None:
            filename = os.path.join(os.path.dirname(__file__), f'today_events_{datetime.now().date()}.json')
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(events, f, ensure_ascii=False, indent=4)
        print(f"\n✓ Eventi salvati in {filename}")

    def get_all_events_from_all_calendars(self, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[Dict]:
        """Recupera tutti gli eventi dal calendario specificato in un intervallo di date"""
        if start_date is None:
            start_date = datetime.now() - timedelta(days=30)
        if end_date is None:
            end_date = datetime.now()
        
        try:
            events_result = self.service.events().list(
                calendarId=self.calendar_id,
                timeMin=start_date.isoformat() + 'Z',
                timeMax=end_date.isoformat() + 'Z',
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            events = events_result.get('items', [])
            # Aggiungi info calendario
            for event in events:
                event['_calendar_id'] = self.calendar_id
            return events
        except HttpError as e:
            print(f"Errore nel recupero eventi: {e}")
            return []



# ===== SCRIPT STANDALONE =====
def main():
    print("📅 Recupero eventi di oggi dal Google Calendar...")
    client = GoogleCalendarClient()
    events = client.get_today_events()

    if not events:
        print("⚠️ Nessun evento trovato per oggi.")
        return

    print(f"✓ Trovati {len(events)} eventi oggi:")
    for i, event in enumerate(events, 1):
        start = event['start'].get('dateTime', event['start'].get('date'))
        end = event['end'].get('dateTime', event['end'].get('date'))
        print(f"{i}. {start} → {end} | {event.get('summary', '(nessun titolo)')}")

    client.save_events_to_json(events)


if __name__ == '__main__':
    main()
