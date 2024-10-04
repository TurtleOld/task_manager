# This docker file is used for production
# Creating image based on official python3 image
FROM python:3.11.2

ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN useradd -m superuser
USER superuser
WORKDIR /home/superuser
COPY ../ .
RUN pip install --upgrade pip || true
RUN pip install poetry \
&& poetry config virtualenvs.create false \
&& poetry install

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
