import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import time
import os
from client.PostgresClient import PostgresHandler

db_config = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_DATABASE'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD')
}

class EmailSender:
    def __init__(self, smtp_server, smtp_port, username, password):
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.username = username
        self.password = password

    def get_current_timestamp(self):
        """Ritorna il timestamp corrente in formato stringa."""
        return time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time()))

    def invia_email(self, to_email, subject, body):
        """Funzione generale per inviare email con un oggetto e un corpo specificati."""
        # Aggiungi il timestamp all'oggetto e al corpo dell'email, se richiesto
        timestamp = self.get_current_timestamp()
        subject_with_timestamp = subject.format(timestamp=timestamp)
        body_with_timestamp = body

        # Crea l'email
        msg = MIMEMultipart()
        msg['From'] = self.username
        msg['To'] = to_email
        msg['Subject'] = subject_with_timestamp

        # Aggiungi il corpo del messaggio
        msg.attach(MIMEText(body_with_timestamp, 'html'))

        # Invia l'email
        try:
            # Connessione al server SMTP
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()  # Abilita la crittografia TLS
            server.login(self.username, self.password)  # Effettua il login
            server.sendmail(self.username, to_email, msg.as_string())  # Invia l'email
            #print('Email inviata con successo!')
        except Exception as e:
            print(f'Errore nell\'invio dell\'email: {e}')
        finally:
            server.quit()  # Chiudi la connessione al server


db = PostgresHandler(db_config=db_config)
def invia_allarme_email(email_sender):
    """Questa funzione richiama invia_email con un messaggio di allarme predefinito."""
    to_email = os.getenv('TO_EMAIL')
    subject = 'ALLARME SCATTATO alle {timestamp}'
    devices_html = "<ul>"
    devices = db.get_devices_from_db()
    for ip_address, details in devices.items():
        devices_html += (
            f"<li><strong>IP Address:</strong> {ip_address}<br>"
            f"<strong>Hostname:</strong> {details['hostname']}<br>"
            f"<strong>Status:</strong> {details['status']}<br>"
            f"<strong>Timestamp:</strong> {details['timestamp']}</li>"
        )
    devices_html += "</ul>"
    body = (
    "<html>"
    "<body>"
    "<p>Un allarme è stato attivato nel sistema di sicurezza. Ecco i dettagli dei dispositivi connessi:</p>"
    f"{devices_html}"
    "</ul>"
    "<h3>Istruzioni da Seguire:</h3>"
    "<ol>"
    "<li><strong>Verifica il Sensore</strong>: Controlla fisicamente il sensore e assicurati che non ci siano ostacoli che possano causare falsi allarmi.</li>"
    "<li><strong>Controlla il Sistema</strong>: Accedi al sistema di monitoraggio per verificare eventuali ulteriori informazioni sull'allarme.</li>"
    "<li><strong>Sicurezza Prima di Tutto</strong>: Se l'allarme è stato attivato per una vera emergenza, segui le procedure di sicurezza e allontanati dall'area finché non sei sicuro che sia sicura.</li>"
    "<li><strong>Controllo Fisico</strong>: Chiedi alla persona più probabile di controllare fisicamente il sensore e assicurati che non ci siano ostacoli che possano causare falsi allarmi.</li>"
    "</ol>"
    "<p>Cordiali saluti,<br>"
    "Alexandru Home Assistant & Automatic Alarms</p>"
    "</body>"
    "</html>"
    )


    # Utilizza la funzione generale per inviare l'email
    email_sender.invia_email(to_email, subject, body)

# Configurazione del server SMTP e credenziali
smtp_server = os.getenv('SMTP_SERVER')
smtp_port = os.getenv('SMTP_PORT')
username = os.getenv('EMAIL_USERNAME')
password = os.getenv('EMAIL_PASSWORD')
# Creazione dell'oggetto EmailSender
email_sender = EmailSender(smtp_server, smtp_port, username, password)
