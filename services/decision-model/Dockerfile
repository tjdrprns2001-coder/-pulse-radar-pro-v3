FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LAYA_HOST=0.0.0.0 LAYA_MODEL=multilingual LAYA_WARMUP=1
WORKDIR /opt/pulseradar-decision
RUN python -m pip install --no-cache-dir "laya==0.4.8"
COPY services/decision-model/laya-bridge.py ./laya-bridge.py
RUN useradd --system --create-home layauser && chown -R layauser /opt/pulseradar-decision
USER layauser
EXPOSE 8088
CMD ["python", "laya-bridge.py"]
