import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const configure = () => {
  if (!configured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:notifications@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
};
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || '';
export const sendPushNotification = async ({ recipient, subject, message, transfer }) => {
  if (!configure()) return;
  const subscriptions = await PushSubscription.find({ user: recipient._id });
  const target = transfer?.destinationLocation === recipient.location ? 'incoming' : recipient.location?.trim().toLowerCase() === 'head office' && ['awaiting_head_office', 'invoice_uploaded'].includes(transfer?.status) ? 'invoiceRequests' : 'transport';
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification(subscription.toObject(), JSON.stringify({ title: subject, body: message, url: `/?page=${target}&transfer=${transfer?._id || ''}` }));
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) await PushSubscription.deleteOne({ _id: subscription._id });
      else console.error('Could not send push notification:', error.message);
    }
  }));
};
