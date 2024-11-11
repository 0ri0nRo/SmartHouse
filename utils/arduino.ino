#include "DHT.h"

// Definizione dei pin per il sensore DHT11
#define DHT11_PIN 2
DHT dht11(DHT11_PIN, DHT11);

// Definizione dei pin per il sensore ad ultrasuoni
#define TRIG_PIN 9
#define ECHO_PIN 10

void setup() {
  // Inizializzazione della comunicazione seriale
  Serial.begin(9600);

  // Inizializzazione dei pin del sensore ad ultrasuoni
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Inizializzazione del sensore DHT11
  dht11.begin();
}

void loop() {
  // Lettura della temperatura e umidità dal sensore DHT11
  float humi = dht11.readHumidity();
  float tempC = dht11.readTemperature();

  // Controllo errori di lettura del sensore DHT11
  if (isnan(humi) || isnan(tempC)) {
    Serial.println("Impossibile leggere dal sensore DHT11!");
  } else {
    // Stampa temperatura e umidità
    Serial.print(tempC);
    Serial.print(",");
    Serial.print(humi);
    Serial.print(",");
  }

  // Misurazione della distanza con il sensore ad ultrasuoni
  long duration;
  int distance;

  // Pulisci il trigger
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(40);

  // Imposta il trigger
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(40);
  digitalWrite(TRIG_PIN, LOW);

  // Leggi l'eco
  duration = pulseIn(ECHO_PIN, HIGH);

  // Calcola la distanza
  distance = duration * 0.0344 / 2;

  // Mostra la distanza in seriale
  Serial.print(distance);
  Serial.println("");

  // Attesa di 2 secondi prima della prossima misurazione
  delay(40);
}
