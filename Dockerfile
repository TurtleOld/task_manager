# This docker file is used for production
# Creating image based on official python3 image
FROM python:3.13.6

ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN useradd -m superuser
USER superuser
WORKDIR /home/superuser
COPY . .
USER root
RUN chmod -R 755 /home/superuser
RUN chown -R superuser:superuser /home/superuser
USER superuser

# Install uv
RUN pip install --upgrade pip || true
ENV PATH="/home/superuser/.local/bin:$PATH"
RUN pip install uv

# Install dependencies using uv
RUN uv pip install -e .

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
