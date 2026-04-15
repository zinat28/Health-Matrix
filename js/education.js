(function () {
  var filterButtons = document.querySelectorAll("button[data-filter]");
  var resourceCards = document.querySelectorAll(".resource-card");
  var quizForm = document.getElementById("quizForm");
  var quizResult = document.getElementById("quizResult");
  var accordionButtons = document.querySelectorAll(".accordion-btn");

  function applyFilter(topic) {
    resourceCards.forEach(function (card) {
      var cardTopic = card.getAttribute("data-topic");
      var visible = topic === "all" || cardTopic === topic;
      card.classList.toggle("hidden", !visible);
    });

    filterButtons.forEach(function (btn) {
      var active = btn.getAttribute("data-filter") === topic;
      btn.classList.toggle("btn-primary", active);
      btn.classList.toggle("btn-soft", !active);
    });
  }

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      applyFilter(button.getAttribute("data-filter"));
    });
  });

  if (quizForm) {
    quizForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var questions = quizForm.querySelectorAll(".quiz-question");
      var correct = 0;
      var total = questions.length;

      questions.forEach(function (question) {
        var expected = question.getAttribute("data-answer");
        var checked = question.querySelector("input[type='radio']:checked");
        if (checked && checked.value === expected) {
          correct += 1;
        }
      });

      var pct = total ? Math.round((correct / total) * 100) : 0;
      var message = "Score: " + correct + "/" + total + " (" + pct + "%). ";
      if (pct >= 80) {
        message += "Strong understanding. Keep reviewing prevention habits.";
      } else if (pct >= 50) {
        message += "Solid baseline. Revisit blood pressure and symptom topics.";
      } else {
        message += "Needs refresh. Focus on emergency signs and risk factors.";
      }

      quizResult.textContent = message;
    });
  }

  accordionButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var targetId = button.getAttribute("data-target");
      var content = document.getElementById(targetId);
      if (!content) return;
      content.classList.toggle("hidden");
    });
  });

  applyFilter("all");
})();
