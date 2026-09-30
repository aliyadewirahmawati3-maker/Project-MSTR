from datetime import datetime, timezone
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.queue_summary import router as queue_summary_router

app = FastAPI(
    title="SIGAP AI Service",
    description="Layanan AI/Computer Vision untuk penghitungan kendaraan per zona antrean pada prototype SIGAP.",
    version="0.1.0-baseline"
)
app.include_router(queue_summary_router)

# Enable CORS for frontend dashboard communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TARGET_INTERSECTION = os.getenv(
    "INTERSECTION_NAME",
    "Perempatan Jl. Ibrahim Adjie - Mall Tenth Avenue, Bandung"
)

@app.get("/")
def read_root():
    return {
        "message": "SIGAP AI Service - Baseline Ready",
        "documentation": "/docs",
        "health": "/health"
    }

@app.get("/health")
def health_check():
    """
    Health check endpoint for container health probes and system readiness.
    Tidak melakukan inferensi YOLOv13. Pembacaan satu frame hanya terjadi jika
    estimator offline diaktifkan secara eksplisit pada endpoint ringkasan.
    """
    return {
        "status": "healthy",
        "service": "SIGAP AI Service (FastAPI)",
        "version": "0.1.0-baseline",
        "target_intersection": TARGET_INTERSECTION,
        "yolo_status": "STANDBY (Persiapan Tahap Berikutnya)",
        "tracking_enabled": False,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
