#include "DHT.h"
#define DHT11_PIN 2

DHT dht11(DHT11_PIN, DHT11);

void setup() {
  Serial.begin(9600);
  dht11.begin(); // inizializza il sensore
}

void loop() {
  // aspetta alcuni secondi tra le misurazioni
  delay(2000);

  // leggi l'umidità
  float humi  = dht11.readHumidity();
  // leggi la temperatura in Celsius
  float tempC = dht11.readTemperature();

  // controlla se ci sono stati errori nella lettura
  if (isnan(humi) || isnan(tempC)) {
    Serial.println("Impossibile leggere dal sensore DHT11!");
  } else {
    // Stampa solo temperatura in Celsius e umidità
    Serial.print(tempC);
    Serial.print(", ");
    Serial.print(humi);
    Serial.println();
  }
}
