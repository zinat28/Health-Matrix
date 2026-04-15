(function () {
  var loginForm = document.getElementById('loginForm');
  var registerForm = document.getElementById('registerForm');
  var showLoginBtn = document.getElementById('showLogin');
  var showRegisterBtn = document.getElementById('showRegister');
  var messageEl = document.getElementById('authMessage');

  function setMessage(message, isError) {
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.classList.toggle('error', Boolean(isError));
  }

  function setMode(mode) {
    var showLogin = mode === 'login';
    loginForm.classList.toggle('hidden', !showLogin);
    registerForm.classList.toggle('hidden', showLogin);
    showLoginBtn.classList.toggle('active', showLogin);
    showRegisterBtn.classList.toggle('active', !showLogin);
    setMessage('');
  }

  async function checkExistingSession() {
    if (!window.HealthApi || !window.HealthApi.getToken()) {
      return;
    }

    try {
      await window.HealthApi.auth.me();
      window.location.replace('index.html');
    } catch (_err) {
      window.HealthApi.clearSession();
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setMessage('Signing in...');

    try {
      var response = await window.HealthApi.auth.login({
        email: loginForm.email.value,
        password: loginForm.password.value
      });

      window.HealthApi.setSession(response);
      window.location.replace('index.html');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    setMessage('Creating account...');

    var password = registerForm.password.value;
    var confirmPassword = registerForm.confirmPassword.value;

    if (password !== confirmPassword) {
      setMessage('Password and confirm password must match.', true);
      return;
    }

    try {
      var response = await window.HealthApi.auth.register({
        name: registerForm.name.value,
        email: registerForm.email.value,
        password: password
      });

      window.HealthApi.setSession(response);
      window.location.replace('index.html');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  if (!loginForm || !registerForm || !showLoginBtn || !showRegisterBtn) {
    return;
  }

  showLoginBtn.addEventListener('click', function () {
    setMode('login');
  });

  showRegisterBtn.addEventListener('click', function () {
    setMode('register');
  });

  loginForm.addEventListener('submit', handleLoginSubmit);
  registerForm.addEventListener('submit', handleRegisterSubmit);

  checkExistingSession();
  setMode('login');
})();
