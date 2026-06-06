"""
Receipt Service - Fix for DATABASE_CONFIG import error - IMPROVED VERSION
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
    """Service for receipt management and analysis - IMPROVED VERSION"""
    
    def __init__(self, db_config=None):
        """Initialize the service"""
        # Use RECEIPTS_DB_CONFIG from your settings.py
        if db_config is None:
            db_config = RECEIPTS_DB_CONFIG
        
        # Initialize BaseService with the database configuration
        super().__init__(db_config)
        
        self.upload_folder = UPLOAD_FOLDER
        os.makedirs(self.upload_folder, exist_ok=True)
        
        # Tesseract configuration for Italian
        self.tesseract_config = r'--oem 3 --psm 6 -l ita+eng'
        
        # Improved parsing patterns
        self.price_patterns = [
            # Specific pattern for Azzurro-style receipts (name on multiple lines + price at the end)
            r'([A-Za-z\s\u00C0-\u017F\+\-\*]{3,})\s+(\d+[,.]\d{2})\s*€?\s*$',
            # Pattern with quantity
            r'([A-Za-z\s\u00C0-\u017F]+)\s+(\d+[,.]?\d*)\s*[Xx×]\s*(\d+[,.]\d{2})\s*€?',
            # Standard pattern
            r'([A-Za-z\s\u00C0-\u017F]+)\s+(\d+[,.]\d{2})\s*€?',
            # More flexible pattern for complex names
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
            # Specific patterns for known chains
            r'(AZZURRO\s*CONVENIENZA|COOP|ESSELUNGA|CARREFOUR|CONAD|POLI|LIDL|EUROSPIN|IPER|SIMPLY|TIGOTÀ|ACQUA\s*&\s*SAPONE)',
            # Generic pattern for supermarket names
            r'^([A-Z\s]{5,25})$'
        ]

    def extract_text_from_image(self, image_path: str) -> str:
        """Extract text from an image using OCR"""
        try:
            if image_path.lower().endswith('.pdf'):
                # Convert PDF to images
                images = convert_from_path(image_path)
                text = ""
                for image in images:
                    text += pytesseract.image_to_string(image, config=self.tesseract_config)
            else:
                # Process image directly
                image = Image.open(image_path)
                text = pytesseract.image_to_string(image, config=self.tesseract_config)
            
            return text.strip()
        except Exception as e:
            logger.error(f"OCR error for {image_path}: {e}")
            return ""

    def clean_product_name(self, name: str) -> str:
        """Clean and normalize the product name"""
        # Remove special characters and leading numbers
        name = re.sub(r'^\d+\s*[\.:]?\s*', '', name)
        # Remove asterisks and special symbols
        name = re.sub(r'[\*\+]{2,}', '', name)
        # Clean up repeated spaces
        name = re.sub(r'\s{2,}', ' ', name)
        # Remove common words that are not useful
        name = re.sub(r'\s*(BACK\s*TO\s*SCHOOL|IVA|€)\s*', '', name, flags=re.IGNORECASE)
        
        return name.strip()

    def parse_multiline_products(self, lines: List[str]) -> List[Dict[str, Any]]:
        """Specific parsing for multi-line products (such as Azzurro receipts)"""
        products = []
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            # Skip empty or too-short lines
            if len(line) < 3:
                i += 1
                continue
            
            # Skip header lines, totals, etc.
            if any(keyword in line.upper() for keyword in [
                'AZZURRO', 'CONVENIENZA', 'COLLEGEN', 'DOCUMENTO', 'COMMERCIALE',
                'DESCRIZIONE', 'SUBTOTALE', 'TOTALE', 'PAGAMENTO', 'IVA', 'CARTA'
            ]):
                i += 1
                continue
            
            # Look for a price in the current line
            price_match = re.search(r'(\d+[,.]\d{2})\s*€?\s*$', line)
            
            if price_match:
                price = float(price_match.group(1).replace(',', '.'))
                
                # The product name may be on the same line or in previous lines
                product_name = re.sub(r'\s*\d+[,.]\d{2}\s*€?\s*$', '', line).strip()
                
                # If the current line name is too short, look at previous lines
                if len(product_name) < 5 and i > 0:
                    # Combine with the previous line
                    prev_line = lines[i-1].strip()
                    if len(prev_line) > 2 and not re.search(r'\d+[,.]\d{2}', prev_line):
                        product_name = prev_line + " " + product_name
                
                # Clean the product name
                product_name = self.clean_product_name(product_name)
                
                # Verify that the name is valid
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
        """Intelligent receipt text parsing - IMPROVED VERSION"""
        lines = text.split('\n')
        
        receipt_date = None
        total = None
        supermarket = "Supermercato Generico"
        
        # Look for the supermarket in the first lines
        for i, line in enumerate(lines[:15]):
            line_upper = line.strip().upper()
            for pattern in self.supermarket_patterns:
                match = re.search(pattern, line_upper)
                if match:
                    supermarket = match.group(1).strip()
                    # Replace common names
                    if 'AZZURRO' in supermarket:
                        supermarket = "Azzurro Convenienza"
                    break
            if supermarket != "Supermercato Generico":
                break
        
    # Look for the date
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
        
        # Look for the total
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
        
        # Parse products using the improved method
        products = self.parse_multiline_products(lines)
        
        # If no products are found with the multi-line method, try the standard patterns
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
        """Save the receipt to the database using the BaseService method"""
        conn = None
        cur = None
        try:
            conn = self._connect()
            cur = conn.cursor()
            
            # Find or create supermarket
            cur.execute("SELECT id FROM supermercati WHERE nome = %s", (parsed_data['supermarket'],))
            supermarket_row = cur.fetchone()
            
            if supermarket_row:
                supermarket_id = supermarket_row[0]
            else:
                cur.execute("INSERT INTO supermercati (nome) VALUES (%s) RETURNING id", (parsed_data['supermarket'],))
                supermarket_id = cur.fetchone()[0]
            
            # Insert receipt
            cur.execute("""
                INSERT INTO scontrini (supermercato_id, data_acquisto, totale, file_path)
                VALUES (%s, %s, %s, %s) RETURNING id
            """, (supermarket_id, parsed_data['date'], parsed_data['total'], file_path))
            
            receipt_id = cur.fetchone()[0]
            
            # Insert products
            for product in parsed_data['products']:
                # Find or create product
                cur.execute("SELECT id FROM prodotti WHERE nome = %s", (product['name'],))
                product_row = cur.fetchone()
                
                if product_row:
                    product_id = product_row[0]
                else:
                    cur.execute("INSERT INTO prodotti (nome) VALUES (%s) RETURNING id", (product['name'],))
                    product_id = cur.fetchone()[0]
                
                # Insert purchase
                cur.execute("""
                    INSERT INTO acquisti (scontrino_id, prodotto_id, nome_prodotto, quantita, prezzo_unitario, prezzo_totale)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (receipt_id, product_id, product['name'], product['quantity'], product['unit_price'], product['total_price']))
            
            conn.commit()
            return receipt_id
            
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Error saving receipt: {e}")
            raise
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    @handle_db_error
    def get_prezzi_minimi(self) -> List[Dict[str, Any]]:
        """Get the minimum prices per product - MAIN STATISTIC"""
        try:
            rows = self._execute_query("SELECT * FROM prezzi_minimi ORDER BY prodotto", fetch_all=True)
            return [dict(row) for row in rows] if rows else []
        except Exception as e:
            logger.error(f"Error retrieving minimum prices: {e}")
            raise

    @handle_db_error
    def get_statistiche_generali(self) -> Dict[str, Any]:
        """Get general statistics"""
        try:
            # General statistics
            general_row = self._execute_query("SELECT * FROM statistiche_generali", fetch_one=True)
            general_stats = dict(general_row) if general_row else {}
            
            # Top products
            top_products_rows = self._execute_query("SELECT * FROM top_prodotti LIMIT 10", fetch_all=True)
            top_products = [dict(row) for row in top_products_rows] if top_products_rows else []
            
            # Supermarket comparison
            supermarket_rows = self._execute_query("SELECT * FROM confronto_supermercati", fetch_all=True)
            supermarket_comparison = [dict(row) for row in supermarket_rows] if supermarket_rows else []
            
            return {
                'general': general_stats,
                'top_products': top_products,
                'supermarket_comparison': supermarket_comparison
            }
        except Exception as e:
            logger.error(f"Error retrieving statistics: {e}")
            raise

    @handle_db_error
    def get_scontrini_list(self) -> List[Dict[str, Any]]:
        """List all receipts"""
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
            logger.error(f"Error retrieving receipt list: {e}")
            raise

    def process_receipt_file(self, file) -> Dict[str, Any]:
        """Process a complete receipt file"""
        try:
            # Save file
            filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
            filepath = os.path.join(self.upload_folder, filename)
            file.save(filepath)
            
            # Extract text
            text = self.extract_text_from_image(filepath)
            if not text:
                raise Exception('Impossibile leggere il testo dall\'immagine')
            
            # Parse
            parsed_data = self.parse_receipt_text(text)
            
            # Save to the database
            receipt_id = self.save_receipt_to_db(parsed_data, filepath)
            
            return {
                'success': True,
                'message': 'Receipt processed successfully',
                'data': parsed_data,
                'receipt_id': receipt_id
            }
            
        except Exception as e:
            logger.error(f"Error processing receipt: {e}")
            raise

# Istanza globale del servizio
receipt_service = ReceiptService()