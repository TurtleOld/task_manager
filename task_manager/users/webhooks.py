"""Webhook handlers for Telegram bot integration.

This module provides webhook endpoints for receiving and processing
Telegram bot updates and messages.
"""

import json
from typing import Final

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from telebot import types

from task_manager.users.bot import bot_admin

SUCCESS_CODE: Final[int] = 200


@csrf_exempt
def webhooks(request) -> HttpResponse:
    """Handle incoming webhook messages from Telegram server.

    Processes POST requests containing Telegram bot updates and
    forwards them to the bot admin for processing.

    Args:
        request: The HTTP request object containing the webhook data.

    Returns:
        HttpResponse: Success response indicating the webhook was processed.
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
