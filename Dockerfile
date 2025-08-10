FROM python:3.13.6

ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN useradd -m superuser
USER superuser
WORKDIR /home/superuser
COPY . .
USER root
RUN chmod -R 755 /home/superuser && \
    chown -R superuser:superuser /home/superuser
USER superuser

RUN pip install --upgrade pip || true && \
    pip install uv
ENV PATH="/home/superuser/.local/bin:$PATH"

RUN uv venv
ENV PATH="/home/superuser/.venv/bin:$PATH"
RUN uv pip install -e .

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
