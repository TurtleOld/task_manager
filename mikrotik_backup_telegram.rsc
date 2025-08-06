# MikroTik Backup to Telegram Script
# Автор: Переделан для отправки в Telegram
# Описание: Создает backup конфигурации и отправляет его в Telegram

# ========================================
# НАСТРОЙКИ TELEGRAM
# ========================================
# Замените на свои значения:
:local botToken "YOUR_BOT_TOKEN_HERE"
:local chatId "YOUR_CHAT_ID_HERE"

# ========================================
# ОСНОВНОЙ СКРИПТ
# ========================================

# Получаем имя устройства
:local name [/system identity get name];

# Получаем текущую дату и время
:local tmpdate [/system clock get date];
:local time [/system clock get time];
:local date ([:pick $tmpdate 8 10]."-".[:pick $tmpdate 5 7]."-".[:pick $tmpdate 0 4]);

# Формируем имя файла
:local myname "Mikrotik";
:local fname ($myname."_".$date);
:local bname ($myname."_".$date.".backup");

# Логируем начало процесса
:log info "Starting to create a backup";

# Создаем backup
/system backup save name=$fname;
:log info "Backup created successfully";

# Ждем 5 секунд для завершения создания файла
:delay 5;

# Отправляем backup в Telegram
:log info "Sending backup to Telegram";
/tool fetch url=("https://api.telegram.org/bot".$botToken."/sendDocument") \
    http-method=post \
    http-data=("chat_id=".$chatId."&document=@".$fname.".backup&caption=Backup ".$name." ".$date." ".$time) \
    mode=https;

# Ждем отправки
:delay 3;

# Удаляем локальный файл backup
/file remove $bname;
:log info "Local backup file removed";

# Отправляем уведомление об успешном завершении
/tool fetch url=("https://api.telegram.org/bot".$botToken."/sendMessage") \
    http-method=post \
    http-data=("chat_id=".$chatId."&text=✅ Backup completed successfully for ".$name." at ".$date." ".$time."&parse_mode=HTML") \
    mode=https;

:log info "Backup process completed successfully";