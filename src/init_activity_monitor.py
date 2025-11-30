#!/usr/bin/env python3
"""
Script di inizializzazione per Activity Monitor
Esegue il setup iniziale del sistema
"""

import sys
import os
from datetime import datetime, timedelta

# Aggiungi la directory corrente al path
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
    print("INIZIALIZZAZIONE ACTIVITY MONITOR")
    print("=" * 60)
    print()
    
    # Step 1: Test connessione PostgreSQL
    print("📦 Step 1: Test connessione database...")
    try:
        pg_client = PostgresHandler(db_config=db_config)
        print("✓ Connessione PostgreSQL OK")
    except Exception as e:
        print(f"✗ Errore connessione database: {e}")
        return
    
    # Step 2: Test connessione Google Calendar
    print("\n📅 Step 2: Test connessione Google Calendar...")
    try:
        gcal_client = GoogleCalendarClient(credentials_path='gcredentials.json')
        
        # Chiedi l'email all'utente
        print("\n⚠️  IMPORTANTE: Inserisci la tua email Google")
        user_email = input("Email Google: ").strip()
        
        if user_email:
            gcal_client.set_user_email(user_email)
        
        if not gcal_client.test_connection():
            print("✗ Errore connessione Google Calendar")
            return
            
        print("✓ Connessione Google Calendar OK")
    except FileNotFoundError as e:
        print(f"✗ File credentials non trovato: {e}")
        print("\nPer configurare Google Calendar:")
        print("1. Vai su https://console.cloud.google.com")
        print("2. Crea un nuovo progetto o seleziona uno esistente")
        print("3. Abilita Google Calendar API")
        print("4. Crea credenziali OAuth 2.0")
        print("5. Scarica il file JSON e rinominalo in 'gcredentials.json'")
        print("6. Metti il file nella directory del progetto")
        return
    except Exception as e:
        print(f"✗ Errore: {e}")
        return
    
    # Step 3: Crea service
    print("\n⚙️  Step 3: Inizializzazione service...")
    try:
        service = ActivityService(pg_client, gcal_client)
        print("✓ Service creato")
    except Exception as e:
        print(f"✗ Errore: {e}")
        return
    
    # Step 4: Crea tabelle database
    print("\n🗄️  Step 4: Creazione tabelle database...")
    try:
        service.initialize_database()
        print("✓ Tabelle create")
    except Exception as e:
        print(f"✗ Errore: {e}")
        return
    
    # Step 5: Carica categorie
    print("\n📂 Step 5: Caricamento categorie...")
    try:
        categories_path = 'config/categories.json'
        if not os.path.exists(categories_path):
            print(f"✗ File categorie non trovato: {categories_path}")
            return
        
        service.load_categories_from_json(categories_path)
        
        # Mostra categorie caricate
        categories = service.get_all_categories()
        print(f"✓ Caricate {len(categories)} categorie")
        
        # Raggruppa per macro
        from collections import defaultdict
        by_macro = defaultdict(list)
        for cat in categories:
            by_macro[cat.macro_category].append(cat)
        
        print("\nCategorie disponibili:")
        for macro, cats in by_macro.items():
            print(f"  {macro}: {len(cats)} microcategorie")
        
    except Exception as e:
        print(f"✗ Errore: {e}")
        return
    
    # Step 6: Sincronizzazione iniziale
    print("\n🔄 Step 6: Sincronizzazione iniziale...")
    print("Vuoi sincronizzare gli eventi adesso? (s/n): ", end='')
    
    choice = input().strip().lower()
    
    if choice == 's':
        print("\nQuanti giorni di storico vuoi sincronizzare?")
        print("1. Ultimi 7 giorni")
        print("2. Ultimi 30 giorni")
        print("3. Ultimi 90 giorni")
        print("4. Personalizzato")
        print("\nScelta (1-4): ", end='')
        
        days_choice = input().strip()
        
        if days_choice == '1':
            days = 7
        elif days_choice == '2':
            days = 30
        elif days_choice == '3':
            days = 90
        elif days_choice == '4':
            print("Numero di giorni: ", end='')
            try:
                days = int(input().strip())
            except ValueError:
                print("Valore non valido, uso 30 giorni")
                days = 30
        else:
            days = 30
        
        start_date = datetime.now() - timedelta(days=days)
        
        print(f"\nSincronizzazione eventi da {start_date.date()} a oggi...")
        print("Questo potrebbe richiedere alcuni minuti...")
        
        try:
            stats = service.sync_events(start_date=start_date)
            print(f"\n✓ Sincronizzazione completata!")
            print(f"  - Eventi aggiunti: {stats['added']}")
            print(f"  - Eventi aggiornati: {stats['updated']}")
            print(f"  - Eventi saltati: {stats['skipped']}")
            print(f"  - Errori: {stats['errors']}")
            
            # Calcola statistiche per gli ultimi 7 giorni
            print("\n�� Calcolo statistiche...")
            today = datetime.now().date()
            for i in range(min(7, days)):
                date = today - timedelta(days=i)
                service.calculate_daily_stats(date)
            
            print("✓ Statistiche calcolate")
            
        except Exception as e:
            print(f"✗ Errore durante sincronizzazione: {e}")
            import traceback
            traceback.print_exc()
    
    # Step 7: Riepilogo
    print("\n" + "=" * 60)
    print("✓ INIZIALIZZAZIONE COMPLETATA!")
    print("=" * 60)
    print("\nProssimi passi:")
    print("1. Avvia il server Flask: python app.py")
    print("2. Apri il browser: http://localhost:5000/api/activity/dashboard")
    print("3. Usa il formato [CODICE] nel titolo degli eventi Google Calendar")
    print("   Esempio: '[L.1] Sviluppo backend'")
    print("\nEndpoint API disponibili:")
    print("  - GET  /api/activity/categories")
    print("  - POST /api/activity/sync")
    print("  - GET  /api/activity/stats/daily?date=YYYY-MM-DD")
    print("  - GET  /api/activity/stats/weekly?year=YYYY&week=N")
    print("  - GET  /api/activity/stats/monthly?year=YYYY&month=M")
    print("  - GET  /api/activity/uncategorized")
    print()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperazione annullata dall'utente")
    except Exception as e:
        print(f"\n✗ Errore imprevisto: {e}")
        import traceback
        traceback.print_exc()
