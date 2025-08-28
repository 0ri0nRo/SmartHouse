"""
Receipt Service - Fix per import error DATABASE_CONFIG - VERSIONE MIGLIORATA
"""
import os
import re
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

import pytesseract
from PIL import Image
from pdf2image import convert_from_path

from models.database import BaseService, handle_db_error
from config.settings import UPLOAD_FOLDER, RECEIPTS_DB_CONFIG

logger = logging.getLogger(__name__)

class ReceiptService(BaseService):
    """Servizio per la gestione e analisi degli scontrini - VERSIONE MIGLIORATA"""
    
    def __init__(self, db_config=None):
        """Inizializza il servizio"""
        # Usa RECEIPTS_DB_CONFIG dal tuo settings.py
        if db_config is None:
            db_config = RECEIPTS_DB_CONFIG
        
        # Inizializza BaseService con la configurazione del database
        super().__init__(db_config)
        
        self.upload_folder = UPLOAD_FOLDER
        os.makedirs(self.upload_folder, exist_ok=True)
        
        # Configurazione Tesseract per italiano
        self.tesseract_config = r'--oem 3 --psm 6 -l ita+eng'
        
        # Pattern migliorati per il parsing
        self.price_patterns = [
            # Pattern specifico per scontrini tipo Azzurro (nome su più righe + prezzo alla fine)
            r'([A-Za-z\s\u00C0-\u017F\+\-\*]{3,})\s+(\d+[,.]\d{2})\s*€?\s*$',
            # Pattern con quantità
            r'([A-Za-z\s\u00C0-\u017F]+)\s+(\d+[,.]?\d*)\s*[Xx×]\s*(\d+[,.]\d{2})\s*€?',
            # Pattern standard
            r'([A-Za-z\s\u00C0-\u017F]+)\s+(\d+[,.]\d{2})\s*€?',
            # Pattern più flessibile per nomi complessi
            r'^([A-Za-z\s\u00C0-\u017F\+\-\*]{3,})\s+(\d+[,.]\d{2})$'
        ]
        
        self.date_patterns = [
            r'(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})',
            r'(\d{2,4})[/.-](\d{1,2})[/.-](\d{1,2})'
        ]
        
        self.total_patterns = [
            r'TOTALE\s*COMPLESSIVO\s*[€]?\s*(\d+[,.]\d{2})',
            r'TOTALE\s*[€]?\s*(\d+[,.]\d{2})',
            r'TOTAL[E]?\s*[€]?\s*(\d+[,.]\d{2})',
            r'TOT\s*[€]?\s*(\d+[,.]\d{2})',
            r'Importo\s*pagato\s*[€]?\s*(\d+[,.]\d{2})'
        ]
        
        self.supermarket_patterns = [
            # Pattern specifici per catene conosciute
            r'(AZZURRO\s*CONVENIENZA|COOP|ESSELUNGA|CARREFOUR|CONAD|POLI|LIDL|EUROSPIN|IPER|SIMPLY|TIGOTÀ|ACQUA\s*&\s*SAPONE)',
            # Pattern generico per nomi di supermercati
            r'^([A-Z\s]{5,25})$'
        ]

    def extract_text_from_image(self, image_path: str) -> str:
        """Estrai testo da immagine usando OCR"""
        try:
            if image_path.lower().endswith('.pdf'):
                # Converti PDF in immagini
                images = convert_from_path(image_path)
                text = ""
                for image in images:
                    text += pytesseract.image_to_string(image, config=self.tesseract_config)
            else:
                # Elabora immagine diretta
                image = Image.open(image_path)
                text = pytesseract.image_to_string(image, config=self.tesseract_config)
            
            return text.strip()
        except Exception as e:
            logger.error(f"Errore OCR per {image_path}: {e}")
            return ""

    def clean_product_name(self, name: str) -> str:
        """Pulisce e normalizza il nome del prodotto"""
        # Rimuovi caratteri speciali e numeri iniziali
        name = re.sub(r'^\d+\s*[\.:]?\s*', '', name)
        # Rimuovi asterischi e simboli speciali
        name = re.sub(r'[\*\+]{2,}', '', name)
        # Pulisci spazi multipli
        name = re.sub(r'\s{2,}', ' ', name)
        # Rimuovi parole comuni che non servono
        name = re.sub(r'\s*(BACK\s*TO\s*SCHOOL|IVA|€)\s*', '', name, flags=re.IGNORECASE)
        
        return name.strip()

    def parse_multiline_products(self, lines: List[str]) -> List[Dict[str, Any]]:
        """Parsing specifico per prodotti su più righe (come negli scontrini Azzurro)"""
        products = []
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            # Skip righe vuote o troppo corte
            if len(line) < 3:
                i += 1
                continue
            
            # Skip righe di intestazione, totali, etc.
            if any(keyword in line.upper() for keyword in [
                'AZZURRO', 'CONVENIENZA', 'COLLEGEN', 'DOCUMENTO', 'COMMERCIALE',
                'DESCRIZIONE', 'SUBTOTALE', 'TOTALE', 'PAGAMENTO', 'IVA', 'CARTA'
            ]):
                i += 1
                continue
            
            # Cerca un prezzo nella riga corrente
            price_match = re.search(r'(\d+[,.]\d{2})\s*€?\s*$', line)
            
            if price_match:
                price = float(price_match.group(1).replace(',', '.'))
                
                # Il nome del prodotto potrebbe essere nella stessa riga o nelle righe precedenti
                product_name = re.sub(r'\s*\d+[,.]\d{2}\s*€?\s*$', '', line).strip()
                
                # Se il nome nella riga attuale è troppo corto, cerca nelle righe precedenti
                if len(product_name) < 5 and i > 0:
                    # Combina con la riga precedente
                    prev_line = lines[i-1].strip()
                    if len(prev_line) > 2 and not re.search(r'\d+[,.]\d{2}', prev_line):
                        product_name = prev_line + " " + product_name
                
                # Pulisci il nome del prodotto
                product_name = self.clean_product_name(product_name)
                
                # Verifica che il nome sia valido
                if len(product_name) >= 3 and not product_name.upper() in ['TOTALE', 'TOTAL', 'TOT', 'SUBTOTALE']:
                    products.append({
                        'name': product_name,
                        'quantity': 1.0,
                        'unit_price': price,
                        'total_price': price
                    })
            
            i += 1
        
        return products

    def parse_receipt_text(self, text: str) -> Dict[str, Any]:
        """Parsing intelligente del testo dello scontrino - VERSIONE MIGLIORATA"""
        lines = text.split('\n')
        
        receipt_date = None
        total = None
        supermarket = "Supermercato Generico"
        
        # Cerca supermercato nelle prime righe
        for i, line in enumerate(lines[:15]):
            line_upper = line.strip().upper()
            for pattern in self.supermarket_patterns:
                match = re.search(pattern, line_upper)
                if match:
                    supermarket = match.group(1).strip()
                    # Sostituisci nomi comuni
                    if 'AZZURRO' in supermarket:
                        supermarket = "Azzurro Convenienza"
                    break
            if supermarket != "Supermercato Generico":
                break
        
        # Cerca data
        for line in lines:
            for pattern in self.date_patterns:
                match = re.search(pattern, line)
                if match:
                    try:
                        day, month, year = match.groups()
                        if len(year) == 2:
                            year = '20' + year
                        receipt_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                        break
                    except:
                        continue
            if receipt_date:
                break
        
        # Cerca totale
        for line in lines:
            for pattern in self.total_patterns:
                match = re.search(pattern, line.upper())
                if match:
                    total_str = match.group(1).replace(',', '.')
                    try:
                        total = float(total_str)
                        break
                    except:
                        continue
            if total:
                break
        
        # Parsing dei prodotti usando il metodo migliorato
        products = self.parse_multiline_products(lines)
        
        # Se non trova prodotti con il metodo multiriga, prova con i pattern standard
        if not products:
            for line in lines:
                line = line.strip()
                if len(line) < 3:
                    continue
                    
                for pattern in self.price_patterns:
                    match = re.search(pattern, line)
                    if match:
                        product_name = self.clean_product_name(match.group(1))
                        
                        if len(product_name) < 3 or product_name.upper() in ['TOTALE', 'TOTAL', 'TOT', 'SUBTOTALE']:
                            continue
                        
                        try:
                            if len(match.groups()) == 3:  # Con quantità
                                quantity = float(match.group(2).replace(',', '.'))
                                unit_price = float(match.group(3).replace(',', '.'))
                                total_price = quantity * unit_price
                            else:  # Solo prezzo
                                quantity = 1.0
                                total_price = float(match.group(2).replace(',', '.'))
                                unit_price = total_price
                            
                            products.append({
                                'name': product_name,
                                'quantity': quantity,
                                'unit_price': unit_price,
                                'total_price': total_price
                            })
                        except ValueError:
                            continue
                        break
        
        return {
            'supermarket': supermarket,
            'date': receipt_date or datetime.now().strftime('%Y-%m-%d'),
            'total': total,
            'products': products
        }

    @handle_db_error
    def save_receipt_to_db(self, parsed_data: Dict[str, Any], file_path: str) -> int:
        """Salva lo scontrino nel database usando il metodo BaseService"""
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor()
            
            # Trova o crea supermercato
            cur.execute("SELECT id FROM supermercati WHERE nome = %s", (parsed_data['supermarket'],))
            supermarket_row = cur.fetchone()
            
            if supermarket_row:
                supermarket_id = supermarket_row[0]
            else:
                cur.execute("INSERT INTO supermercati (nome) VALUES (%s) RETURNING id", (parsed_data['supermarket'],))
                supermarket_id = cur.fetchone()[0]
            
            # Inserisci scontrino
            cur.execute("""
                INSERT INTO scontrini (supermercato_id, data_acquisto, totale, file_path)
                VALUES (%s, %s, %s, %s) RETURNING id
            """, (supermarket_id, parsed_data['date'], parsed_data['total'], file_path))
            
            receipt_id = cur.fetchone()[0]
            
            # Inserisci prodotti
            for product in parsed_data['products']:
                # Trova o crea prodotto
                cur.execute("SELECT id FROM prodotti WHERE nome = %s", (product['name'],))
                product_row = cur.fetchone()
                
                if product_row:
                    product_id = product_row[0]
                else:
                    cur.execute("INSERT INTO prodotti (nome) VALUES (%s) RETURNING id", (product['name'],))
                    product_id = cur.fetchone()[0]
                
                # Inserisci acquisto
                cur.execute("""
                    INSERT INTO acquisti (scontrino_id, prodotto_id, nome_prodotto, quantita, prezzo_unitario, prezzo_totale)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (receipt_id, product_id, product['name'], product['quantity'], product['unit_price'], product['total_price']))
            
            conn.commit()
            return receipt_id
            
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Errore salvataggio scontrino: {e}")
            raise
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    @handle_db_error
    def get_prezzi_minimi(self) -> List[Dict[str, Any]]:
        """Ottieni i prezzi minimi per prodotto - STATISTICA PRINCIPALE"""
        try:
            rows = self._execute_query("SELECT * FROM prezzi_minimi ORDER BY prodotto", fetch_all=True)
            return [dict(row) for row in rows] if rows else []
        except Exception as e:
            logger.error(f"Errore recupero prezzi minimi: {e}")
            raise

    @handle_db_error
    def get_statistiche_generali(self) -> Dict[str, Any]:
        """Ottieni statistiche generali"""
        try:
            # Statistiche generali
            general_row = self._execute_query("SELECT * FROM statistiche_generali", fetch_one=True)
            general_stats = dict(general_row) if general_row else {}
            
            # Top prodotti
            top_products_rows = self._execute_query("SELECT * FROM top_prodotti LIMIT 10", fetch_all=True)
            top_products = [dict(row) for row in top_products_rows] if top_products_rows else []
            
            # Confronto supermercati
            supermarket_rows = self._execute_query("SELECT * FROM confronto_supermercati", fetch_all=True)
            supermarket_comparison = [dict(row) for row in supermarket_rows] if supermarket_rows else []
            
            return {
                'general': general_stats,
                'top_products': top_products,
                'supermarket_comparison': supermarket_comparison
            }
        except Exception as e:
            logger.error(f"Errore recupero statistiche: {e}")
            raise

    @handle_db_error
    def get_scontrini_list(self) -> List[Dict[str, Any]]:
        """Lista tutti gli scontrini"""
        try:
            query = """
                SELECT s.*, sup.nome as supermercato_nome
                FROM scontrini s
                JOIN supermercati sup ON s.supermercato_id = sup.id
                ORDER BY s.data_acquisto DESC
            """
            rows = self._execute_query(query, fetch_all=True)
            return [dict(row) for row in rows] if rows else []
        except Exception as e:
            logger.error(f"Errore recupero lista scontrini: {e}")
            raise

    def process_receipt_file(self, file) -> Dict[str, Any]:
        """Processa un file scontrino completo"""
        try:
            # Salva file
            filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
            filepath = os.path.join(self.upload_folder, filename)
            file.save(filepath)
            
            # Estrai testo
            text = self.extract_text_from_image(filepath)
            if not text:
                raise Exception('Impossibile leggere il testo dall\'immagine')
            
            # Parsing
            parsed_data = self.parse_receipt_text(text)
            
            # Salva nel database
            receipt_id = self.save_receipt_to_db(parsed_data, filepath)
            
            return {
                'success': True,
                'message': 'Scontrino processato con successo',
                'data': parsed_data,
                'receipt_id': receipt_id
            }
            
        except Exception as e:
            logger.error(f"Errore processamento scontrino: {e}")
            raise

# Istanza globale del servizio
receipt_service = ReceiptService()