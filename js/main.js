(function () {
  var page = document.body.getAttribute('data-page');
  var links = document.querySelectorAll('.nav-link');

  links.forEach(function (link) {
    if (link.getAttribute('data-page') === page) {
      link.classList.add('active');
    }
  });

  var dateChip = document.getElementById('todayChip');
  if (dateChip) {
    var now = new Date();
    var label = now.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    dateChip.textContent = label;
  }

  var yearEl = document.getElementById('currentYear');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  var searchInput = document.getElementById('globalSearch');
  if (searchInput) {
    searchInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') {
        return;
      }
      var query = searchInput.value.trim().toLowerCase();
      if (!query) {
        return;
      }

      var route = 'index.html';
      if (query.includes('risk') || query.includes('score')) {
        route = 'risk.html';
      } else if (query.includes('symptom') || query.includes('pain')) {
        route = 'symptoms.html';
      } else if (query.includes('patient')) {
        route = 'patient-tracker.html';
      } else if (query.includes('medicine') || query.includes('medication') || query.includes('dose') || query.includes('reminder')) {
        route = 'medication-schedule.html';
      } else if (query.includes('appointment') || query.includes('doctor') || query.includes('clinic')) {
        route = 'doctor-appointments.html';
      } else if (query.includes('diabetes') || query.includes('glucose') || query.includes('sugar')) {
        route = 'diabetes-tracker.html';
      } else if (query.includes('vital') || query.includes('bp') || query.includes('tracker')) {
        route = 'tracker.html';
      } else if (query.includes('care') || query.includes('habit') || query.includes('adherence')) {
        route = 'care-plan.html';
      } else if (query.includes('learn') || query.includes('education') || query.includes('quiz')) {
        route = 'education.html';
      }
      window.location.href = route;
    });
  }

  function decorateTopbarForUser(user) {
    var topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight || !user) return;

    var existingUserChip = document.getElementById('authUserChip');
    if (!existingUserChip) {
      existingUserChip = document.createElement('span');
      existingUserChip.id = 'authUserChip';
      existingUserChip.className = 'chip';
      topbarRight.insertBefore(existingUserChip, topbarRight.firstChild);
    }
    existingUserChip.textContent = user.name || user.email;

    var logoutBtn = document.getElementById('logoutButton');
    if (!logoutBtn) {
      logoutBtn = document.createElement('button');
      logoutBtn.id = 'logoutButton';
      logoutBtn.className = 'btn btn-soft';
      logoutBtn.type = 'button';
      logoutBtn.textContent = 'Logout';
      topbarRight.appendChild(logoutBtn);
    }

    logoutBtn.onclick = async function () {
      try {
        await window.HealthApi.auth.logout();
      } catch (_err) {
      }
      window.HealthApi.clearSession();
      window.location.replace('login.html');
    };
  }

  async function enforceAuth() {
    if (!window.HealthApi) return;

    if (page === 'login') {
      return;
    }

    if (!window.HealthApi.getToken()) {
      window.location.replace('login.html');
      return;
    }

    try {
      var session = await window.HealthApi.auth.me();
      window.HealthApi.setSession(session);
      decorateTopbarForUser(session.user);
    } catch (_err) {
      window.HealthApi.clearSession();
      window.location.replace('login.html');
    }
  }

  enforceAuth();
})();
