#!/usr/bin/env python3
"""
Initialization script for Activity Monitor
Runs the initial system setup
"""

import sys
import os
from datetime import datetime, timedelta

# Add the current directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from client.GoogleCalendarClient import GoogleCalendarClient
from client.PostgresClient import PostgresHandler
from services.activity_service import ActivityService
import os

db_config = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_DATABASE'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD')
}

def main():
    print("=" * 60)
    print("ACTIVITY MONITOR INITIALIZATION")
    print("=" * 60)
    print()
    
    # Step 1: Test PostgreSQL connection
    print("📦 Step 1: Testing database connection...")
    try:
        pg_client = PostgresHandler(db_config=db_config)
        print("✓ PostgreSQL connection OK")
    except Exception as e:
        print(f"✗ Database connection error: {e}")
        return
    
    # Step 2: Test Google Calendar connection
    print("\n📅 Step 2: Testing Google Calendar connection...")
    try:
        gcal_client = GoogleCalendarClient(credentials_path='gcredentials.json')
        
        # Ask the user for their email
        print("\n⚠️  IMPORTANT: Enter your Google email")
        user_email = input("Google email: ").strip()
        
        if user_email:
            gcal_client.set_user_email(user_email)
        
        if not gcal_client.test_connection():
            print("✗ Google Calendar connection error")
            return
            
        print("✓ Google Calendar connection OK")
    except FileNotFoundError as e:
        print(f"✗ Credentials file not found: {e}")
        print("\nTo configure Google Calendar:")
        print("1. Go to https://console.cloud.google.com")
        print("2. Create a new project or select an existing one")
        print("3. Enable the Google Calendar API")
        print("4. Create OAuth 2.0 credentials")
        print("5. Download the JSON file and rename it to 'gcredentials.json'")
        print("6. Place the file in the project directory")
        return
    except Exception as e:
        print(f"✗ Error: {e}")
        return
    
    # Step 3: Create service
    print("\n⚙️  Step 3: Initializing service...")
    try:
        service = ActivityService(pg_client, gcal_client)
        print("✓ Service created")
    except Exception as e:
        print(f"✗ Error: {e}")
        return
    
    # Step 4: Create database tables
    print("\n🗄️  Step 4: Creating database tables...")
    try:
        service.initialize_database()
        print("✓ Tables created")
    except Exception as e:
        print(f"✗ Error: {e}")
        return
    
    # Step 5: Load categories
    print("\n📂 Step 5: Loading categories...")
    try:
        categories_path = 'config/categories.json'
        if not os.path.exists(categories_path):
            print(f"✗ Categories file not found: {categories_path}")
            return
        
        service.load_categories_from_json(categories_path)
        
        # Show loaded categories
        categories = service.get_all_categories()
        print(f"✓ Loaded {len(categories)} categories")
        
        # Group by macro category
        from collections import defaultdict
        by_macro = defaultdict(list)
        for cat in categories:
            by_macro[cat.macro_category].append(cat)
        
        print("\nAvailable categories:")
        for macro, cats in by_macro.items():
            print(f"  {macro}: {len(cats)} microcategories")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        return
    
    # Step 6: Initial synchronization
    print("\n🔄 Step 6: Initial synchronization...")
    print("Do you want to sync events now? (y/n): ", end='')
    
    choice = input().strip().lower()
    
    if choice in ('y', 's'):
        print("\nHow many days of history do you want to sync?")
        print("1. Last 7 days")
        print("2. Last 30 days")
        print("3. Last 90 days")
        print("4. Custom")
        print("\nChoice (1-4): ", end='')
        
        days_choice = input().strip()
        
        if days_choice == '1':
            days = 7
        elif days_choice == '2':
            days = 30
        elif days_choice == '3':
            days = 90
        elif days_choice == '4':
            print("Number of days: ", end='')
            try:
                days = int(input().strip())
            except ValueError:
                print("Invalid value, using 30 days")
                days = 30
        else:
            days = 30
        
        start_date = datetime.now() - timedelta(days=days)
        
        print(f"\nSyncing events from {start_date.date()} to today...")
        print("This may take a few minutes...")
        
        try:
            stats = service.sync_events(start_date=start_date)
            print(f"\n✓ Sync completed!")
            print(f"  - Events added: {stats['added']}")
            print(f"  - Events updated: {stats['updated']}")
            print(f"  - Events skipped: {stats['skipped']}")
            print(f"  - Errors: {stats['errors']}")
            
            # Calculate statistics for the last 7 days
            print("\n📊 Calculating statistics...")
            today = datetime.now().date()
            for i in range(min(7, days)):
                date = today - timedelta(days=i)
                service.calculate_daily_stats(date)
            
            print("✓ Statistics calculated")
            
        except Exception as e:
            print(f"✗ Error during sync: {e}")
            import traceback
            traceback.print_exc()
    
    # Step 7: Summary
    print("\n" + "=" * 60)
    print("✓ INITIALIZATION COMPLETED!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Start the Flask server: python app.py")
    print("2. Use the [CODE] format in Google Calendar event titles")
    print("   Example: '[L.1] Backend development'")
    print("\nNote: Activity API routes have been removed from this deployment.")
    print()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by the user")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
