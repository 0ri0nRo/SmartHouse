#!/usr/bin/env python3
"""
Saves all of today's events from Google Calendar using a service account.
"""

import os
import json
from datetime import datetime, time, timedelta, timezone

from google.oauth2 import service_account
from googleapiclient.discovery import build

# ===== CONFIG =====
CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), 'gcredentials.json')
# Put the email of the calendar shared with the service account here
CALENDAR_ID = "alexandruandrei659.aa@gmail.com"

# Local time zone (CET/CEST)
LOCAL_UTC_OFFSET = 2  # +1 inverno, +2 estate

# ===== FUNZIONI =====
def get_calendar_service():
    """Create the Google Calendar client using the service account"""
    scopes = ['https://www.googleapis.com/auth/calendar.readonly']
    credentials = service_account.Credentials.from_service_account_file(
        CREDENTIALS_FILE, scopes=scopes
    )
    service = build('calendar', 'v3', credentials=credentials)
    return service

def get_today_events(service):
    """Fetch all of today's events"""
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
    print("📅 Fetching today's events from Google Calendar...")

    service = get_calendar_service()
    events = get_today_events(service)

    if not events:
        print("⚠️ No events found for today.")
        return

    print(f"✓ Found {len(events)} events today:")
    for i, event in enumerate(events, 1):
        start = event['start'].get('dateTime', event['start'].get('date'))
        end = event['end'].get('dateTime', event['end'].get('date'))
        print(f"{i}. {start} → {end} | {event.get('summary', '(nessun titolo)')}")

    # Save to JSON file
    output_file = os.path.join(os.path.dirname(__file__), f'today_events_{datetime.now().date()}.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(events, f, ensure_ascii=False, indent=4)

    print(f"\n✓ Events saved in {output_file}")

if __name__ == '__main__':
    main()
