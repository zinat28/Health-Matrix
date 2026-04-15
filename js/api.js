(function () {
  var TOKEN_KEY = 'healthpulse_auth_token';
  var USER_KEY = 'healthpulse_auth_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function getUser() {
    var raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }

  function setSession(payload) {
    if (!payload) return;
    if (payload.token) {
      localStorage.setItem(TOKEN_KEY, String(payload.token));
    }
    if (payload.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(path, options) {
    var opts = options || {};
    var headers = Object.assign({}, opts.headers || {});
    var hasBody = opts.body !== undefined && opts.body !== null;
    var body = opts.body;

    if (hasBody && typeof body !== 'string' && !(body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(body);
    }

    var token = getToken();
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    var response = await fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: body
    });

    var payload = null;
    var contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    }

    if (!response.ok) {
      if (response.status === 401) {
        clearSession();
      }
      throw new Error((payload && payload.error) || 'Request failed.');
    }

    return payload;
  }

  window.HealthApi = {
    getToken: getToken,
    getUser: getUser,
    setSession: setSession,
    clearSession: clearSession,
    auth: {
      register: function (data) {
        return request('/api/auth/register', { method: 'POST', body: data });
      },
      login: function (data) {
        return request('/api/auth/login', { method: 'POST', body: data });
      },
      me: function () {
        return request('/api/auth/me');
      },
      logout: function () {
        return request('/api/auth/logout', { method: 'POST' });
      }
    },
    vitals: {
      list: function () {
        return request('/api/vitals').then(function (data) {
          return (data && data.vitals) || [];
        });
      },
      add: function (entry) {
        return request('/api/vitals', { method: 'POST', body: entry });
      },
      clear: function () {
        return request('/api/vitals', { method: 'DELETE' });
      }
    },
    risk: {
      save: function (result) {
        return request('/api/risk', { method: 'POST', body: result });
      },
      getLatest: function () {
        return request('/api/risk/latest');
      }
    },
    symptoms: {
      list: function () {
        return request('/api/symptoms');
      },
      add: function (entry) {
        return request('/api/symptoms', { method: 'POST', body: entry });
      },
      clear: function () {
        return request('/api/symptoms', { method: 'DELETE' });
      }
    },
    care: {
      listMedications: function () {
        return request('/api/care/medications');
      },
      addMedication: function (data) {
        return request('/api/care/medications', { method: 'POST', body: data });
      },
      toggleMedication: function (id) {
        return request('/api/care/medications/' + id + '/toggle', { method: 'PATCH' });
      },
      deleteMedication: function (id) {
        return request('/api/care/medications/' + id, { method: 'DELETE' });
      },
      listAppointments: function () {
        return request('/api/care/appointments');
      },
      addAppointment: function (data) {
        return request('/api/care/appointments', { method: 'POST', body: data });
      },
      deleteAppointment: function (id) {
        return request('/api/care/appointments/' + id, { method: 'DELETE' });
      },
      listPatients: function () {
        return request('/api/care/patients');
      },
      addPatient: function (data) {
        return request('/api/care/patients', { method: 'POST', body: data });
      },
      deletePatient: function (id) {
        return request('/api/care/patients/' + id, { method: 'DELETE' });
      },
      listDiabetes: function () {
        return request('/api/care/diabetes');
      },
      addDiabetes: function (data) {
        return request('/api/care/diabetes', { method: 'POST', body: data });
      },
      deleteDiabetes: function (id) {
        return request('/api/care/diabetes/' + id, { method: 'DELETE' });
      },
      getHabits: function (dateKey) {
        return request('/api/care/habits/' + dateKey);
      },
      setHabits: function (dateKey, values) {
        return request('/api/care/habits/' + dateKey, {
          method: 'PUT',
          body: { values: values }
        });
      }
    }
  };
})();
