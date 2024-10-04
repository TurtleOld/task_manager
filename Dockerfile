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
RUN chown -R 755 1000:1000 /home/superuser
RUN pip install --upgrade pip || true
ENV PATH="/home/superuser/.local/bin:$PATH"
RUN curl -sSL https://install.python-poetry.org | python3 - && poetry --version \
&& poetry install
RUN pip install -r /home/superuser/requirements.txt

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
