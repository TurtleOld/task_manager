import json
from typing import Final

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from task_manager.users.bot import bot_admin
from telebot import types

SUCCESS_CODE: Final[int] = 200


@csrf_exempt
def webhooks(request) -> HttpResponse:
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
