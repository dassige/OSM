// services/booking-notifier.js — sends booking invitations/reminders over email
// and WhatsApp. A member is contacted on a channel only when the admin ticked
// that channel AND the member's own notificationPreference includes it.
const config = require("../config");
const db = require("./db");
const mailer = require("./mailer");
const whatsappService = require("./whatsapp-service");
const logger = require("./logger");
const { formatBookingDates, memberChannels, bookingLink } = require("./booking-service");

/**
 * @param {object} event     parsed booking_events row
 * @param {Array}  invites   rows from db.getBookingInvites()
 * @param {object} channels  { email: bool, whatsapp: bool }
 * @param {string} baseUrl   e.g. https://host
 * @param {object} [opts]    { isReminder }
 * @returns {Promise<{emailSent:number, whatsappSent:number, whatsappQueued:number, failed:number, skipped:number, simulated:boolean}>}
 */
async function notifyBookingInvites(event, invites, channels, baseUrl, opts = {}) {
  const summary = { emailSent: 0, whatsappSent: 0, whatsappQueued: 0, failed: 0, skipped: 0, simulated: config.appMode === "demo" };
  const wantEmail = !!(channels && channels.email);
  const wantWa = !!(channels && channels.whatsapp) && !!config.enableWhatsApp;
  if (!wantEmail && !wantWa) {
    summary.skipped = invites.length;
    return summary;
  }

  const prefs = await db.getPreferences();
  let tpl = null;
  try {
    tpl = prefs.tpl_bookings ? JSON.parse(prefs.tpl_bookings) : null;
  } catch {
    tpl = null;
  }

  const slots = await db.getBookingSlots(event.id);
  const details = {
    eventName: event.name,
    dates: formatBookingDates(slots.map((s) => s.slot_date), config.locale),
    location: event.location || "",
    accessType: event.access_type,
    isReminder: !!opts.isReminder,
  };
  const appName = config.ui && config.ui.loginTitle;

  for (const invite of invites) {
    const pref = memberChannels(invite.notification_preference);
    const link = bookingLink(baseUrl, event.public_id, event.access_type === "personal" ? invite.access_code : null);
    const memberDetails = { ...details, link };
    const used = [];

    if (wantEmail && pref.email && invite.email) {
      try {
        if (!summary.simulated) {
          await mailer.sendBookingInvitation(invite.email, invite, memberDetails, config.transporter, appName, tpl);
        }
        summary.emailSent++;
        used.push("email");
      } catch (e) {
        summary.failed++;
        logger.error("[Bookings] Invitation email failed", { eventId: event.id, memberId: invite.member_id, error: e.message });
      }
    }

    if (wantWa && pref.whatsapp && invite.mobile) {
      try {
        let sent = true;
        if (!summary.simulated) {
          const text = mailer.buildBookingWhatsAppMessage(invite, memberDetails, appName, tpl);
          sent = await whatsappService.sendMessage(invite.mobile, text);
        }
        if (sent === false) summary.whatsappQueued++;
        else summary.whatsappSent++;
        used.push("whatsapp");
      } catch (e) {
        summary.failed++;
        logger.error("[Bookings] Invitation WhatsApp failed", { eventId: event.id, memberId: invite.member_id, error: e.message });
      }
    }

    if (used.length === 0) {
      summary.skipped++;
    } else if (!summary.simulated) {
      await db.markBookingInviteNotified(invite.invite_id, used.join(","));
    }
  }

  logger.info("[Bookings] Notifications processed", { eventId: event.id, reminder: !!opts.isReminder, ...summary });
  return summary;
}

module.exports = { notifyBookingInvites };
