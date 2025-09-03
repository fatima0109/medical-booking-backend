const cron = require('node-cron');
const NotificationService = require('./notificationService');

const startCronJobs = () => {
  // Run every 5 minutes to check for upcoming appointments - WITH EVENT LOOP YIELDING
  cron.schedule('*/5 * * * *', () => {
    // YIELD EVENT LOOP IMMEDIATELY - CRUCIAL FOR PREVENTING BLOCKING
    setTimeout(async () => {
      try {
        console.log('Running appointment notification check...');
        await NotificationService.sendUpcomingAppointmentNotifications();
      } catch (error) {
        console.error('Cron job error:', error);
      }
    }, 0);
  });

  // Add other cron jobs here if needed, but keep them minimal
  // For example, retry failed notifications every hour:
  cron.schedule('0 * * * *', () => {
    setTimeout(async () => {
      try {
        console.log('Running failed notifications retry...');
        await NotificationService.retryFailedNotifications();
      } catch (error) {
        console.error('Retry cron job error:', error);
      }
    }, 0);
  });

  console.log('Cron jobs started');
};

// Optional: Add error handling for the cron scheduler itself
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in cron job:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { startCronJobs };