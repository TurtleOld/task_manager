document.addEventListener('DOMContentLoaded', function() {
  const logoutBtn = document.querySelector('input[type="submit"].logout-btn');
  const logoutForm = logoutBtn ? logoutBtn.closest('form') : null;
  
  console.log('Logout button found:', !!logoutBtn);
  console.log('Logout form found:', !!logoutForm);
  
  if (logoutBtn && logoutForm) {
    // Обработчик для подтверждения и загрузки
    logoutBtn.addEventListener('click', function(e) {
      console.log('Logout button clicked');
      
      // Сначала показываем диалог подтверждения
      if (!confirm('Вы уверены, что хотите выйти?')) {
        console.log('Logout cancelled by user');
        e.preventDefault();
        return;
      }
      
      console.log('Logout confirmed, submitting form...');
      
      // Если пользователь подтвердил, показываем состояние загрузки
      this.classList.add('is-loading');
      this.value = 'Выход...';
      this.disabled = true;
      
      // Отправляем форму программно
      logoutForm.submit();
    });
    
    // Обработчик для клавиатурной навигации
    logoutBtn.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.click();
      }
    });
    
    // Обработчики для анимаций при наведении
    logoutBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-1px) scale(1.02)';
    });
    
    logoutBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0) scale(1)';
    });
  }
});

const style = document.createElement('style');
style.textContent = `
  .logout-btn.is-loading {
    position: relative;
    color: transparent !important;
  }
  
  .logout-btn.is-loading::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .logout-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;
document.head.appendChild(style);
