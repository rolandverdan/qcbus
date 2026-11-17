import {
  clearServiceAnnouncementRepo,
  formatServiceAnnouncementDateRange,
  getServiceAnnouncementDateInput,
  getServiceAnnouncementRepo,
  getTodayServiceAnnouncementDateInput,
  isServiceAnnouncementVisible,
  publishServiceAnnouncementRepo,
} from "../../shared/js/repositories/service-announcements.repo.js";

function escape(value) {
  return window.escapeHtml(String(value ?? ""));
}

Pages.announcements = async function () {
  let announcement;
  try {
    announcement = await getServiceAnnouncementRepo();
  } catch (error) {
    console.error("Could not load the service announcement:", error);
    return `
      <div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Could not load the announcement. Please try opening this page again.
      </div>
    `;
  }

  const today = getTodayServiceAnnouncementDateInput();
  const startDate = getServiceAnnouncementDateInput(announcement?.startAt) || today;
  const endDate = getServiceAnnouncementDateInput(announcement?.endAt) || today;
  const isVisible = isServiceAnnouncementVisible(announcement);
  const status = !announcement
    ? "No announcement published"
    : isVisible
      ? "Showing to commuters now"
      : announcement.active
        ? "Scheduled or outside its display dates"
        : "Announcement is inactive";

  return `
    <div class="space-y-4 slide-in">
      <section class="rounded-2xl bg-gradient-to-br from-qc-blue to-qc-blue-accent p-5 text-white shadow-lg">
        <p class="text-xs font-bold uppercase tracking-wider text-white/75">Commuter information</p>
        <h2 class="mt-1 text-xl font-bold">Service announcement</h2>
        <p class="mt-1 text-xs leading-5 text-white/80">
          Publish a notice for commuters when QCBus service is unavailable.
        </p>
      </section>

      <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">Current notice</h3>
            <p class="mt-0.5 text-xs text-gray-500">${escape(status)}</p>
          </div>
          ${announcement ? `
            <button type="button" onclick="window.clearServiceAnnouncement()"
              class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50">
              Clear notice
            </button>
          ` : ""}
        </div>
        ${announcement ? `
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p class="text-sm font-semibold text-amber-950">${escape(announcement.title)}</p>
            <p class="mt-1 whitespace-pre-line text-xs leading-5 text-amber-900">${escape(announcement.message)}</p>
            <p class="mt-2 text-[11px] font-semibold text-amber-800">
              ${escape(formatServiceAnnouncementDateRange(announcement.startAt, announcement.endAt))}
            </p>
          </div>
        ` : `
          <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500">
            There is no service announcement at the moment.
          </div>
        `}
      </section>

      <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h3 class="text-sm font-semibold text-gray-800">${announcement ? "Publish an update" : "Create an announcement"}</h3>
        <form class="mt-3 space-y-3" onsubmit="window.publishServiceAnnouncement(event)">
          <label class="block">
            <span class="mb-1 block text-xs font-semibold text-gray-700">Headline</span>
            <input name="title" type="text" required maxlength="100"
              value="${escape(announcement?.title || "QCBus is not operating today")}"
              class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-qc-blue focus:ring-1 focus:ring-qc-blue">
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-semibold text-gray-700">Message for commuters</span>
            <textarea name="message" rows="4" required maxlength="500"
              class="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-qc-blue focus:ring-1 focus:ring-qc-blue"
              placeholder="Explain why service is unavailable or share other details.">${escape(announcement?.message || "")}</textarea>
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-xs font-semibold text-gray-700">Show from</span>
              <input name="startDate" type="date" required value="${escape(startDate)}"
                class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-qc-blue focus:ring-1 focus:ring-qc-blue">
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-semibold text-gray-700">Show through</span>
              <input name="endDate" type="date" required value="${escape(endDate)}"
                class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-qc-blue focus:ring-1 focus:ring-qc-blue">
            </label>
          </div>
          <div class="flex flex-col-reverse gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-[11px] leading-4 text-gray-500">The notice is visible to commuters only during these dates. It never changes bus or trip status.</p>
            <button type="submit"
              class="rounded-lg bg-qc-blue px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-qc-blue-accent">
              Publish notice
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
};

window.publishServiceAnnouncement = async function (event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  submitButton.disabled = true;

  try {
    await publishServiceAnnouncementRepo({
      title: formData.get("title"),
      message: formData.get("message"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
    });
    window.showToast("Announcement published", "success");
    await window.navigateTo("announcements");
  } catch (error) {
    console.error("Could not publish the service announcement:", error);
    window.showToast(error.message || "Could not publish the announcement", "error");
  } finally {
    submitButton.disabled = false;
  }
};

window.clearServiceAnnouncement = async function () {
  if (!window.confirm("Clear the commuter service announcement?")) return;
  try {
    await clearServiceAnnouncementRepo();
    window.showToast("Announcement cleared", "success");
    await window.navigateTo("announcements");
  } catch (error) {
    console.error("Could not clear the service announcement:", error);
    window.showToast("Could not clear the announcement", "error");
  }
};
