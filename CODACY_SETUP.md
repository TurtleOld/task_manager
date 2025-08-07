# Настройка Codacy для Django проекта

## Обзор

Этот документ описывает настройку Codacy для автоматического анализа качества кода в Django проекте Task Manager.

## Созданные файлы конфигурации

### 1. `.codacy.yml` - Основная конфигурация Codacy
- Настройки исключений для Django проекта
- Конфигурация инструментов анализа (pylint, eslint, stylelint)
- Правила качества кода и безопасности
- Метрики качества

### 2. `.pylintrc` - Конфигурация Pylint для Python
- Настройки для Django проекта
- Игнорирование стандартных Django файлов
- Правила именования и стиля кода

### 3. `.eslintrc.json` - Конфигурация ESLint для JavaScript
- Настройки для браузерного JavaScript
- Поддержка Django шаблонов
- Глобальные переменные (htmx, jQuery, Alpine.js)

### 4. `.stylelintrc.json` - Конфигурация Stylelint для CSS
- Стандартные правила CSS
- Игнорирование vendor prefixes
- Поддержка современных CSS возможностей

## Интеграция с GitHub

### 1. Подключение к Codacy
1. Зайдите на [codacy.com](https://codacy.com)
2. Создайте аккаунт или войдите через GitHub
3. Добавьте ваш репозиторий `task_manager`

### 2. Настройка вебхуков
Codacy автоматически создаст вебхуки для анализа при каждом push.

### 3. Настройка статусных чеков
В настройках репозитория на GitHub:
1. Перейдите в Settings → Branches
2. Добавьте правило для защиты ветки `main`
3. Включите проверку "Codacy Code Review"

## Локальная настройка

### Установка инструментов (опционально)

```bash
# Python инструменты
pip install pylint
pip install coverage

# JavaScript инструменты
npm install -g eslint
npm install -g stylelint

# Или через Poetry
poetry add --dev pylint coverage
```

### Локальный анализ

```bash
# Python анализ
pylint task_manager/

# JavaScript анализ
eslint task_manager/static/js/

# CSS анализ
stylelint task_manager/static/css/

# Покрытие тестами
coverage run --source='.' manage.py test
coverage report
```

## Настройки качества кода

### Метрики
- **Максимальная сложность функции**: 10
- **Максимальная длина функции**: 50 строк
- **Максимальная длина строки**: 120 символов
- **Минимальное покрытие тестами**: 70%

### Исключения
- Миграции Django (`**/migrations/**`)
- Статические файлы (`**/staticfiles/**`)
- Виртуальные окружения (`**/venv/**`, `**/env/**`)
- Кэш Python (`**/__pycache__/**`)

## Мониторинг качества

### Дашборд Codacy
- Общая оценка качества кода
- Метрики покрытия тестами
- Количество проблем и их типы
- Тренды качества кода

### Уведомления
- Email уведомления о новых проблемах
- Интеграция с Slack/Teams
- Уведомления в GitHub Issues

## Рекомендации

### 1. Регулярный анализ
- Проверяйте отчеты Codacy после каждого merge
- Исправляйте проблемы высокой и средней важности
- Следите за трендами качества кода

### 2. Настройка команды
- Назначьте ответственных за качество кода
- Установите правила для code review
- Используйте Codacy в процессе разработки

### 3. Интеграция с CI/CD
```yaml
# GitHub Actions пример
- name: Codacy Static Code Analysis
  uses: codacy/codacy-analysis-cli-action@master
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Полезные ссылки

- [Codacy Documentation](https://docs.codacy.com/)
- [Pylint Documentation](https://pylint.pycqa.org/)
- [ESLint Documentation](https://eslint.org/)
- [Stylelint Documentation](https://stylelint.io/)

## Поддержка

При возникновении проблем с настройкой Codacy:
1. Проверьте логи в Codacy Dashboard
2. Убедитесь, что все конфигурационные файлы корректны
3. Проверьте права доступа к репозиторию
4. Обратитесь в поддержку Codacy при необходимости
