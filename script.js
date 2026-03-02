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
