const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Неверный email или пароль.',
  'Email not confirmed': 'Email не подтверждён. Обратитесь к администратору.',
  'Database error querying schema': 'Ошибка учётной записи. Обратитесь к администратору.',
};

export function formatAuthError(error: { message?: string; status?: number; name?: string } | null | undefined): string {
  if (!error) return 'Не удалось выполнить вход. Попробуйте снова.';

  const msg = error.message?.trim();
  if (!msg || msg === '{}' || msg === '[object Object]') {
    if (error.status === 500 || error.name === 'AuthRetryableFetchError') {
      return 'Ошибка сервера авторизации. Обратитесь к администратору.';
    }
    return 'Неверный email или пароль.';
  }

  return AUTH_ERROR_MESSAGES[msg] ?? msg;
}
