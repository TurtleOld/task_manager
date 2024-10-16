[![Maintainability](https://api.codeclimate.com/v1/badges/0e29a897d14dcdedfd13/maintainability)](https://codeclimate.com/github/TurtleOld/python-project-lvl4/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/0e29a897d14dcdedfd13/test_coverage)](https://codeclimate.com/github/TurtleOld/python-project-lvl4/test_coverage)

# Task manager
Task manager - система управления задачами, подобная http://www.redmine.org/. Она позволяет ставить задачи, назначать исполнителей и менять их статусы. Для работы с системой требуется регистрация и аутентификация.  

## Установка

_[Инструкция по установке и запуску приложения](INSTALLATION.md)_

---

## Локализация текста

Установить **gettext**.

1. Выполнить `make transprepare` &mdash; подготовка файлов ***.po** в директории **locale/en/LC_MESSAGES**.
2. Внести изменения в эти файлы.
3. Выполнить `make transcompile`.