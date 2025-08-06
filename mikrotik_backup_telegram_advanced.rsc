# MikroTik Advanced Backup to Telegram Script
# Автор: Расширенная версия с дополнительной информацией
# Описание: Создает backup конфигурации с дополнительной системной информацией

# ========================================
# НАСТРОЙКИ TELEGRAM
# ========================================
:local botToken "YOUR_BOT_TOKEN_HERE"
:local chatId "YOUR_CHAT_ID_HERE"

# ========================================
# ОСНОВНОЙ СКРИПТ
# ========================================

# Получаем системную информацию
:local name [/system identity get name];
:local tmpdate [/system clock get date];
:local time [/system clock get time];
:local date ([:pick $tmpdate 8 10]."-".[:pick $tmpdate 5 7]."-".[:pick $tmpdate 0 4]);

# Дополнительная системная информация
:local uptime [/system resource get uptime];
:local version [/system resource get version];
:local cpuLoad [/system resource get cpu-load];
:local freeMemory [/system resource get free-memory];
:local totalMemory [/system resource get total-memory];
:local memoryUsage (100 - (($freeMemory * 100) / $totalMemory));

# Формируем имя файла
:local myname "Mikrotik";
:local fname ($myname."_".$date);
:local bname ($myname."_".$date.".backup");

# Отправляем уведомление о начале процесса
:local startMessage ("🔄 Starting backup process for ".$name."\n".
    "📅 Date: ".$date."\n".
    "⏰ Time: ".$time."\n".
    "🖥️ Version: ".$version."\n".
    "⏱️ Uptime: ".$uptime."\n".
    "💾 Memory Usage: ".[:round $memoryUsage 1]."%\n".
    "🖥️ CPU Load: ".$cpuLoad."%");

/tool fetch url=("https://api.telegram.org/bot".$botToken."/sendMessage") \
    http-method=post \
    http-data=("chat_id=".$chatId."&text=".$startMessage."&parse_mode=HTML") \
    mode=https;

:log info "Starting to create a backup";

# Создаем backup
/system backup save name=$fname;
:log info "Backup created successfully";

# Ждем завершения создания файла
:delay 5;

# Проверяем, что файл создался
:local fileExists [/file find name=$bname];
:if ([:len $fileExists] = 0) do={
    :local errorMessage ("❌ Error: Backup file not found for ".$name." at ".$date." ".$time);
    /tool fetch url=("https://api.telegram.org/bot".$botToken."/sendMessage") \
        http-method=post \
        http-data=("chat_id=".$chatId."&text=".$errorMessage."&parse_mode=HTML") \
        mode=https;
    :log error "Backup file not found";
    :error "Backup file not found";
}

# Получаем размер файла
:local fileInfo [/file print where name=$bname];
:local fileSize [:pick $fileInfo 0 [:find $fileInfo "size="]];
:local size [:pick $fileSize ([:find $fileSize "size="] + 5) [:len $fileSize]];

# Отправляем backup в Telegram
:log info "Sending backup to Telegram";
/tool fetch url=("https://api.telegram.org/bot".$botToken."/sendDocument") \
    http-method=post \
    http-data=("chat_id=".$chatId."&document=@".$fname.".backup&caption=📁 Backup ".$name." ".$date." ".$time."\n📏 Size: ".$size." bytes") \
    mode=https;

# Ждем отправки
:delay 3;

# Удаляем локальный файл backup
/file remove $bname;
:log info "Local backup file removed";

# Отправляем финальное уведомление
:local successMessage ("✅ Backup completed successfully!\n".
    "📱 Device: ".$name."\n".
    "📅 Date: ".$date."\n".
    "⏰ Time: ".$time."\n".
    "📏 File Size: ".$size." bytes\n".
    "🖥️ CPU Load: ".$cpuLoad."%\n".
    "💾 Memory Usage: ".[:round $memoryUsage 1]."%");

/tool fetch url=("https://api.telegram.org/bot".$botToken."/sendMessage") \
    http-method=post \
    http-data=("chat_id=".$chatId."&text=".$successMessage."&parse_mode=HTML") \
    mode=https;

:log info "Backup process completed successfully";