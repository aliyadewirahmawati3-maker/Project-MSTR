FROM python:3.11-slim

WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    YOLO_CONFIG_DIR=/tmp/sigap-yolo \
    YOLO_AUTOINSTALL=false \
    YOLO_OFFLINE=true \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The official YOLOv13 fork is required; PyPI ultralytics is not a substitute.
# CPU-only wheels: no CUDA, flash-attention, training or export stack required.
RUN pip install --no-cache-dir torch==2.2.2+cpu torchvision==0.17.2+cpu --index-url https://download.pytorch.org/whl/cpu
COPY requirements-yolo.txt .
RUN pip install --no-cache-dir -r requirements-yolo.txt
ARG YOLOV13_COMMIT=73289949533efac82bb5f72ec19b746618656bd2
RUN pip install --no-cache-dir --no-deps https://github.com/iMoonLab/yolov13/archive/${YOLOV13_COMMIT}.zip

# Copy application code
COPY . .

EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
