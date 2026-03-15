import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import time
import os
import requests
from client.PostgresClient import PostgresHandler


db_config = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_DATABASE'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD')
}

TELEGRAM_TOKEN = os.getenv('TELEGRAM_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')


class EmailSender:
    def __init__(self, smtp_server, smtp_port, username, password):
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.username = username
        self.password = password

    def get_current_timestamp(self):
        """Returns the current timestamp as a formatted string."""
        return time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time()))

    def send_email(self, to_email, subject, body):
        """General-purpose function to send an email with a given subject and body."""
        timestamp = self.get_current_timestamp()
        subject_with_timestamp = subject.format(timestamp=timestamp)

        msg = MIMEMultipart()
        msg['From'] = self.username
        msg['To'] = to_email
        msg['Subject'] = subject_with_timestamp
        msg.attach(MIMEText(body, 'html'))

        try:
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.username, self.password)
            server.sendmail(self.username, to_email, msg.as_string())
            print("[Email] Email sent successfully.")
        except Exception as e:
            print(f'[Email] Error sending email: {e}')
        finally:
            server.quit()

    # Keep Italian alias for backward compatibility with existing callers
    def invia_email(self, to_email, subject, body):
        self.send_email(to_email, subject, body)


db = PostgresHandler(db_config=db_config)


def send_alarm_email(email_sender):
    """Sends an alarm notification email with the current status of all connected devices."""
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
        "<h3>Instructions to Follow:</h3>"
        "<ol>"
        "<li><strong>Check the Sensor:</strong> Physically inspect the sensor and ensure there are no obstructions that could cause false alarms.</li>"
        "<li><strong>Check the System:</strong> Access the monitoring system to verify any additional information about the alarm.</li>"
        "<li><strong>Safety First:</strong> If the alarm was triggered by a real emergency, follow safety procedures and evacuate the area until it is safe.</li>"
        "<li><strong>Physical Check:</strong> Ask the most likely person to physically check the sensor and ensure there are no obstructions that could cause false alarms.</li>"
        "</ol>"
        "<p>Best regards,<br>"
        "Alexandru Home Assistant &amp; Automatic Alarms</p>"
        "</body>"
        "</html>"
    )

    email_sender.send_email(to_email, subject, body)


# Keep Italian alias for backward compatibility with existing callers
def invia_allarme_email(email_sender):
    send_alarm_email(email_sender)


def upload_to_telegram(backup_path):
    """Sends the backup file directly to Telegram and returns the response."""
    file_name = os.path.basename(backup_path)
    file_size_mb = os.path.getsize(backup_path) / (1024 * 1024)
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())

    caption = (
        f"🗄 *Database Backup*\n"
        f"📁 `{file_name}`\n"
        f"📦 {file_size_mb:.2f} MB\n"
        f"🕐 {timestamp}"
    )

    with open(backup_path, 'rb') as f:
        response = requests.post(
            f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendDocument',
            data={
                'chat_id': TELEGRAM_CHAT_ID,
                'caption': caption,
                'parse_mode': 'Markdown'
            },
            files={'document': (file_name, f, 'application/gzip')},
            timeout=120
        )

    if not response.ok:
        raise Exception(f"Telegram API error {response.status_code}: {response.text}")

    return response.json()


def send_backup_email(email_sender, backup_path):
    """Sends the backup to Telegram and notifies via email with success or failure details."""
    to_email = os.getenv('TO_EMAIL')
    timestamp = email_sender.get_current_timestamp()
    file_name = os.path.basename(backup_path)
    file_size_mb = os.path.getsize(backup_path) / (1024 * 1024)

    telegram_ok = False
    telegram_error = None

    # --- Telegram upload ---
    try:
        print(f"[Backup] Sending {backup_path} to Telegram...")
        upload_to_telegram(backup_path)
        telegram_ok = True
        print("[Backup] Telegram upload complete.")
    except Exception as e:
        telegram_error = str(e)
        print(f"[Backup] Telegram upload failed: {e}")

    # --- Email notification ---
    if telegram_ok:
        subject = f"✅ Backup Successful - {timestamp}"
        body = f"""
        <html><body style='font-family: Arial, sans-serif; color: #333;'>
            <h2 style='color: #10b981;'>&#10003; Backup Completed Successfully</h2>
            <p>Dear Alex,</p>
            <p>The database backup has been completed and sent to Telegram.</p>
            <table style='border-collapse: collapse; margin: 1em 0; width: 100%;'>
                <tr style='background:#f5f5f5;'>
                    <td style='padding: 8px 12px; font-weight: bold; width: 140px;'>File:</td>
                    <td style='padding: 8px 12px;'>{file_name}</td>
                </tr>
                <tr>
                    <td style='padding: 8px 12px; font-weight: bold;'>Size:</td>
                    <td style='padding: 8px 12px;'>{file_size_mb:.2f} MB</td>
                </tr>
                <tr style='background:#f5f5f5;'>
                    <td style='padding: 8px 12px; font-weight: bold;'>Timestamp:</td>
                    <td style='padding: 8px 12px;'>{timestamp}</td>
                </tr>
                <tr>
                    <td style='padding: 8px 12px; font-weight: bold;'>Delivery:</td>
                    <td style='padding: 8px 12px;'>&#128236; Sent to Telegram</td>
                </tr>
            </table>
            <p>Kind regards,<br>Alexandru Home Assistant &amp; Automated Alarms</p>
        </body></html>
        """
    else:
        subject = f"❌ Backup Failed - {timestamp}"
        body = f"""
        <html><body style='font-family: Arial, sans-serif; color: #333;'>
            <h2 style='color: #ef4444;'>&#10007; Backup Failed</h2>
            <p>Dear Alex,</p>
            <p>The database backup process encountered an error.</p>
            <table style='border-collapse: collapse; margin: 1em 0; width: 100%;'>
                <tr style='background:#f5f5f5;'>
                    <td style='padding: 8px 12px; font-weight: bold; width: 140px;'>File:</td>
                    <td style='padding: 8px 12px;'>{file_name}</td>
                </tr>
                <tr>
                    <td style='padding: 8px 12px; font-weight: bold;'>Size:</td>
                    <td style='padding: 8px 12px;'>{file_size_mb:.2f} MB</td>
                </tr>
                <tr style='background:#f5f5f5;'>
                    <td style='padding: 8px 12px; font-weight: bold;'>Timestamp:</td>
                    <td style='padding: 8px 12px;'>{timestamp}</td>
                </tr>
                <tr>
                    <td style='padding: 8px 12px; font-weight: bold;'>Local Path:</td>
                    <td style='padding: 8px 12px;'><code>{backup_path}</code></td>
                </tr>
                <tr style='background:#fff0f0;'>
                    <td style='padding: 8px 12px; font-weight: bold; color: #ef4444;'>Error:</td>
                    <td style='padding: 8px 12px; color: #ef4444;'>{telegram_error}</td>
                </tr>
            </table>
            <p>Kind regards,<br>Alexandru Home Assistant &amp; Automated Alarms</p>
        </body></html>
        """

    email_sender.send_email(to_email, subject, body)


# Keep Italian alias for backward compatibility with existing callers
def invia_backup_email(email_sender, backup_path):
    send_backup_email(email_sender, backup_path)


smtp_server = os.getenv('SMTP_SERVER')
smtp_port = os.getenv('SMTP_PORT')
username = os.getenv('EMAIL_USERNAME')
password = os.getenv('EMAIL_PASSWORD')
email_sender = EmailSender(smtp_server, smtp_port, username, password)