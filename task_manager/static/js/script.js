window.setTimeout(function() {
    $(".alert").fadeTo(400, 0).slideUp(400, function(){
        $(this).remove();
    });
}, 4000);

document.addEventListener('DOMContentLoaded', function () {
    const body = document.body;
    const themeSwitcher = document.getElementById('theme-switcher');

    if (body.dataset.bsTheme === 'light') {
        themeSwitcher.classList.add('btn-dark');
    } else {
        themeSwitcher.classList.remove('btn-dark');
        themeSwitcher.classList.add('btn-light');
    }

    if (themeSwitcher) {
        themeSwitcher.addEventListener('click', () => {
            const body = document.body;
            if (body.dataset.bsTheme === 'light') {
                body.dataset.bsTheme = 'dark';
                themeSwitcher.classList.remove('btn-dark');
                themeSwitcher.classList.add('btn-light');
            } else {
                body.dataset.bsTheme = 'light';
                themeSwitcher.classList.remove('btn-light');
                themeSwitcher.classList.add('btn-dark');
            }
        });
    }
});