from django.forms import ModelForm
from task_manager.labels.models import Label
from django.utils.translation import gettext_lazy


class LabelForm(ModelForm[Label]):
    class Meta:
        model = Label
        fields = ('name',)
        labels = {'name': gettext_lazy('Имя')}
