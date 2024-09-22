# This docker file is used for production
# Creating image based on official python3 image
FROM python:3.11.2

ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Устанавливаем Poetry
RUN curl -sSL https://install.python-poetry.org | python3 -

# Обновляем переменные окружения для Poetry
ENV PATH="/root/.local/bin:$PATH"

# Копируем файлы проекта
COPY pyproject.toml poetry.lock /app/

# Устанавливаем зависимости с помощью Poetry
WORKDIR /app
RUN poetry install --no-root

# Копируем остальные файлы проекта
COPY . /app/

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]