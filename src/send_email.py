import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import time
import os
from client.PostgresClient import PostgresHandler
from email.mime.base import MIMEBase
from email import encoders  


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
    subject = 'Alarm Triggered! at {timestamp}'
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
    "<body style='font-family: Arial, sans-serif; color: #333;'>"
    "<h2 style='color: #d9534f;'>Alarm Triggered!</h2>"
    "<p>An alarm has been triggered in the security system. Here are the details of the connected devices:</p>"
    f"{devices_html}"
    "</ul>"
    "<h3>Instructions to Follow:</h3>"
    "<ol>"
    "<li><strong>Check the Sensor:</strong> Physically inspect the sensor and ensure there are no obstructions that could cause false alarms.</li>"
    "<li><strong>Check the System:</strong> Access the monitoring system to verify any additional information about the alarm.</li>"
    "<li><strong>Safety First:</strong> If the alarm was triggered by a real emergency, follow safety procedures and evacuate the area until it is safe.</li>"
    "<li><strong>Physical Check:</strong> Ask the most likely person to physically check the sensor and ensure there are no obstructions that could cause false alarms.</li>"
    "</ol>"
    "<p>Best regards,<br>"
    "Alexandru Home Assistant & Automatic Alarms</p>"
    "</body>"
    "</html>"
    )


    # Utilizza la funzione generale per inviare l'email
    email_sender.invia_email(to_email, subject, body)


def invia_backup_email(email_sender):
    """Invia un'email con tutti i file di backup `.sql`."""
    to_email = os.getenv('TO_EMAIL')
    subject = f'Backup Database - {email_sender.get_current_timestamp()}'
    body = """
        <html><body>
            <p>Dear Alex,</p>
            <p>Please find attached the latest database backups for your reference.</p>
            <p>If you encounter any issues or have questions, feel free to reach out.</p>
            <p>Kind regards,<br>
            Alexandru Home Assistant & Automated Alarms</p>
        </body></html>
    """
    backup_folder = '/backup'
    
    # Cerca tutti i file .sql nella cartella di backup
    backup_files = [f for f in os.listdir(backup_folder) if f.endswith('.sql')]
    if not backup_files:
        print('No file .sql find.')
        return

    # Crea l'email
    msg = MIMEMultipart()
    msg['From'] = email_sender.username
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'html'))

    # Aggiunge ogni file .sql come allegato
    for backup_file in backup_files:
        backup_path = os.path.join(backup_folder, backup_file)
        try:
            with open(backup_path, 'rb') as file:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(file.read())
                encoders.encode_base64(part)
                part.add_header('Content-Disposition', f'attachment; filename={backup_file}')
                msg.attach(part)
        except Exception as e:
            print(f'Error on file to attach {backup_file}: {e}')
            continue

    # Invia l'email
    try:
        server = smtplib.SMTP(email_sender.smtp_server, email_sender.smtp_port)
        server.starttls()
        server.login(email_sender.username, email_sender.password)
        server.sendmail(email_sender.username, to_email, msg.as_string())
        print('Email send!')
    except Exception as e:
        print(f'Errore on sending email: {e}')
    finally:
        server.quit()


smtp_server = os.getenv('SMTP_SERVER')
smtp_port = os.getenv('SMTP_PORT')
username = os.getenv('EMAIL_USERNAME')
password = os.getenv('EMAIL_PASSWORD')
email_sender = EmailSender(smtp_server, smtp_port, username, password)