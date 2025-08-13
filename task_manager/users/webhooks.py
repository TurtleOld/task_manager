import json
from typing import Final

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from telebot import types

from task_manager.users.bot import bot_admin

SUCCESS_CODE: Final[int] = 200


@csrf_exempt
def webhooks(request) -> HttpResponse:
    """
    Функция принятия сообщений от телеграм сервера (бота).

    :param request:
    :return: HttpResponse
    """
    if request.method == 'POST':
        json_data = json.loads(request.body)
        update = types.Update.de_json(json_data)
        bot_admin.process_new_updates([update])
        return HttpResponse(
            'Webhook processed successfully',
            status=SUCCESS_CODE,
        )

    return HttpResponse(
        'Webhook processed successfully',
        status=SUCCESS_CODE,
    )
