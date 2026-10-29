import { isHeadOffice as isHeadOfficeLocation } from "../config/headOffice.js";
import nodemailer from 'nodemailer';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendTextwareSms } from './sms.js';
import { sendPushNotification } from './push.js';

let transporter;

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const getTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
};

export const sendNotificationEmail = async ({ recipient, subject, message }) => {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn(`Email not sent (SMTP is not configured): ${subject} -> ${recipient.email}`);
    return;
  }
  await mailer.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: recipient.email,
    subject,
    text: `Hello ${recipient.name},\n\n${message}\n\nRLA Operations`,
    html: `<main style="font-family:Arial,sans-serif;color:#172138;max-width:560px;margin:auto"><h2 style="color:#167c67">RLA Operations update</h2><p>Hello ${escapeHtml(recipient.name)},</p><p>${escapeHtml(message)}</p><p style="color:#718096">This is an automated notification from RLA Operations.</p></main>`
  });
};

// Saves a personal dashboard alert and emails every active user at the affected location.
// Email delivery is deliberately non-blocking: an SMTP outage must not stop a transfer workflow.
export const notifyLocationUsers = async ({ location, message, subject = 'RLA Operations update', transfer, aod }) => {
  const recipients = await User.find({
    isActive: true,
    $or: [
      { location: isHeadOfficeLocation(location) ? /^\s*(head office|ho)\s*$/i : location },
      // Super admins have no assigned location in the default seed, but are the
      // responsible users for Head Office requests.
      ...(isHeadOfficeLocation(location) ? [{ role: 'super_admin' }] : [])
    ]
  }).select('name email mobileNumber location role');
  await Promise.all(recipients.map(async recipient => {
    await Notification.create({ user: recipient._id, location, message, transfer, aod });
    await Promise.all([
      sendNotificationEmail({ recipient, subject, message }).catch(error => console.error(`Could not send notification email to ${recipient.email}:`, error.message)),
      sendTextwareSms({ mobileNumber: recipient.mobileNumber, message: `RLA: ${message}` }).catch(error => console.error(`Could not send SMS to ${recipient.name}:`, error.message)),
      sendPushNotification({ recipient, subject, message, transfer }).catch(error => console.error(`Could not send push notification to ${recipient.name}:`, error.message))
    ]);
  }));
  return recipients.length;
};
