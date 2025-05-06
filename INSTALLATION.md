# Установка и запуск приложения

Для установки и запуска проекта потребуется установленная Poetry  

***Poetry* устанавливается командами:**

Linux \ OSX:  
`curl -sSL https://raw.githubusercontent.com/python-poetry/poetry/master/get-poetry.py | python -`  

Подробности установки и использования пакета **Poetry** доступны в [официальной документации](https://python-poetry.org/docs/).  

## 1. Установка

**Клонирование репозитория:**  

```commandline
git clone https://github.com/TurtleOld/python-project-lvl4.git
cd python-project-lvl4
```

**Активация окружения и установка зависимостей:**
```commandline
make shell
```
---

### 1.2 Для работы с проектом потребуется задать значения переменным окружения в файле .env  
`SECRET_KEY` - можно сгенерировать командой `make secretkey` в терминале в директории проекта или придумать.  
Для работы с ***SQLite*** добавить `DB_ENGINE=SQLite`. По умолчанию это значение отсутствует.  
Для работы с ***PostgreSQL*** заполнить соответствующие поля.  
Для включения режима отладчика - необходимо переменной DEBUG присвоить значение ***1*** или ***true***  

--- 

### 1.3 Завершение установки  

```commandline
make setup
```

## 2. Запуск сервера для разработки

```
make start
```