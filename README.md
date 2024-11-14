[![Maintainability](https://api.codeclimate.com/v1/badges/0e29a897d14dcdedfd13/maintainability)](https://codeclimate.com/github/TurtleOld/python-project-lvl4/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/0e29a897d14dcdedfd13/test_coverage)](https://codeclimate.com/github/TurtleOld/python-project-lvl4/test_coverage)

# Task manager

## О программе
Task manager - простой сервис по управлению задачами. Он позволяет ставить задачи, назначать исполнителей и менять статусы.

## Установка

### Клонирование проекта
```bash
git clone https://github.com/TurtleOld/task_manager.git
cd task_manager
make .env
```
### Заполнение .env файла.
```bash
# It must contain a URL string with the information needed to connect to the database. This URL contains information such as the database type (for example, PostgreSQL, MySQL), host, port, database name, and authentication credentials.
# Example: postgres://postgres:postgres@localhost:5432/task-manager
DATABASE_URL=
# Who will be allowed to access your site. It simply means on which address your site will be accessible. for example www.google.com is the address of google site. That does not mean who will be allowed to access the site (Is already public).
ALLOWED_HOSTS=127.0.0.1
# To generate a strong secret key, you can use the built-in Django utility: run the python -c "import secrets; print(secrets.token_urlsafe(50))"
SECRET_KEY=
# Optional: The port under which the web application will be launched
# Default: 8000
PORT=
# Is a security setting that helps protect your web application from a specific type of attack called Cross-Site Request Forgery (CSRF). A CSRF attack attempts to trick a user's browser into performing unintended actions on a website where they're already authenticated (logged in).
# Example https://example.com
CSRF_TRUSTED_ORIGINS=
# Optional: You must never enable debug in production. true 1 yes. Default: true
DEBUG=
# Optional: specify where to send alerts if you are connecting a bot
CHAT_ID=
# Optional: specify the telegram token of the bot if you are connecting the bot
TOKEN_TELEGRAM_BOT=
```

### Запуск проекта
```bash
make start
```

## Помощь проекту

_[Инструкция по установке и запуску приложения](INSTALLATION.md)_

---

## Локализация текста

Установить **gettext**.

1. Выполнить `make transprepare` &mdash; подготовка файлов ***.po** в директории **locale/en/LC_MESSAGES**.
2. Внести изменения в эти файлы.
3. Выполнить `make transcompile`.