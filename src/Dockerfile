FROM python:3.12-alpine

WORKDIR /app

# Create the appgroup group and the appuser user, adding appuser to the existing dialout group
RUN addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    && addgroup appuser dialout

# Install build dependencies AND OCR dependencies
RUN apk add --no-cache --virtual .build-deps \
        gcc musl-dev python3-dev linux-headers libffi-dev postgresql-dev \
    && apk add --no-cache \
        nmap \
        tesseract-ocr \
        tesseract-ocr-data-ita \
        tesseract-ocr-data-eng \
        poppler-utils \
        jpeg-dev \
        zlib-dev \
        freetype-dev \
        lcms2-dev \
        openjpeg-dev \
        tiff-dev \
        tk-dev \
        tcl-dev

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

# Copy requirements file to container
COPY requirements.txt .

# Upgrade pip and install Python dependencies
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

# Remove build dependencies to reduce image size (keep runtime deps)
RUN apk del .build-deps

# Copy application code and set ownership to appuser and appgroup
COPY --chown=appuser:appgroup . .

# Create uploads directory for receipts
RUN mkdir -p uploads && chown -R appuser:appgroup uploads

# Create uploads directory and set correct permissions
RUN mkdir -p /app/uploads && \
    chmod 755 /app/uploads && \
    chown -R 1000:1000 /app/uploads


# Switch to non-root user
USER appuser

# Expose the port your app will run on
EXPOSE 5000

# Start the application
CMD ["python", "app.py"]