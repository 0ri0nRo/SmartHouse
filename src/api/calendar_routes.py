"""
Google Calendar Routes
Provides today's events and next 7 days events via REST endpoints.
Supports multiple OAuth credential files.
"""

from flask import Blueprint, jsonify
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from datetime import datetime, timezone, timedelta
import os
import pickle
import logging

logger = logging.getLogger(__name__)

calendar_bp = Blueprint('calendar', __name__)

SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

# =========================
# Paths
# =========================
BASE_DIR = '/app'

CREDENTIALS_FILE_OLD = os.path.join(BASE_DIR, 'gcredentials.json')
CREDENTIALS_FILE_NEW = os.path.join(BASE_DIR, 'gcredentials_new.json')

TOKEN_FILE = os.path.join(BASE_DIR, 'uploads', 'gcalendar_token.pickle')

def get_active_credentials():
    """
    Choose which credentials file to use.
    Priority: NEW -> OLD
    """
    if os.path.exists(CREDENTIALS_FILE_NEW):
        return CREDENTIALS_FILE_NEW
    return CREDENTIALS_FILE_OLD


def get_calendar_service():
    """
    Returns authenticated Google Calendar service.
    Handles token refresh and first-time login.
    """
    creds = None

    # Load existing token
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, 'rb') as f:
            creds = pickle.load(f)

    # Validate credentials
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            logger.info("Google Calendar token refreshed")
        else:
            credentials_file = get_active_credentials()

            if not os.path.exists(credentials_file):
                raise FileNotFoundError(f"Missing credentials file: {credentials_file}")

            flow = InstalledAppFlow.from_client_secrets_file(
                credentials_file,
                SCOPES
            )

            try:
                creds = flow.run_local_server(port=0)
            except Exception:
                print("\nNo browser available. Open this URL manually:\n")
                creds = flow.run_local_server(
                    port=0,
                    authorization_prompt_message="Please visit this URL: {url}",
                    success_message="Authorization complete. You can close this window.",
                    open_browser=False
                )

        # Save token
        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        with open(TOKEN_FILE, 'wb') as f:
            pickle.dump(creds, f)

    return build('calendar', 'v3', credentials=creds)


def _parse_event(event):
    """Convert Google event to clean dict."""
    start = event.get('start', {})
    end = event.get('end', {})

    all_day = 'date' in start and 'dateTime' not in start

    return {
        'id': event.get('id', ''),
        'title': event.get('summary', '(No title)'),
        'description': event.get('description', ''),
        'location': event.get('location', ''),
        'start': start.get('dateTime', start.get('date', '')),
        'end': end.get('dateTime', end.get('date', '')),
        'all_day': all_day,
        'color_id': event.get('colorId', None),
        'html_link': event.get('htmlLink', ''),
    }


# =========================
# TODAY
# =========================
@calendar_bp.route('/api/calendar/today', methods=['GET'])
def get_today_events():
    try:
        service = get_calendar_service()

        now = datetime.now(timezone.utc)
        start_of_day = datetime(now.year, now.month, now.day, 0, 0, tzinfo=timezone.utc)
        end_of_day = start_of_day + timedelta(days=1)

        result = service.events().list(
            calendarId='primary',
            timeMin=start_of_day.isoformat(),
            timeMax=end_of_day.isoformat(),
            singleEvents=True,
            orderBy='startTime',
            maxResults=20,
        ).execute()

        events = [_parse_event(e) for e in result.get('items', [])]

        return jsonify({
            'events': events,
            'count': len(events),
            'date': start_of_day.date().isoformat(),
        })

    except Exception as e:
        logger.error(f"Calendar today error: {e}")
        return jsonify({'error': str(e)}), 500


# =========================
# WEEK
# =========================
@calendar_bp.route('/api/calendar/week', methods=['GET'])
def get_week_events():
    try:
        service = get_calendar_service()

        now = datetime.now(timezone.utc)
        start_of_day = datetime(now.year, now.month, now.day, 0, 0, tzinfo=timezone.utc)
        end_of_week = start_of_day + timedelta(days=7)

        result = service.events().list(
            calendarId='primary',
            timeMin=start_of_day.isoformat(),
            timeMax=end_of_week.isoformat(),
            singleEvents=True,
            orderBy='startTime',
            maxResults=50,
        ).execute()

        days = {}

        for e in result.get('items', []):
            ev = _parse_event(e)
            day_key = ev['start'][:10]
            days.setdefault(day_key, []).append(ev)

        return jsonify({
            'days': days,
            'total': sum(len(v) for v in days.values()),
        })

    except Exception as e:
        logger.error(f"Calendar week error: {e}")
        return jsonify({'error': str(e)}), 500

REDIRECT_URI = 'https://smarthouse.local:4443/api/calendar/auth/callback'

@calendar_bp.route('/api/calendar/auth/start', methods=['GET'])
def auth_start():
    credentials_file = get_active_credentials()
    if not os.path.exists(credentials_file):
        return jsonify({'error': f'Missing {credentials_file}'}), 500

    flow = InstalledAppFlow.from_client_secrets_file(
        credentials_file,
        SCOPES,
        redirect_uri=REDIRECT_URI
    )
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        prompt='consent'
    )
    return jsonify({'auth_url': auth_url})


@calendar_bp.route('/api/calendar/auth/callback', methods=['GET'])
def auth_callback():
    """Google redirects here with ?code=... after user consent."""
    code = flask_request.args.get('code', '').strip()
    error = flask_request.args.get('error', '')

    if error:
        return redirect(f'/#/calendar/auth?error={error}')
    if not code:
        return redirect('/#/calendar/auth?error=missing_code')

    try:
        credentials_file = get_active_credentials()
        flow = InstalledAppFlow.from_client_secrets_file(
            credentials_file,
            SCOPES,
            redirect_uri=REDIRECT_URI
        )
        flow.fetch_token(code=code)
        creds = flow.credentials

        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        with open(TOKEN_FILE, 'wb') as f:
            pickle.dump(creds, f)
        logger.info("Google Calendar token saved via OAuth callback")

        return redirect('/#/calendar/auth?success=1')

    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return redirect(f'/#/calendar/auth?error={str(e)}')