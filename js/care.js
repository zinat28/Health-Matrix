(function () {
  var medForm = document.getElementById('medForm');
  var medList = document.getElementById('medList');
  var appForm = document.getElementById('appointmentForm');
  var appList = document.getElementById('appointmentList');
  var patientForm = document.getElementById('patientForm');
  var patientList = document.getElementById('patientList');
  var diabetesForm = document.getElementById('diabetesForm');
  var diabetesList = document.getElementById('diabetesList');
  var diabetesPatientSelect = document.getElementById('diabetesPatient');
  var diabetesTimestampInput = document.getElementById('diabetesTimestamp');
  var diabetesAvg = document.getElementById('diabetesAvg');
  var diabetesLatest = document.getElementById('diabetesLatest');
  var diabetesRange = document.getElementById('diabetesRange');

  var reminderBtn = document.getElementById('simulateReminder');
  var reminderOutput = document.getElementById('nextReminder');
  var habitProgress = document.getElementById('habitProgress');
  var habitText = document.getElementById('habitProgressText');
  var habitChecks = document.querySelectorAll('input[data-habit]');

  var medications = [];
  var appointments = [];
  var patients = [];
  var diabetesLogs = [];
  var todayHabits = {};

  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function toNum(value, fallback) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return parsed;
  }

  function toLocalInputValue(date) {
    var dt = date instanceof Date ? date : new Date();
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function formatDateTime(value) {
    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value || '-';
    }
    return parsed.toLocaleString();
  }

  function getGlucoseStatus(glucose) {
    if (glucose < 70) {
      return 'Low';
    }
    if (glucose <= 180) {
      return 'In range';
    }
    return 'High';
  }

  function patientLabelById(id) {
    if (!id) return 'Unassigned';
    var row = patients.find(function (entry) {
      return String(entry.id) === String(id);
    });
    return row ? row.name : 'Unknown patient';
  }

  function renderMeds() {
    if (!medList) return;
    medList.innerHTML = '';

    if (!medications.length) {
      medList.innerHTML = "<div class='notice'>No medications added yet.</div>";
      return;
    }

    var todayKey = getTodayKey();
    medications.forEach(function (med) {
      var taken = med.takenDate === todayKey;
      var item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML =
        '<div><strong>' +
        med.name +
        ' (' +
        med.dosage +
        ")</strong><br><span class='legend'>" +
        med.time +
        ' | ' +
        med.frequency +
        '</span></div>' +
        "<div><button class='btn btn-soft' data-action='toggle-med' data-id='" +
        med.id +
        "'>" +
        (taken ? 'Taken' : 'Mark Taken') +
        "</button> <button class='btn btn-soft' data-action='delete-med' data-id='" +
        med.id +
        "'>Delete</button></div>";
      medList.appendChild(item);
    });
  }

  function renderAppointments() {
    if (!appList) return;
    appList.innerHTML = '';

    if (!appointments.length) {
      appList.innerHTML = "<div class='notice'>No appointments planned.</div>";
      return;
    }

    appointments.forEach(function (app) {
      var specialty = app.specialty ? ' | ' + app.specialty : '';
      var item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML =
        '<div><strong>' +
        app.title +
        "</strong><br><span class='legend'>" +
        app.doctor +
        specialty +
        ' | ' +
        formatDateTime(app.date) +
        ' | ' +
        app.type +
        '</span></div>' +
        "<div><button class='btn btn-soft' data-action='delete-app' data-id='" +
        app.id +
        "'>Delete</button></div>";
      appList.appendChild(item);
    });
  }

  function updatePatientSelect() {
    if (!diabetesPatientSelect) return;

    var current = diabetesPatientSelect.value;
    diabetesPatientSelect.innerHTML = '<option value="">Unassigned</option>';

    patients.forEach(function (patient) {
      var option = document.createElement('option');
      option.value = String(patient.id);
      option.textContent = patient.name;
      diabetesPatientSelect.appendChild(option);
    });

    if (current && patients.some(function (p) { return String(p.id) === current; })) {
      diabetesPatientSelect.value = current;
    }
  }

  function renderPatients() {
    if (!patientList) return;
    patientList.innerHTML = '';

    if (!patients.length) {
      patientList.innerHTML = "<div class='notice'>No patients added yet.</div>";
      updatePatientSelect();
      return;
    }

    patients.forEach(function (patient) {
      var ageText = patient.age === null || patient.age === undefined ? 'Age N/A' : 'Age ' + patient.age;
      var conditionText = patient.condition ? patient.condition : 'Condition not set';
      var notesText = patient.notes ? patient.notes : 'No notes';

      var item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML =
        '<div><strong>' +
        patient.name +
        "</strong><div class='legend meta-line'>" +
        ageText +
        ' | ' +
        conditionText +
        "</div><div class='legend meta-line'>" +
        notesText +
        '</div></div>' +
        "<div><button class='btn btn-soft' data-action='delete-patient' data-id='" +
        patient.id +
        "'>Delete</button></div>";
      patientList.appendChild(item);
    });

    updatePatientSelect();
  }

  function renderDiabetesSummary() {
    if (!diabetesAvg || !diabetesLatest || !diabetesRange) return;

    if (!diabetesLogs.length) {
      diabetesAvg.textContent = '--';
      diabetesLatest.textContent = '--';
      diabetesRange.textContent = '--';
      return;
    }

    var total = 0;
    var inRangeCount = 0;

    diabetesLogs.forEach(function (log) {
      total += toNum(log.glucose, 0);
      if (log.glucose >= 70 && log.glucose <= 180) {
        inRangeCount += 1;
      }
    });

    var avg = Math.round(total / diabetesLogs.length);
    var latest = diabetesLogs[0];
    var rangePct = Math.round((inRangeCount / diabetesLogs.length) * 100);

    diabetesAvg.textContent = avg + ' mg/dL';
    diabetesLatest.textContent = latest.glucose + ' mg/dL';
    diabetesRange.textContent = rangePct + '%';
  }

  function renderDiabetesLogs() {
    if (!diabetesList) return;
    diabetesList.innerHTML = '';

    if (!diabetesLogs.length) {
      diabetesList.innerHTML = "<div class='notice'>No diabetes readings logged.</div>";
      renderDiabetesSummary();
      return;
    }

    diabetesLogs.forEach(function (log) {
      var status = getGlucoseStatus(log.glucose);
      var insulinText = log.insulinUnits === null || log.insulinUnits === undefined ? 'No insulin logged' : 'Insulin ' + log.insulinUnits + ' units';
      var patientText = patientLabelById(log.patientId);

      var item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML =
        '<div><strong>' +
        log.glucose +
        ' mg/dL (' +
        status +
        ")</strong><div class='legend meta-line'>" +
        log.mealTag +
        ' | ' +
        formatDateTime(log.timestamp) +
        "</div><div class='legend meta-line'>" +
        patientText +
        ' | ' +
        insulinText +
        (log.notes ? ' | ' + log.notes : '') +
        '</div></div>' +
        "<div><button class='btn btn-soft' data-action='delete-diabetes' data-id='" +
        log.id +
        "'>Delete</button></div>";
      diabetesList.appendChild(item);
    });

    renderDiabetesSummary();
  }

  function updateHabitsUi() {
    var total = 0;
    var done = 0;

    habitChecks.forEach(function (check) {
      total += 1;
      var key = check.getAttribute('data-habit');
      var checked = Boolean(todayHabits[key]);
      check.checked = checked;
      if (checked) done += 1;
    });

    var pct = total ? Math.round((done / total) * 100) : 0;
    if (habitProgress) habitProgress.style.width = pct + '%';
    if (habitText) habitText.textContent = done + '/' + total + ' habits complete (' + pct + '%)';
  }

  async function setHabitValue(key, value) {
    todayHabits[key] = value;
    updateHabitsUi();

    try {
      await window.HealthApi.care.setHabits(getTodayKey(), todayHabits);
    } catch (error) {
      window.alert(error.message);
    }
  }

  function findNextMedication() {
    if (!medications.length) {
      return 'No medications configured.';
    }

    var now = new Date();
    var today = now.toISOString().slice(0, 10);
    var soonest = null;

    medications.forEach(function (med) {
      var timeParts = String(med.time || '08:00').split(':');
      var target = new Date(today + 'T' + timeParts[0].padStart(2, '0') + ':' + (timeParts[1] || '00').padStart(2, '0') + ':00');
      if (target.getTime() < now.getTime()) {
        target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
      }
      if (!soonest || target.getTime() < soonest.target.getTime()) {
        soonest = { med: med, target: target };
      }
    });

    if (!soonest) {
      return 'No reminder available.';
    }

    var mins = Math.round((soonest.target.getTime() - now.getTime()) / 60000);
    return soonest.med.name + ' (' + soonest.med.dosage + ') due in about ' + mins + ' minutes.';
  }

  async function loadMedications() {
    var response = await window.HealthApi.care.listMedications();
    medications = (response && response.medications) || [];
    renderMeds();
    if (reminderOutput) reminderOutput.textContent = findNextMedication();
  }

  async function loadAppointments() {
    var response = await window.HealthApi.care.listAppointments();
    appointments = ((response && response.appointments) || []).sort(function (a, b) {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    renderAppointments();
  }

  async function loadPatients() {
    var response = await window.HealthApi.care.listPatients();
    patients = ((response && response.patients) || []).slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    renderPatients();
  }

  async function loadDiabetesLogs() {
    var response = await window.HealthApi.care.listDiabetes();
    diabetesLogs = ((response && response.logs) || []).slice().sort(function (a, b) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    renderDiabetesLogs();
  }

  async function loadHabits() {
    var response = await window.HealthApi.care.getHabits(getTodayKey());
    todayHabits = (response && response.values) || {};
    updateHabitsUi();
  }

  if (medForm) {
    medForm.addEventListener('submit', async function (event) {
      event.preventDefault();

      try {
        await window.HealthApi.care.addMedication({
          name: medForm.medName.value.trim(),
          dosage: medForm.dosage.value.trim(),
          time: medForm.time.value,
          frequency: medForm.frequency.value
        });

        medForm.reset();
        await loadMedications();
      } catch (error) {
        window.alert(error.message);
      }
    });

    medList.addEventListener('click', async function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      var action = target.getAttribute('data-action');
      var id = target.getAttribute('data-id');
      if (!action || !id) return;

      try {
        if (action === 'delete-med') {
          await window.HealthApi.care.deleteMedication(id);
        }

        if (action === 'toggle-med') {
          await window.HealthApi.care.toggleMedication(id);
        }

        await loadMedications();
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  if (appForm) {
    appForm.addEventListener('submit', async function (event) {
      event.preventDefault();

      try {
        await window.HealthApi.care.addAppointment({
          title: appForm.title.value.trim(),
          doctor: appForm.doctor.value.trim(),
          specialty: appForm.appointmentSpecialty ? appForm.appointmentSpecialty.value : '',
          date: new Date(appForm.date.value).toISOString(),
          type: appForm.type.value
        });

        appForm.reset();
        await loadAppointments();
      } catch (error) {
        window.alert(error.message);
      }
    });

    appList.addEventListener('click', async function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      var action = target.getAttribute('data-action');
      var id = target.getAttribute('data-id');
      if (action !== 'delete-app' || !id) return;

      try {
        await window.HealthApi.care.deleteAppointment(id);
        await loadAppointments();
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  if (patientForm) {
    patientForm.addEventListener('submit', async function (event) {
      event.preventDefault();

      try {
        await window.HealthApi.care.addPatient({
          name: patientForm.patientName.value.trim(),
          age: patientForm.patientAge.value ? Number(patientForm.patientAge.value) : null,
          condition: patientForm.patientCondition.value.trim(),
          notes: patientForm.patientNotes.value.trim()
        });

        patientForm.reset();
        await loadPatients();
        await loadDiabetesLogs();
      } catch (error) {
        window.alert(error.message);
      }
    });

    patientList.addEventListener('click', async function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      var action = target.getAttribute('data-action');
      var id = target.getAttribute('data-id');
      if (action !== 'delete-patient' || !id) return;

      try {
        await window.HealthApi.care.deletePatient(id);
        await Promise.all([loadPatients(), loadDiabetesLogs()]);
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  if (diabetesForm) {
    diabetesForm.addEventListener('submit', async function (event) {
      event.preventDefault();

      try {
        await window.HealthApi.care.addDiabetes({
          patientId: diabetesForm.diabetesPatient.value || null,
          timestamp: diabetesForm.diabetesTimestamp.value ? new Date(diabetesForm.diabetesTimestamp.value).toISOString() : new Date().toISOString(),
          glucose: Number(diabetesForm.diabetesGlucose.value),
          mealTag: diabetesForm.diabetesMealTag.value,
          insulinUnits: diabetesForm.diabetesInsulin.value ? Number(diabetesForm.diabetesInsulin.value) : null,
          notes: diabetesForm.diabetesNotes.value.trim()
        });

        var selectedPatient = diabetesForm.diabetesPatient.value;
        diabetesForm.reset();
        diabetesForm.diabetesTimestamp.value = toLocalInputValue(new Date());
        diabetesForm.diabetesPatient.value = selectedPatient;
        await loadDiabetesLogs();
      } catch (error) {
        window.alert(error.message);
      }
    });

    diabetesList.addEventListener('click', async function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      var action = target.getAttribute('data-action');
      var id = target.getAttribute('data-id');
      if (action !== 'delete-diabetes' || !id) return;

      try {
        await window.HealthApi.care.deleteDiabetes(id);
        await loadDiabetesLogs();
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  habitChecks.forEach(function (check) {
    check.addEventListener('change', function () {
      var key = check.getAttribute('data-habit');
      setHabitValue(key, check.checked);
    });
  });

  if (reminderBtn) {
    reminderBtn.addEventListener('click', function () {
      if (reminderOutput) {
        reminderOutput.textContent = findNextMedication();
      }
    });
  }

  if (diabetesTimestampInput) {
    diabetesTimestampInput.value = toLocalInputValue(new Date());
  }

  Promise.all([loadMedications(), loadAppointments(), loadPatients(), loadDiabetesLogs(), loadHabits()]).catch(function (error) {
    window.alert(error.message);
  });
})();
