import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import psycopg2

class SecurityManager:
    def __init__(self, db_config, email_config):
        self.db_config = db_config
        self.email_config = email_config
        self.last_distance = None

    def get_alarm_status(self):
        """Recupera l'ultimo stato dell'allarme dal database."""
        try:
            connection = psycopg2.connect(**self.db_config)
            cursor = connection.cursor()
            query = "SELECT status FROM alarms_status ORDER BY timestamp DESC LIMIT 1;"
            cursor.execute(query)
            result = cursor.fetchone()
            cursor.close()
            connection.close()
            return result[0] if result else False
        except Exception as e:
            print(f"Errore durante il recupero dello stato dell'allarme: {e}")
            return False

    def send_email_notification(self, distance):
        """Invia una notifica email in caso di brusco cambiamento di distanza."""
        try:
            message = MIMEMultipart()
            message['From'] = self.email_config['sender']
            message['To'] = self.email_config['recipient']
            message['Subject'] = 'Allarme di Sicurezza: Brusco cambiamento di distanza rilevato'

            body = f"Attenzione! È stato rilevato un brusco cambiamento di distanza: {distance} cm."
            message.attach(MIMEText(body, 'plain'))

            with smtplib.SMTP(self.email_config['smtp_server'], self.email_config['smtp_port']) as server:
                server.starttls()
                server.login(self.email_config['sender'], self.email_config['password'])
                server.sendmail(self.email_config['sender'], self.email_config['recipient'], message.as_string())
            print("Email di notifica inviata correttamente.")
        except Exception as e:
            print(f"Errore nell'invio dell'email: {e}")

    def monitor_distance(self, current_distance):
        """Monitora la distanza e invia una notifica se c'è un brusco cambiamento e l'allarme è attivo."""
        alarm_status = self.get_alarm_status()

        if alarm_status and self.last_distance is not None:
            threshold = 10.0  # Cambiamento brusco in centimetri
            if abs(current_distance - self.last_distance) > threshold:
                self.send_email_notification(current_distance)

        self.last_distance = current_distance


