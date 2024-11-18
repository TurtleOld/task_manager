from transliterate import translit
from django.utils.text import slugify


def slugify_translit(task_name):
    translite_name = translit(task_name, language_code='ru', reversed=True)
    return slugify(translite_name)
