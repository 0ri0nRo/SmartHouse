import os
import paramiko
from io import StringIO

class SSHService:
    """Service to execute SSH commands on remote devices"""
    
    @staticmethod
    def exec_command(command, private_key_str=None, passphrase=None, username=None, password=None, ip=None, port=22):
        """Executes an SSH command using private key or username/password"""

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        host = ip or os.getenv('HOST_PI')
        port = int(port or os.getenv('PORT_PI') or 22)
        user = username or os.getenv('USERNAME_PI')

        if password:
            # Auth con username e password
            client.connect(hostname=host, port=port, username=user, password=password)
        elif private_key_str:
            # Auth con chiave privata
            key_file = StringIO(private_key_str)
            private_key = None
            for key_class in [paramiko.ECDSAKey, paramiko.RSAKey, paramiko.Ed25519Key, paramiko.DSSKey]:
                try:
                    key_file.seek(0)
                    private_key = key_class.from_private_key(key_file, password=passphrase)
                    break
                except paramiko.PasswordRequiredException:
                    raise ValueError("Key requires a passphrase")
                except paramiko.SSHException:
                    continue
            if private_key is None:
                raise ValueError("Unsupported or corrupted key")
            client.connect(hostname=host, port=port, username=user, pkey=private_key)
        else:
            raise ValueError("No authentication method provided (password or private key required)")

        stdin, stdout, stderr = client.exec_command(command)
        out = stdout.read().decode('utf-8')
        err = stderr.read().decode('utf-8')
        client.close()
        return out if out else err
