import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Configura i dettagli dell'email
smtp_server = 'smtp.gmail.com'
smtp_port = 587
username = 'alex.andrei.smart.house@gmail.com'
password = 'ahap goab hhsi ltrj'

# Configura il contenuto dell'email
to_email = 'alexandruandrei659.aa@gmail.com'
subject = 'Oggetto dell\'email'
body = 'Ciao Amore'

# Crea un oggetto MIMEMultipart per l'email
msg = MIMEMultipart()
msg['From'] = username
msg['To'] = to_email
msg['Subject'] = subject

# Aggiungi il corpo del messaggio all'oggetto MIMEMultipart
msg.attach(MIMEText(body, 'plain'))

# Invia l'email
try:
    # Crea una connessione al server SMTP
    server = smtplib.SMTP(smtp_server, smtp_port)
    server.starttls()  # Abilita la crittografia TLS
    server.login(username, password)  # Effettua il login
    server.sendmail(username, to_email, msg.as_string())  # Invia l'email
    print('Email inviata con successo!')
except Exception as e:
    print(f'Errore: {e}')
finally:
    server.quit()  # Chiudi la connessione al server
