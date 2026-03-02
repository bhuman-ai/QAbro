const OPEN_BETA_LAUNCH = new Date("2026-03-30T16:00:00-04:00").getTime();

const timeTargets = {
  days: document.getElementById("days"),
  hours: document.getElementById("hours"),
  minutes: document.getElementById("minutes"),
  seconds: document.getElementById("seconds")
};

const statusPill = document.querySelector(".status-pill");
const ctaHeading = document.querySelector(".cta-panel h2");
const year = document.getElementById("year");
const waitlistForms = Array.from(document.querySelectorAll(".waitlist-form"));

function format(value) {
  return String(value).padStart(2, "0");
}

function setTimerValues(msLeft) {
  if (msLeft <= 0) {
    timeTargets.days.textContent = "00";
    timeTargets.hours.textContent = "00";
    timeTargets.minutes.textContent = "00";
    timeTargets.seconds.textContent = "00";
    statusPill.innerHTML = '<span class="dot"></span>Open beta is now live';
    ctaHeading.textContent = "Open beta is live";
    return;
  }

  const day = 1000 * 60 * 60 * 24;
  const hour = 1000 * 60 * 60;
  const minute = 1000 * 60;

  const days = Math.floor(msLeft / day);
  const hours = Math.floor((msLeft % day) / hour);
  const minutes = Math.floor((msLeft % hour) / minute);
  const seconds = Math.floor((msLeft % minute) / 1000);

  timeTargets.days.textContent = format(days);
  timeTargets.hours.textContent = format(hours);
  timeTargets.minutes.textContent = format(minutes);
  timeTargets.seconds.textContent = format(seconds);
}

function tick() {
  const now = Date.now();
  const msLeft = OPEN_BETA_LAUNCH - now;
  setTimerValues(msLeft);
}

tick();
setInterval(tick, 1000);

year.textContent = new Date().getFullYear();

function showFormMessage(form, message, isError) {
  let feedback = form.nextElementSibling;
  if (!feedback || !feedback.classList.contains("form-feedback")) {
    feedback = document.createElement("p");
    feedback.className = "form-feedback";
    feedback.style.marginTop = "10px";
    feedback.style.fontSize = "12px";
    feedback.style.color = "hsl(var(--muted-foreground))";
    form.insertAdjacentElement("afterend", feedback);
  }

  feedback.textContent = message;
  feedback.style.color = isError ? "#f87171" : "hsl(var(--primary))";
}

async function submitWaitlist(email, source) {
  const response = await fetch("/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, source })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not join waitlist");
  }
}

waitlistForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = form.querySelector("input[type='email']");
    const button = form.querySelector("button[type='submit']");
    if (!input || !button) return;

    const email = String(input.value || "").trim().toLowerCase();
    const source = form.getAttribute("data-source") || "website";
    const originalButtonText = button.textContent;

    if (!email) {
      showFormMessage(form, "Enter a valid email address.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Joining...";
    button.style.opacity = "0.75";

    try {
      await submitWaitlist(email, source);
      input.value = "";
      showFormMessage(form, "You are on the waitlist.", false);
      button.textContent = "Joined";
      setTimeout(() => {
        button.textContent = originalButtonText;
        button.disabled = false;
        button.style.opacity = "1";
      }, 1500);
    } catch (error) {
      showFormMessage(form, "Could not join right now. Try again.", true);
      button.textContent = originalButtonText;
      button.disabled = false;
      button.style.opacity = "1";
    }
  });
});
