import os
import paramiko
from io import StringIO

class SSHService:
    """Servizio per eseguire comandi SSH su dispositivi remoti"""
    
    @staticmethod
    def exec_command(private_key_str, command, passphrase=None):
        """Esegue un comando SSH usando una chiave privata"""
        key_file = StringIO(private_key_str)
        private_key = None
        
        # Prova diversi tipi di chiavi
        for key_class in [paramiko.ECDSAKey, paramiko.RSAKey, paramiko.Ed25519Key, paramiko.DSSKey]:
            try:
                key_file.seek(0)
                private_key = key_class.from_private_key(key_file, password=passphrase)
                break
            except paramiko.PasswordRequiredException:
                raise ValueError("Chiave richiede passphrase")
            except paramiko.SSHException:
                continue
        
        if private_key is None:
            raise ValueError("Chiave non supportata o corrotta")
        
        # Connessione SSH
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        HOST_PI = os.getenv('HOST_PI')
        PORT_PI = int(os.getenv('PORT_PI') or 22)
        USERNAME_PI = os.getenv('USERNAME_PI')
        
        client.connect(hostname=HOST_PI, port=PORT_PI, username=USERNAME_PI, pkey=private_key)
        
        # Esecuzione comando
        stdin, stdout, stderr = client.exec_command(command)
        out = stdout.read().decode('utf-8')
        err = stderr.read().decode('utf-8')
        
        client.close()
        
        return out if out else err