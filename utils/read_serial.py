import serial

# Configurazione della porta seriale
ser = serial.Serial('/dev/ttyACM0', 9600, timeout=1)  # Modifica '/dev/ttyUSB0' con la tua porta seriale
ser.flush()

def read_sensor_data():
    """Legge i dati dalla porta seriale e li elabora."""
    while True:
        if ser.in_waiting > 0:
            # Leggi una linea di dati dalla porta seriale
            line = ser.readline().decode('utf-8').strip()

            try:
                # I dati dovrebbero arrivare nel formato tempC,hum,dist
                tempC, humi, distance = line.split(",")
                
                # Converti i dati in float/int
                tempC = float(tempC)
                humi = float(humi)
                
                # Stampa i valori letti
                print(f"Temperatura: {tempC} °C, Umidità: {humi} %, Distanza: {distance} cm")
            except ValueError:
                print("Errore nella lettura o nella formattazione dei dati:", line)

if __name__ == "__main__":
    try:
        read_sensor_data()
    except KeyboardInterrupt:
        print("Programma interrotto.")
    finally:
        ser.close()
