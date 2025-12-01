#!/usr/bin/env python3
"""
Salva tutti gli eventi di oggi dal Google Calendar usando un service account.
"""

import os
import json
from datetime import datetime, time, timedelta, timezone

from google.oauth2 import service_account
from googleapiclient.discovery import build

# ===== CONFIG =====
CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), 'gcredentials.json')
# Metti qui l'email del tuo calendario condiviso con il service account
CALENDAR_ID = "alexandruandrei659.aa@gmail.com"

# Fuso orario locale (CET/CEST)
LOCAL_UTC_OFFSET = 2  # +1 inverno, +2 estate

# ===== FUNZIONI =====
def get_calendar_service():
    """Crea il client Google Calendar usando il service account"""
    scopes = ['https://www.googleapis.com/auth/calendar.readonly']
    credentials = service_account.Credentials.from_service_account_file(
        CREDENTIALS_FILE, scopes=scopes
    )
    service = build('calendar', 'v3', credentials=credentials)
    return service

def get_today_events(service):
    """Recupera tutti gli eventi di oggi"""
    today = datetime.now()
    tz_offset = timedelta(hours=LOCAL_UTC_OFFSET)
    start_of_day = datetime.combine(today, time.min).astimezone(timezone(tz_offset))
    end_of_day = datetime.combine(today, time.max).astimezone(timezone(tz_offset))

    start_iso = start_of_day.isoformat()
    end_iso = end_of_day.isoformat()

    events_result = service.events().list(
        calendarId=CALENDAR_ID,
        timeMin=start_iso,
        timeMax=end_iso,
        singleEvents=True,
        orderBy='startTime'
    ).execute()

    events = events_result.get('items', [])
    return events

def main():
    print("📅 Recupero eventi di oggi dal Google Calendar...")

    service = get_calendar_service()
    events = get_today_events(service)

    if not events:
        print("⚠️ Nessun evento trovato per oggi.")
        return

    print(f"✓ Trovati {len(events)} eventi oggi:")
    for i, event in enumerate(events, 1):
        start = event['start'].get('dateTime', event['start'].get('date'))
        end = event['end'].get('dateTime', event['end'].get('date'))
        print(f"{i}. {start} → {end} | {event.get('summary', '(nessun titolo)')}")

    # Salva su file JSON
    output_file = os.path.join(os.path.dirname(__file__), f'today_events_{datetime.now().date()}.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(events, f, ensure_ascii=False, indent=4)

    print(f"\n✓ Eventi salvati in {output_file}")

if __name__ == '__main__':
    main()
